package analyzers

import (
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/sailpoint-oss/barrelman"
	navigator "github.com/sailpoint-oss/navigator"
)

// exampleMatchesFormatRule asserts that every schema which declares a well-known
// string format (date-time, date, time, uuid, email, uri, ipv4, ipv6) has an
// example/default whose value actually conforms to that format.
//
// This rule exists because the Bugbot-class bug on cloud-api-client-common
// PR #2699 (see docs/pr-review-tooling.md gap #1) produced examples like
// `created: {}` after a YAML round-trip silently reinterpreted ISO-8601
// strings as native timestamps. The example was valid YAML and valid JSON —
// just semantically broken — so Barrelman's existing string-heuristic
// examples analyzer did not flag it.
//
// The rule emits `example-matches-format` diagnostics at the example location,
// with guideline-link data pointing at the SailPoint API Guidelines entry for
// examples.
func exampleMatchesFormatRule() barrelman.Rule {
	return barrelman.Rule{
		ID: "example-matches-format",
		Meta: barrelman.RuleMeta{
			ID:          "example-matches-format",
			Description: "Schema examples must satisfy the declared format.",
			Severity:    barrelman.SeverityError,
			Category:    barrelman.CategoryTypes,
			Recommended: true,
			Formats:     []navigator.Format{navigator.FormatOAS3},
		},
		Run: runExampleMatchesFormat,
	}
}

func runExampleMatchesFormat(ctx *barrelman.AnalysisContext) []barrelman.Diagnostic {
	if ctx == nil || ctx.Index == nil {
		return nil
	}
	var diags []barrelman.Diagnostic
	visited := make(map[*navigator.Schema]struct{})
	for _, schema := range ctx.Index.Schemas {
		diags = appendExampleFormatDiagnostics(ctx, schema, diags, visited)
	}
	return diags
}

// appendExampleFormatDiagnostics descends a schema tree (components, allOf,
// oneOf, anyOf, properties, items) to catch examples anywhere, not just the
// top level of each named component.
func appendExampleFormatDiagnostics(
	ctx *barrelman.AnalysisContext,
	schema *navigator.Schema,
	diags []barrelman.Diagnostic,
	visited map[*navigator.Schema]struct{},
) []barrelman.Diagnostic {
	if schema == nil {
		return diags
	}
	if _, seen := visited[schema]; seen {
		return diags
	}
	visited[schema] = struct{}{}

	if schema.Example != nil {
		if msg, ok := checkFormat(schema.Format, schema.Example.Value); !ok {
			diags = append(diags, barrelman.Diagnostic{
				URI:      ctx.URI,
				Range:    rangeFromLoc(schema.Example.Loc),
				Severity: barrelman.SeverityError,
				Code:     "example-matches-format",
				Source:   "telescope",
				Message:  msg,
			})
		}
	}

	for _, sub := range schema.AllOf {
		diags = appendExampleFormatDiagnostics(ctx, sub, diags, visited)
	}
	for _, sub := range schema.OneOf {
		diags = appendExampleFormatDiagnostics(ctx, sub, diags, visited)
	}
	for _, sub := range schema.AnyOf {
		diags = appendExampleFormatDiagnostics(ctx, sub, diags, visited)
	}
	for _, sub := range schema.Properties {
		diags = appendExampleFormatDiagnostics(ctx, sub, diags, visited)
	}
	if schema.Items != nil {
		diags = appendExampleFormatDiagnostics(ctx, schema.Items, diags, visited)
	}
	if schema.AdditionalProperties != nil {
		diags = appendExampleFormatDiagnostics(ctx, schema.AdditionalProperties, diags, visited)
	}
	return diags
}

