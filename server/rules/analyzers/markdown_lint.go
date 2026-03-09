package analyzers

import (
	"regexp"
	"strings"

	"github.com/LukasParke/gossip"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/markdown"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	descriptionMarkdownMeta = rules.RuleMeta{
		ID:          "description-markdown",
		Description: "Description fields must contain valid CommonMark without structural issues.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryDocumentation,
		Recommended: true,
		HowToFix:    "Fix the reported markdown structural issue (empty heading, skipped level, empty link/image).",
		DocURL:      rules.DocBaseURL + "description-markdown",
	}

	descriptionHTMLMeta = rules.RuleMeta{
		ID:          "description-html",
		Description: "Description fields should not contain raw HTML tags.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryDocumentation,
		Recommended: true,
		HowToFix:    "Replace raw HTML with CommonMark equivalents.",
		DocURL:      rules.DocBaseURL + "description-html",
	}

	htmlTagPattern   = regexp.MustCompile(`<[a-zA-Z][^>]*>`)
	fencedCodeBlock  = regexp.MustCompile("(?s)```[^`]*```")
	inlineCodeSpan   = regexp.MustCompile("`[^`]+`")
)

// HeadingFixData is attached to description-markdown diagnostics for heading
// issues, enabling code actions to offer auto-fixes.
type HeadingFixData struct {
	Kind          string `json:"kind"`
	ExpectedLevel int    `json:"expectedLevel,omitempty"`
	ActualLevel   int    `json:"actualLevel,omitempty"`
}

func registerMarkdownAnalyzers(s *gossip.Server) {
	rules.Define("description-markdown", descriptionMarkdownMeta).
		Custom(func(idx *openapi.Index, r *rules.Reporter) {
			for _, desc := range collectDescriptions(idx) {
				validateDescription(desc, r)
			}
		}).
		Register(s)

	rules.Define("description-html", descriptionHTMLMeta).
		Custom(func(idx *openapi.Index, r *rules.Reporter) {
			for _, desc := range collectDescriptions(idx) {
				checkHTML(desc, r)
			}
		}).
		Register(s)
}

func collectDescriptions(idx *openapi.Index) []openapi.DescriptionValue {
	if idx == nil || idx.Document == nil {
		return nil
	}
	doc := idx.Document
	var entries []openapi.DescriptionValue

	add := func(dv openapi.DescriptionValue) {
		if dv.Text != "" {
			entries = append(entries, dv)
		}
	}

	if doc.Info != nil {
		add(doc.Info.Description)
	}

	for i := range doc.Servers {
		s := &doc.Servers[i]
		add(s.Description)
		for _, sv := range s.Variables {
			add(sv.Description)
		}
	}

	for i := range doc.Tags {
		t := &doc.Tags[i]
		add(t.Description)
		if t.ExternalDocs != nil {
			add(t.ExternalDocs.Description)
		}
	}

	if doc.ExternalDocs != nil {
		add(doc.ExternalDocs.Description)
	}

	for _, item := range doc.Paths {
		add(item.Description)

		for _, p := range item.Parameters {
			add(p.Description)
		}

		for _, mo := range item.Operations() {
			op := mo.Operation
			add(op.Description)

			for _, p := range op.Parameters {
				add(p.Description)
			}

			if op.RequestBody != nil {
				add(op.RequestBody.Description)
			}

			for _, resp := range op.Responses {
				add(resp.Description)
				for _, h := range resp.Headers {
					add(h.Description)
				}
				for _, l := range resp.Links {
					add(l.Description)
				}
			}

			if op.ExternalDocs != nil {
				add(op.ExternalDocs.Description)
			}
		}
	}

	if doc.Components != nil {
		for _, schema := range doc.Components.Schemas {
			collectSchemaDescriptions(schema, &entries)
		}
		for _, ex := range doc.Components.Examples {
			add(ex.Description)
		}
		for _, ss := range doc.Components.SecuritySchemes {
			add(ss.Description)
		}
		for _, rb := range doc.Components.RequestBodies {
			add(rb.Description)
		}
		for _, resp := range doc.Components.Responses {
			add(resp.Description)
		}
		for _, h := range doc.Components.Headers {
			add(h.Description)
		}
		for _, l := range doc.Components.Links {
			add(l.Description)
		}
	}

	return entries
}

func collectSchemaDescriptions(schema *openapi.Schema, entries *[]openapi.DescriptionValue) {
	if schema == nil {
		return
	}
	if schema.Description.Text != "" {
		*entries = append(*entries, schema.Description)
	}
	for _, prop := range schema.Properties {
		collectSchemaDescriptions(prop, entries)
	}
	if schema.Items != nil {
		collectSchemaDescriptions(schema.Items, entries)
	}
	if schema.AdditionalProperties != nil {
		collectSchemaDescriptions(schema.AdditionalProperties, entries)
	}
	for _, sub := range schema.AllOf {
		collectSchemaDescriptions(sub, entries)
	}
	for _, sub := range schema.AnyOf {
		collectSchemaDescriptions(sub, entries)
	}
	for _, sub := range schema.OneOf {
		collectSchemaDescriptions(sub, entries)
	}
	if schema.Not != nil {
		collectSchemaDescriptions(schema.Not, entries)
	}
}

func validateDescription(desc openapi.DescriptionValue, r *rules.Reporter) {
	issues := markdown.Validate(desc.Text)
	for _, iss := range issues {
		data := buildHeadingFixData(iss)
		if data != nil {
			r.WithData(data)
		}
		rng := markdown.TranslatePosition(desc, iss.Line)
		r.AtRange(adapt.RangeFromProtocol(rng), "%s", iss.Message)
	}
}

func buildHeadingFixData(iss markdown.Issue) *HeadingFixData {
	if iss.Message == "Empty heading" {
		return &HeadingFixData{Kind: "empty-heading"}
	}
	if strings.HasPrefix(iss.Message, "Heading level skipped") {
		expected, actual := parseHeadingLevels(iss.Message)
		if expected > 0 && actual > 0 {
			return &HeadingFixData{
				Kind:          "skipped-heading",
				ExpectedLevel: expected,
				ActualLevel:   actual,
			}
		}
	}
	return nil
}

// parseHeadingLevels extracts the expected and actual heading levels from
// a "Heading level skipped (expected hN, got hM)" message.
func parseHeadingLevels(msg string) (expected, actual int) {
	n := 0
	for i := 0; i < len(msg)-1; i++ {
		if msg[i] == 'h' && msg[i+1] >= '1' && msg[i+1] <= '6' {
			level := int(msg[i+1] - '0')
			if n == 0 {
				expected = level
				n++
			} else {
				actual = level
				return
			}
		}
	}
	return
}

func checkHTML(desc openapi.DescriptionValue, r *rules.Reporter) {
	// Strip code blocks and inline code spans before checking for HTML,
	// since HTML inside code is valid markdown usage.
	text := fencedCodeBlock.ReplaceAllString(desc.Text, "")
	text = inlineCodeSpan.ReplaceAllString(text, "")
	if htmlTagPattern.MatchString(text) {
		r.At(desc.Loc, "Description contains raw HTML tags; use CommonMark instead")
	}
}
