package analyzers

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/sailpoint-oss/barrelman"
	navigator "github.com/sailpoint-oss/navigator"
)

// --- filter-parameters-match-description -------------------------------------
//
// SailPoint API Guidelines recommend that `filters` query parameters document
// every supported field:operator pair in prose like
//
//   Filtering is supported for the following fields and operators:
//
//   **name**: *eq, ne*
//   **created**: *eq, ge, gt, le, lt*
//
// This rule is the static side of docs/pr-review-tooling.md gap #4. Today it
// enforces the conservative subset: a query parameter named "filters" MUST
// have a non-empty description AND the description MUST mention at least one
// operator, so parameters that advertise filtering without documenting what
// can be filtered are flagged. The runtime counterpart
// (api-schema-validator) keeps its unique role of checking whether what the
// prose promises actually works against a live tenant.

func filterParametersMatchDescriptionRule() barrelman.Rule {
	return barrelman.Rule{
		ID: "filter-parameters-match-description",
		Meta: barrelman.RuleMeta{
			ID:          "filter-parameters-match-description",
			Description: "Filter query parameters must document supported fields and operators.",
			Severity:    barrelman.SeverityWarning,
			Category:    barrelman.CategoryDocumentation,
			Recommended: true,
			Formats:     []navigator.Format{navigator.FormatOAS3},
		},
		Run: runFilterParametersMatchDescription,
	}
}

var filterOperatorRe = regexp.MustCompile(`\b(eq|ne|co|sw|ew|ge|gt|le|lt|pr|in|and|or|not)\b`)

func runFilterParametersMatchDescription(ctx *barrelman.AnalysisContext) []barrelman.Diagnostic {
	if ctx == nil || ctx.Index == nil || ctx.Index.Document == nil {
		return nil
	}
	var diags []barrelman.Diagnostic
	for _, pathItem := range ctx.Index.Document.Paths {
		if pathItem == nil {
			continue
		}
		diags = appendFilterParamDiagnostics(ctx, diags, pathItem.Parameters)
		for _, op := range []*navigator.Operation{
			pathItem.Get, pathItem.Put, pathItem.Post, pathItem.Delete,
			pathItem.Options, pathItem.Head, pathItem.Patch, pathItem.Trace,
		} {
			if op != nil {
				diags = appendFilterParamDiagnostics(ctx, diags, op.Parameters)
			}
		}
	}
	// Also walk the components registry so reusable filter parameters are
	// validated once even when they're not referenced from an operation in
	// this file.
	for _, param := range ctx.Index.Parameters {
		diags = appendFilterParamDiagnostic(ctx, diags, param)
	}
	return diags
}

func appendFilterParamDiagnostics(
	ctx *barrelman.AnalysisContext,
	diags []barrelman.Diagnostic,
	params []*navigator.Parameter,
) []barrelman.Diagnostic {
	for _, p := range params {
		diags = appendFilterParamDiagnostic(ctx, diags, p)
	}
	return diags
}

func appendFilterParamDiagnostic(
	ctx *barrelman.AnalysisContext,
	diags []barrelman.Diagnostic,
	p *navigator.Parameter,
) []barrelman.Diagnostic {
	if p == nil {
		return diags
	}
	if !strings.EqualFold(p.In, "query") {
		return diags
	}
	if !strings.EqualFold(strings.TrimSpace(p.Name), "filters") {
		return diags
	}
	desc := strings.TrimSpace(descriptionText(p.Description))
	if desc == "" {
		return append(diags, barrelman.Diagnostic{
			URI:      ctx.URI,
			Range:    rangeFromLoc(p.Loc),
			Severity: barrelman.SeverityWarning,
			Code:     "filter-parameters-match-description",
			Source:   "telescope",
			Message:  "Filter query parameter 'filters' must describe supported fields and operators",
		})
	}
	// If the description never mentions a SCIM-style operator, it's unlikely
	// to actually enumerate filterable fields. We don't attempt full
	// field↔operator parsing yet (tracked in pr-review-tooling.md gap #4);
	// this heuristic catches the "filters supported but no detail" case
	// without false-flagging documentation that simply uses prose.
	if !filterOperatorRe.MatchString(desc) {
		return append(diags, barrelman.Diagnostic{
			URI:      ctx.URI,
			Range:    rangeFromLoc(p.Loc),
			Severity: barrelman.SeverityWarning,
			Code:     "filter-parameters-match-description",
			Source:   "telescope",
			Message:  "Filter query parameter description does not list any filter operators (eq, ge, gt, le, lt, …)",
		})
	}
	return diags
}