// rangeFromLoc converts navigator's Loc to barrelman's Range without pulling in
// the full adapt package (kept local so this analyzer is self-contained).
func rangeFromLoc(loc navigator.Loc) barrelman.Range {
	r := loc.Range
	return barrelman.Range{
		Start: barrelman.Position{Line: uint32(r.Start.Line), Character: uint32(r.Start.Character)},
		End:   barrelman.Position{Line: uint32(r.End.Line), Character: uint32(r.End.Character)},
	}
}

// checkFormat validates that value satisfies the declared OpenAPI string
// format. It is intentionally liberal: an empty value, empty format, or a
// format we don't recognize is treated as OK so this rule never fires on
// schemas outside the well-known set. The comparison is string-based — when
// a YAML round-trip has replaced the original string with a non-string (for
// example `created: {}`), navigator's Example.Value is empty or whitespace,
// which we explicitly flag as "not a string".
func checkFormat(format, value string) (string, bool) {
	f := strings.ToLower(strings.TrimSpace(format))
	if f == "" {
		return "", true
	}
	validator, known := formatValidators[f]
	if !known {
		return "", true
	}
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return fmt.Sprintf(
			"example for format %q is empty or a non-string YAML node; expected a string that parses as %s",
			format, f,
		), false
	}
	// Examples can arrive quoted when the schema author wrote `example: "…"`.
	// Strip matching surrounding quotes before validating.
	trimmed = unwrapQuoted(trimmed)
	if !validator(trimmed) {
		return fmt.Sprintf(
			"example %q does not satisfy format %q",
			trimmed, format,
		), false
	}
	return "", true
}

func unwrapQuoted(s string) string {
	if len(s) < 2 {
		return s
	}
	first, last := s[0], s[len(s)-1]
	if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
		return s[1 : len(s)-1]
	}
	return s
}

var formatValidators = map[string]func(string) bool{
	"date-time": isRFC3339DateTime,
	"date":      isRFC3339Date,
	"time":      isRFC3339Time,
	"uuid":      isUUID,
	"email":     isEmail,
	"uri":       isURI,
	"url":       isURI, // legacy alias seen in some specs
	"hostname":  isHostname,
	"ipv4":      isIPv4,
	"ipv6":      isIPv6,
}

func isRFC3339DateTime(s string) bool {
	if _, err := time.Parse(time.RFC3339, s); err == nil {
		return true
	}
	if _, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return true
	}
	return false
}

func isRFC3339Date(s string) bool {
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

func isRFC3339Time(s string) bool {
	layouts := []string{"15:04:05Z07:00", "15:04:05.999999999Z07:00", "15:04:05"}
	for _, layout := range layouts {
		if _, err := time.Parse(layout, s); err == nil {
			return true
		}
	}
	return false
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func isUUID(s string) bool { return uuidRe.MatchString(s) }

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

func isEmail(s string) bool { return emailRe.MatchString(s) }

func isURI(s string) bool {
	u, err := url.Parse(s)
	return err == nil && u.Scheme != ""
}

var hostnameRe = regexp.MustCompile(`^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$`)

func isHostname(s string) bool {
	return hostnameRe.MatchString(s) && len(s) <= 253
}

func isIPv4(s string) bool {
	ip := net.ParseIP(s)
	return ip != nil && ip.To4() != nil
}

func isIPv6(s string) bool {
	ip := net.ParseIP(s)
	return ip != nil && ip.To4() == nil
}

// jsonStringSanity runs a final sanity check that the value is a JSON-encoded
// string (as opposed to an object or array). This is the specific shape the
// Bugbot YAML-round-trip bug produced: the example node's raw text becomes
// `{}` (empty map) rather than a quoted string. If ctx has a RawNode we could
// inspect the tree-sitter kind, but the Value string comparison is enough for
// the common case and avoids a tree-sitter dependency inside the analyzer.
//
//nolint:unused // reserved for future enhancement; kept here as documentation
func jsonStringSanity(value string) bool {
	var v any
	if err := json.Unmarshal([]byte(value), &v); err == nil {
		_, ok := v.(string)
		return ok
	}
	return true
}
