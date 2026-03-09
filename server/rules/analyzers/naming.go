package analyzers

import (
	"strings"

	"github.com/LukasParke/gossip"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	schemaNameCapitalMeta = rules.RuleMeta{
		ID:          "schema-name-capital",
		Description: "Schema names should start with an uppercase letter.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryNaming,
		Recommended: true,
		HowToFix:    "Rename the schema to start with a capital letter (e.g., 'pet' → 'Pet').",
		DocURL:      rules.DocBaseURL + "schema-name-capital",
	}

	exampleNameCapitalMeta = rules.RuleMeta{
		ID:          "example-name-capital",
		Description: "Example names should start with an uppercase letter.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryNaming,
		Recommended: true,
		HowToFix:    "Rename the example to start with a capital letter.",
		DocURL:      rules.DocBaseURL + "example-name-capital",
	}

	operationIDUniqueMeta = rules.RuleMeta{
		ID:          "operation-operationId-unique",
		Description: "Every operationId must be unique across the entire API.",
		Severity:    ctypes.SeverityError,
		Category:    rules.CategoryNaming,
		Recommended: true,
		HowToFix:    "Give each operation a unique operationId.",
		DocURL:      rules.DocBaseURL + "operation-operationId-unique",
	}

	tagsFormatMeta = rules.RuleMeta{
		ID:          "tags-format",
		Description: "Tags should follow a consistent naming format.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryNaming,
		Recommended: true,
		HowToFix:    "Use a consistent casing style for tag names.",
		DocURL:      rules.DocBaseURL + "tags-format",
	}
)

func registerNamingAnalyzers(s *gossip.Server) {
	rules.Define("schema-name-capital", schemaNameCapitalMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if name != "" && !isCapitalized(name) {
				r.At(schema.NameLoc, "Schema name '%s' should start with an uppercase letter", name)
			}
		},
	).Register(s)

	rules.Define("example-name-capital", exampleNameCapitalMeta).Examples(
		func(name string, ex *openapi.Example, r *rules.Reporter) {
			if !isCapitalized(name) {
				r.At(ex.Loc, "Example name '%s' should start with an uppercase letter", name)
			}
		},
	).Register(s)

	rules.Define("operation-operationId-unique", operationIDUniqueMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			type opInfo struct {
				loc  openapi.Loc
				desc string
			}
			seen := make(map[string]opInfo)
			for path, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					opID := mo.Operation.OperationID
					if opID == "" {
						continue
					}
					desc := strings.ToUpper(mo.Method) + " " + path
					if first, exists := seen[opID]; exists {
						r.WithRelated(first.loc, "", "First defined here at %s", first.desc).
							At(mo.Operation.OperationIDLoc, "operationId '%s' is already used at %s", opID, first.desc)
					} else {
						seen[opID] = opInfo{loc: mo.Operation.OperationIDLoc, desc: desc}
					}
				}
			}
		},
	).Register(s)

	rules.Define("tags-format", tagsFormatMeta).Tags(
		func(tag *openapi.Tag, r *rules.Reporter) {
			if tag.Name == "" {
				r.At(tag.Loc, "Tag name should not be empty")
			}
		},
	).Register(s)
}