// descriptionText extracts the text from navigator's DescriptionValue, which
// carries source-location metadata alongside the string.
func descriptionText(d navigator.DescriptionValue) string {
	return d.Text
}

// --- sp-new-paths-in-newest-version-only -------------------------------------
//
// SailPoint policy: new endpoints land in the newest version directory only,
// never in older /v3, /v2024, /v2025, etc. This is what cloud-api-client-common
// currently enforces with a bespoke `.github/workflows/invalid-paths.yml`
// (Python + deepdiff).
//
// The rule reads the active version segment from the env
// TELESCOPE_NEWEST_VERSION_SEGMENT (a single path component like "v2026")
// and flags paths that reference files under a DIFFERENT version segment
// but that also appear at a segment depth matching the version layout.
// Files outside that layout (e.g. `api-route-specs/*.yaml`) are ignored.
//
// If the env var is unset the rule is a no-op, preserving backward compat.

func newPathsInNewestVersionRule() barrelman.Rule {
	return barrelman.Rule{
		ID: "sp-new-paths-in-newest-version-only",
		Meta: barrelman.RuleMeta{
			ID:          "sp-new-paths-in-newest-version-only",
			Description: "New paths must land in the newest version directory (configurable).",
			Severity:    barrelman.SeverityError,
			Category:    barrelman.CategoryStructure,
			Recommended: true,
			Formats:     []navigator.Format{navigator.FormatOAS3},
		},
		Run: runNewPathsInNewestVersion,
	}
}

func runNewPathsInNewestVersion(ctx *barrelman.AnalysisContext) []barrelman.Diagnostic {
	if ctx == nil || ctx.Index == nil || ctx.Index.Document == nil {
		return nil
	}
	newest := strings.TrimSpace(os.Getenv("TELESCOPE_NEWEST_VERSION_SEGMENT"))
	if newest == "" {
		return nil
	}
	var diags []barrelman.Diagnostic
	for pathStr, pathItem := range ctx.Index.Document.Paths {
		if pathItem == nil {
			continue
		}
		// The pathItem may reference a file via Ref; when it does, inspect
		// the referenced file's version segment.
		target := strings.TrimSpace(pathItem.Ref)
		if target == "" {
			continue
		}
		seg, ok := versionSegment(target)
		if !ok {
			continue
		}
		if seg == newest {
			continue
		}
		diags = append(diags, barrelman.Diagnostic{
			URI:      ctx.URI,
			Range:    rangeFromLoc(pathItem.Loc),
			Severity: barrelman.SeverityError,
			Code:     "sp-new-paths-in-newest-version-only",
			Source:   "telescope",
			Message: fmt.Sprintf(
				"Path %q references %s which is not in the newest version directory %q",
				pathStr, target, newest,
			),
		})
	}
	return diags
}

// versionSegment looks at a relative $ref like
//   ../v2024/paths/accounts.yaml
// and returns ("v2024", true). Accepts v<YYYY>, v2, v3 (digit-prefixed
// single-word path segments). Returns false when the path does not contain
// such a segment.
var versionSegmentRe = regexp.MustCompile(`^v(?:\d{4}|\d+(?:beta)?)$`)

func versionSegment(ref string) (string, bool) {
	// Strip leading ../ and the filename. We want the last directory-like
	// segment that matches versionSegmentRe.
	clean := filepath.ToSlash(ref)
	parts := strings.Split(clean, "/")
	for _, p := range parts {
		if versionSegmentRe.MatchString(p) {
			return p, true
		}
	}
	return "", false
}
