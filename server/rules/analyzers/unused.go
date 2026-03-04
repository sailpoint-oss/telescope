package analyzers

import (
	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var unusedComponentMeta = rules.RuleMeta{
	ID:          "unused-component",
	Description: "Components defined but never referenced are unnecessary.",
	Severity:    protocol.SeverityWarning,
	Category:    rules.CategoryStructure,
	Recommended: true,
	HowToFix:    "Remove the unused component or add a $ref that references it.",
	DocURL:      rules.DocBaseURL + "unused-component",
}

func registerUnusedComponentAnalyzers(s *gossip.Server) {
	rules.Define("unused-component", unusedComponentMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.Components == nil {
				return
			}

			type componentInfo struct {
				kind string
				name string
				loc  openapi.Loc
			}

			var components []componentInfo

			for name, schema := range idx.Document.Components.Schemas {
				components = append(components, componentInfo{"schemas", name, schema.NameLoc})
			}
			for name, resp := range idx.Document.Components.Responses {
				components = append(components, componentInfo{"responses", name, resp.Loc})
			}
			for name, param := range idx.Document.Components.Parameters {
				components = append(components, componentInfo{"parameters", name, param.Loc})
			}
			for name, ex := range idx.Document.Components.Examples {
				components = append(components, componentInfo{"examples", name, ex.Loc})
			}
			for name, rb := range idx.Document.Components.RequestBodies {
				components = append(components, componentInfo{"requestBodies", name, rb.Loc})
			}
			for name, h := range idx.Document.Components.Headers {
				components = append(components, componentInfo{"headers", name, h.Loc})
			}
			for name, ss := range idx.Document.Components.SecuritySchemes {
				components = append(components, componentInfo{"securitySchemes", name, ss.Loc})
			}
			for name, l := range idx.Document.Components.Links {
				components = append(components, componentInfo{"links", name, l.Loc})
			}

			for _, comp := range components {
				refPath := openapi.ComponentRefPath(comp.kind, comp.name)
				refs := idx.RefsTo(refPath)

				// Also check if security schemes are referenced in security requirements
				if comp.kind == "securitySchemes" && isSecuritySchemeUsed(comp.name, idx) {
					continue
				}

				if len(refs) == 0 {
					loc := comp.loc
					if loc.Node == nil {
						loc = idx.Document.Loc
					}
					r.WithTags(protocol.DiagnosticTagUnnecessary).
						At(loc, "Component '%s/%s' is defined but never referenced", comp.kind, comp.name)
				}
			}
		},
	).Register(s)
}

// isSecuritySchemeUsed checks if a security scheme is referenced in any security requirement.
func isSecuritySchemeUsed(name string, idx *openapi.Index) bool {
	for _, req := range idx.Document.Security {
		for _, entry := range req.Entries {
			if entry.Name == name {
				return true
			}
		}
	}
	for _, item := range idx.Document.Paths {
		for _, mo := range item.Operations() {
			for _, req := range mo.Operation.Security {
				for _, entry := range req.Entries {
					if entry.Name == name {
						return true
					}
				}
			}
		}
	}
	return false
}
