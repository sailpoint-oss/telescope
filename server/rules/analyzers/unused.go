package analyzers

import (
	"github.com/LukasParke/gossip"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var unusedComponentMeta = rules.RuleMeta{
	ID:          "unused-component",
	Description: "Components defined but never referenced are unnecessary.",
	Severity:    ctypes.SeverityWarning,
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
				components = append(components, componentInfo{"responses", name, openapi.LocOrFallback(resp.NameLoc, resp.Loc)})
			}
			for name, param := range idx.Document.Components.Parameters {
				components = append(components, componentInfo{"parameters", name, openapi.LocOrFallback(param.NameLoc, param.Loc)})
			}
			for name, ex := range idx.Document.Components.Examples {
				components = append(components, componentInfo{"examples", name, openapi.LocOrFallback(ex.NameLoc, ex.Loc)})
			}
			for name, rb := range idx.Document.Components.RequestBodies {
				components = append(components, componentInfo{"requestBodies", name, openapi.LocOrFallback(rb.NameLoc, rb.Loc)})
			}
			for name, h := range idx.Document.Components.Headers {
				components = append(components, componentInfo{"headers", name, openapi.LocOrFallback(h.NameLoc, h.Loc)})
			}
			for name, ss := range idx.Document.Components.SecuritySchemes {
				components = append(components, componentInfo{"securitySchemes", name, openapi.LocOrFallback(ss.NameLoc, ss.Loc)})
			}
			for name, l := range idx.Document.Components.Links {
				components = append(components, componentInfo{"links", name, openapi.LocOrFallback(l.NameLoc, l.Loc)})
			}

			for _, comp := range components {
				// Skip components that are $ref wrappers — cross-file usage
				// can't be tracked from the root file alone.
				if isRefWrapper(comp.kind, comp.name, idx) {
					continue
				}

				refPath := openapi.ComponentRefPath(comp.kind, comp.name)
				refs := idx.RefsTo(refPath)

				// Also check if security schemes are referenced in security requirements
				if comp.kind == "securitySchemes" && isSecuritySchemeUsed(comp.name, idx) {
					continue
				}

				if len(refs) == 0 {
					loc := comp.loc
					if loc.Node == nil {
						loc = openapi.Loc{Range: ctypes.FileStartRange}
					}
					r.WithTags(ctypes.DiagnosticTagUnnecessary).
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

// isRefWrapper checks if a component is just a $ref wrapper pointing to an external file.
// Such components can't have their cross-file usage tracked from the root file alone.
func isRefWrapper(kind, name string, idx *openapi.Index) bool {
	if idx.Document.Components == nil {
		return false
	}
	switch kind {
	case "securitySchemes":
		if ss, ok := idx.Document.Components.SecuritySchemes[name]; ok {
			return ss.Ref != ""
		}
	case "schemas":
		if s, ok := idx.Document.Components.Schemas[name]; ok {
			return s.Ref != ""
		}
	case "responses":
		if r, ok := idx.Document.Components.Responses[name]; ok {
			return r.Ref != ""
		}
	case "parameters":
		if p, ok := idx.Document.Components.Parameters[name]; ok {
			return p.Ref != ""
		}
	case "requestBodies":
		if rb, ok := idx.Document.Components.RequestBodies[name]; ok {
			return rb.Ref != ""
		}
	case "headers":
		if h, ok := idx.Document.Components.Headers[name]; ok {
			return h.Ref != ""
		}
	case "links":
		if l, ok := idx.Document.Components.Links[name]; ok {
			return l.Ref != ""
		}
	case "examples":
		if e, ok := idx.Document.Components.Examples[name]; ok {
			return e.Ref != ""
		}
	}
	return false
}
