package analyzers

import (
	"github.com/LukasParke/gossip"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	operationDescriptionMeta = rules.RuleMeta{ID: "operation-description", Description: "Operations should have descriptions.", Severity: ctypes.SeverityWarning, Category: rules.CategoryDocumentation, Recommended: true, DocURL: rules.DocBaseURL + "operation-description"}
	operationTagsMeta        = rules.RuleMeta{ID: "operation-tags", Description: "Operations should have at least one tag.", Severity: ctypes.SeverityWarning, Category: rules.CategoryDocumentation, Recommended: true, DocURL: rules.DocBaseURL + "operation-tags"}
	operationOperationIDMeta = rules.RuleMeta{ID: "operation-operationId", Description: "Operations should have operationId.", Severity: ctypes.SeverityWarning, Category: rules.CategoryDocumentation, Recommended: true, DocURL: rules.DocBaseURL + "operation-operationId"}
	infoDescriptionMeta      = rules.RuleMeta{ID: "info-description", Description: "Info should have a description.", Severity: ctypes.SeverityWarning, Category: rules.CategoryDocumentation, Recommended: true, DocURL: rules.DocBaseURL + "info-description"}
	infoContactMeta          = rules.RuleMeta{ID: "info-contact", Description: "Info should have contact information.", Severity: ctypes.SeverityWarning, Category: rules.CategoryDocumentation, Recommended: true, DocURL: rules.DocBaseURL + "info-contact"}
	infoLicenseMeta          = rules.RuleMeta{ID: "info-license", Description: "Info should have license information.", Severity: ctypes.SeverityWarning, Category: rules.CategoryDocumentation, Recommended: true, DocURL: rules.DocBaseURL + "info-license"}
	tagDescriptionMeta       = rules.RuleMeta{ID: "tag-description", Description: "Tags should have descriptions.", Severity: ctypes.SeverityWarning, Category: rules.CategoryDocumentation, Recommended: true, DocURL: rules.DocBaseURL + "tag-description"}
	parameterDescriptionMeta = rules.RuleMeta{ID: "parameter-description", Description: "Parameters should have descriptions.", Severity: ctypes.SeverityWarning, Category: rules.CategoryDocumentation, Recommended: false, DocURL: rules.DocBaseURL + "parameter-description"}
	responseDescriptionMeta  = rules.RuleMeta{ID: "response-description", Description: "Responses should have descriptions.", Severity: ctypes.SeverityWarning, Category: rules.CategoryDocumentation, Recommended: true, DocURL: rules.DocBaseURL + "response-description"}
	schemaDescriptionMeta    = rules.RuleMeta{ID: "schema-description", Description: "Component schemas should have descriptions.", Severity: ctypes.SeverityWarning, Category: rules.CategoryDocumentation, Recommended: false, DocURL: rules.DocBaseURL + "schema-description"}
)

func registerExtendedAnalyzers(s *gossip.Server) {
	rules.Define("operation-description", operationDescriptionMeta).Operations(
		func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if op.Description.Text == "" {
				r.At(op.Loc, "Operation %s %s should have a description", method, path)
			}
		},
	).Register(s)

	rules.Define("operation-tags", operationTagsMeta).Operations(
		func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if len(op.Tags) == 0 {
				r.At(openapi.LocOrFallback(op.TagsLoc, op.Loc), "Operation %s %s should have at least one tag", method, path)
			}
		},
	).Register(s)

	rules.Define("operation-operationId", operationOperationIDMeta).Operations(
		func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if op.OperationID == "" {
				r.At(op.Loc, "Operation %s %s should have an operationId", method, path)
			}
		},
	).Register(s)

	rules.Define("info-description", infoDescriptionMeta).Info(
		func(info *openapi.Info, r *rules.Reporter) {
			if info.Description.Text == "" {
				r.At(info.Loc, "Info should have a description")
			}
		},
	).Register(s)

	rules.Define("info-contact", infoContactMeta).Info(
		func(info *openapi.Info, r *rules.Reporter) {
			if info.Contact == nil {
				r.At(info.Loc, "Info should have contact information")
			}
		},
	).Register(s)

	rules.Define("info-license", infoLicenseMeta).Info(
		func(info *openapi.Info, r *rules.Reporter) {
			if info.License == nil {
				r.At(info.Loc, "Info should have license information")
			}
		},
	).Register(s)

	rules.Define("tag-description", tagDescriptionMeta).Tags(
		func(tag *openapi.Tag, r *rules.Reporter) {
			if tag.Description.Text == "" {
				r.At(tag.Loc, "Tag '%s' should have a description", tag.Name)
			}
		},
	).Register(s)

	rules.Define("parameter-description", parameterDescriptionMeta).Operations(
		func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			for _, p := range op.Parameters {
				if p.Description.Text == "" && p.Ref == "" {
					r.At(p.Loc, "Parameter '%s' in %s %s should have a description", p.Name, method, path)
				}
			}
		},
	).Register(s)

	rules.Define("response-description", responseDescriptionMeta).Operations(
		func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			for code, resp := range op.Responses {
				if resp.Description.Text == "" && resp.Ref == "" {
					r.At(resp.Loc, "Response '%s' for %s %s should have a description", code, method, path)
				}
			}
		},
	).Register(s)

	rules.Define("schema-description", schemaDescriptionMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if name != "" && schema.Description.Text == "" && schema.Ref == "" {
				r.At(schema.Loc, "Schema '%s' should have a description", name)
			}
		},
	).Register(s)
}
