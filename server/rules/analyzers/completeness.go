package analyzers

import (
	"fmt"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	missingErrorResponsesMeta = rules.RuleMeta{
		ID:          "missing-error-responses",
		Description: "Operations should define at least one error response (4xx or 5xx).",
		Severity:    protocol.SeverityWarning,
		Category:    rules.CategoryStructure,
		Recommended: true,
		HowToFix:    "Add error response definitions (e.g., 400, 404, 500) to the operation.",
		DocURL:      rules.DocBaseURL + "missing-error-responses",
	}

	responseBodyOnDeleteMeta = rules.RuleMeta{
		ID:          "response-body-on-delete",
		Description: "DELETE operations typically should not return a response body.",
		Severity:    protocol.SeverityInformation,
		Category:    rules.CategoryStructure,
		Recommended: false,
		HowToFix:    "Use a 204 No Content response for DELETE operations.",
		DocURL:      rules.DocBaseURL + "response-body-on-delete",
	}

	requestBodyOnGetMeta = rules.RuleMeta{
		ID:          "no-request-body-on-get",
		Description: "GET and HEAD operations should not have request bodies.",
		Severity:    protocol.SeverityWarning,
		Category:    rules.CategoryStructure,
		Recommended: true,
		HowToFix:    "Remove the request body from the GET/HEAD operation. Use query parameters instead.",
		DocURL:      rules.DocBaseURL + "no-request-body-on-get",
	}

	missingPaginationMeta = rules.RuleMeta{
		ID:          "missing-pagination",
		Description: "List endpoints returning arrays should include pagination parameters.",
		Severity:    protocol.SeverityInformation,
		Category:    rules.CategoryStructure,
		Recommended: false,
		HowToFix:    "Add pagination query parameters (e.g., page, pageSize, limit, offset).",
		DocURL:      rules.DocBaseURL + "missing-pagination",
	}

	inconsistentErrorShapeMeta = rules.RuleMeta{
		ID:          "inconsistent-error-shape",
		Description: "Error responses should use a consistent schema across operations.",
		Severity:    protocol.SeverityInformation,
		Category:    rules.CategoryStructure,
		Recommended: false,
		HowToFix:    "Define a shared error schema in components and reference it in all error responses.",
		DocURL:      rules.DocBaseURL + "inconsistent-error-shape",
	}
)

func registerCompletenessAnalyzers(s *gossip.Server) {
	// Missing error responses
	rules.Define("missing-error-responses", missingErrorResponsesMeta).
		Operations(func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if len(op.Responses) == 0 {
				return
			}
			hasError := false
			for code := range op.Responses {
				if strings.HasPrefix(code, "4") || strings.HasPrefix(code, "5") || code == "default" {
					hasError = true
					break
				}
			}
			if !hasError {
				r.At(op.Loc, "Operation %s %s has no error responses (4xx/5xx)", strings.ToUpper(method), path)
			}
		}).
		Register(s)

	// Response body on DELETE
	rules.Define("response-body-on-delete", responseBodyOnDeleteMeta).
		Operations(func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if strings.ToUpper(method) != "DELETE" {
				return
			}
			for code, resp := range op.Responses {
				if code == "204" || strings.HasPrefix(code, "4") || strings.HasPrefix(code, "5") || code == "default" {
					continue
				}
				if len(resp.Content) > 0 {
					r.At(resp.Loc, "DELETE %s response %s has a response body; consider using 204 No Content", path, code)
				}
			}
		}).
		Register(s)

	// No request body on GET/HEAD
	rules.Define("no-request-body-on-get", requestBodyOnGetMeta).
		Operations(func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			m := strings.ToUpper(method)
			if m != "GET" && m != "HEAD" {
				return
			}
			if op.RequestBody != nil {
				r.At(op.RequestBody.Loc, "%s %s should not have a request body", m, path)
			}
		}).
		Register(s)

	// Missing pagination on list endpoints
	rules.Define("missing-pagination", missingPaginationMeta).
		Operations(func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if strings.ToUpper(method) != "GET" {
				return
			}
			// Check if any success response returns an array
			returnsArray := false
			for code, resp := range op.Responses {
				if !strings.HasPrefix(code, "2") {
					continue
				}
				for _, mt := range resp.Content {
					if mt.Schema != nil && mt.Schema.Type == "array" {
						returnsArray = true
						break
					}
				}
			}
			if !returnsArray {
				return
			}
			// Check for pagination parameters
			paginationNames := map[string]bool{
				"page": true, "pagesize": true, "page_size": true,
				"limit": true, "offset": true, "cursor": true,
				"after": true, "before": true, "per_page": true,
			}
			for _, p := range op.Parameters {
				if paginationNames[strings.ToLower(p.Name)] {
					return
				}
			}
			r.At(op.Loc, "GET %s returns an array but has no pagination parameters", path)
		}).
		Register(s)

	// Inconsistent error shape
	rules.Define("inconsistent-error-shape", inconsistentErrorShapeMeta).
		Custom(func(idx *openapi.Index, r *rules.Reporter) {
			// Collect error response schema refs/types across all operations
			type errorInfo struct {
				ref    string
				opDesc string
				loc    openapi.Loc
			}
			var errorSchemas []errorInfo

			for path, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					for code, resp := range mo.Operation.Responses {
						if !strings.HasPrefix(code, "4") && !strings.HasPrefix(code, "5") {
							continue
						}
						for _, mt := range resp.Content {
							if mt.Schema != nil {
								ref := mt.Schema.Ref
								if ref == "" {
									ref = fmt.Sprintf("inline(%s)", mt.Schema.Type)
								}
								errorSchemas = append(errorSchemas, errorInfo{
									ref:    ref,
									opDesc: fmt.Sprintf("%s %s (%s)", strings.ToUpper(mo.Method), path, code),
									loc:    resp.Loc,
								})
							}
						}
					}
				}
			}

			if len(errorSchemas) < 2 {
				return
			}

			// Check if they all use the same schema ref
			firstRef := errorSchemas[0].ref
			for _, info := range errorSchemas[1:] {
				if info.ref != firstRef {
					r.At(info.loc, "Error response in %s uses a different schema than other error responses", info.opDesc)
					return // Only report once
				}
			}
		}).
		Register(s)
}
