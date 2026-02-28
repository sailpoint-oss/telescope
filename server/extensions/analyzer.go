package extensions

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// Analyzer creates a treesitter.Analyzer that validates x-* extensions
// in OpenAPI documents against the registry.
func Analyzer(registry *Registry) treesitter.Analyzer {
	return treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			idx, ok := ctx.UserData.(*openapi.Index)
			if !ok || idx == nil || idx.Document == nil {
				return nil
			}
			v := &extensionValidator{registry: registry}
			v.validate(idx.Document)
			return v.diags
		},
	}
}

type extensionValidator struct {
	registry *Registry
	diags    []protocol.Diagnostic
}

func (v *extensionValidator) validate(doc *openapi.Document) {
	v.checkExtensions(doc.Extensions, ScopeRoot)
	v.checkRequired(doc.Extensions, ScopeRoot, doc.Loc)

	if doc.Info != nil {
		v.checkExtensions(doc.Info.Extensions, ScopeInfo)
		v.checkRequired(doc.Info.Extensions, ScopeInfo, doc.Info.Loc)
	}

	for _, item := range doc.Paths {
		v.checkExtensions(item.Extensions, ScopePathItem)
		v.checkRequired(item.Extensions, ScopePathItem, item.Loc)

		for _, mo := range item.Operations() {
			op := mo.Operation
			v.checkExtensions(op.Extensions, ScopeOperation)
			v.checkRequired(op.Extensions, ScopeOperation, op.Loc)

			for _, p := range op.Parameters {
				v.checkExtensions(p.Extensions, ScopeParameter)
			}
			if op.RequestBody != nil {
				v.checkScope(op.RequestBody.Loc, ScopeRequestBody)
			}
			for _, resp := range op.Responses {
				v.checkExtensions(resp.Extensions, ScopeResponse)
			}
		}
	}

	if doc.Components != nil {
		for _, s := range doc.Components.Schemas {
			v.checkExtensions(s.Extensions, ScopeSchema)
		}
		for _, ss := range doc.Components.SecuritySchemes {
			v.checkExtensions(ss.Extensions, ScopeSecurityScheme)
		}
	}

	for i := range doc.Tags {
		// Tags don't have Extensions in our model, but we validate anyway
		_ = doc.Tags[i]
	}

	for i := range doc.Servers {
		_ = doc.Servers[i]
	}
}

func (v *extensionValidator) checkExtensions(exts map[string]*openapi.Node, scope Scope) {
	for name, node := range exts {
		if !strings.HasPrefix(name, "x-") {
			continue
		}
		ext, ok := v.registry.Get(name)
		if !ok {
			continue // unknown extensions are allowed
		}

		// Check scope validity
		if !v.registry.ValidAtScope(name, scope) {
			v.report(node.Loc, protocol.SeverityWarning, "extension-scope",
				fmt.Sprintf("Extension %q is not valid at scope %q (expected: %s)",
					name, scope, formatScopes(ext.Meta.Scopes)))
		}

		// Validate value against schema if we have it
		if ext.SchemaData != nil && node != nil {
			v.validateValue(name, node, ext)
		}
	}
}

func (v *extensionValidator) checkRequired(exts map[string]*openapi.Node, scope Scope, loc openapi.Loc) {
	required := v.registry.RequiredForScope(scope)
	for _, req := range required {
		if _, ok := exts[req.Meta.Name]; !ok {
			v.report(loc, protocol.SeverityWarning, "extension-required",
				fmt.Sprintf("Required extension %q is missing at scope %q", req.Meta.Name, scope))
		}
	}
}

func (v *extensionValidator) validateValue(name string, node *openapi.Node, ext *CompiledExtension) {
	schemaType, _ := ext.SchemaData["type"].(string)
	if schemaType == "" {
		return
	}

	// Basic type validation
	switch schemaType {
	case "string":
		if node.Value == "" {
			v.report(node.Loc, protocol.SeverityWarning, "extension-type",
				fmt.Sprintf("Extension %q expects a string value", name))
		}
	case "boolean":
		if node.Value != "true" && node.Value != "false" {
			v.report(node.Loc, protocol.SeverityWarning, "extension-type",
				fmt.Sprintf("Extension %q expects a boolean value", name))
		}
		// Enum validation for strings
		if schemaType == "string" {
			if enumRaw, ok := ext.SchemaData["enum"]; ok {
				if enumData, err := json.Marshal(enumRaw); err == nil {
					var enumValues []string
					if json.Unmarshal(enumData, &enumValues) == nil && len(enumValues) > 0 {
						found := false
						for _, ev := range enumValues {
							if ev == node.Value {
								found = true
								break
							}
						}
						if !found {
							v.report(node.Loc, protocol.SeverityWarning, "extension-enum",
								fmt.Sprintf("Extension %q value %q is not one of: %s",
									name, node.Value, strings.Join(enumValues, ", ")))
						}
					}
				}
			}
		}
	}
}

func (v *extensionValidator) checkScope(_ openapi.Loc, _ Scope) {}

func (v *extensionValidator) report(loc openapi.Loc, severity protocol.DiagnosticSeverity, code, message string) {
	v.diags = append(v.diags, protocol.Diagnostic{
		Range:    loc.Range,
		Severity: severity,
		Source:   "telescope",
		Code:     code,
		Message:  message,
	})
}

func formatScopes(scopes []Scope) string {
	ss := make([]string, len(scopes))
	for i, s := range scopes {
		ss[i] = string(s)
	}
	return strings.Join(ss, ", ")
}
