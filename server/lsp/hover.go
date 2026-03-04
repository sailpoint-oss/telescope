package lsp

import (
	"fmt"
	"sort"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/markdown"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

const maxHoverDescriptionLen = 500

// NewHoverHandler returns a handler that provides hover information for
// $ref targets, schema types, parameters, responses, security schemes,
// tags, operationIds, and path items.
func NewHoverHandler(cache *openapi.IndexCache) gossip.HoverHandler {
	return func(ctx *gossip.Context, params *protocol.HoverParams) (*protocol.Hover, error) {
		uri := params.TextDocument.URI
		idx := cache.Get(uri)
		if idx == nil || !idx.IsOpenAPI() {
			return nil, nil
		}

		doc := ctx.Documents.Get(uri)
		if doc == nil {
			return nil, nil
		}

		word := doc.WordAt(params.Position)
		if word == "" {
			return nil, nil
		}

		line := doc.LineAt(params.Position.Line)

		// $ref value hover
		if strings.Contains(line, "$ref") {
			refTarget := strings.Trim(word, "\"' ")
			if target, err := idx.Resolve(refTarget); err == nil {
				content := formatRefHover(refTarget, target)
				return &protocol.Hover{
					Contents: protocol.MarkupContent{Kind: protocol.Markdown, Value: content},
				}, nil
			}
		}

		// Component schema
		if schema, ok := idx.Schemas[word]; ok {
			return markdownHover(formatSchemaHover(word, schema)), nil
		}

		// Component parameter
		if param, ok := idx.Parameters[word]; ok {
			return markdownHover(formatParameterHover(word, param)), nil
		}

		// Component response
		if resp, ok := idx.Responses[word]; ok {
			return markdownHover(formatResponseHover(word, resp)), nil
		}

		// Security scheme
		if ss, ok := idx.SecuritySchemes[word]; ok {
			return markdownHover(formatSecuritySchemeHover(word, ss)), nil
		}

		// Tag
		if tag, ok := idx.Tags[word]; ok {
			return markdownHover(formatTagHover(tag)), nil
		}

		// operationId
		if opRef, ok := idx.Operations[word]; ok {
			return markdownHover(fmt.Sprintf(
				"**%s** `%s %s`\n\n%s",
				opRef.Operation.OperationID,
				strings.ToUpper(opRef.Method),
				opRef.Path,
				opRef.Operation.Summary,
			)), nil
		}

		// Path item
		if item, ok := idx.Document.Paths[word]; ok {
			return markdownHover(formatPathItemHover(word, item)), nil
		}

		return nil, nil
	}
}

func markdownHover(content string) *protocol.Hover {
	return &protocol.Hover{
		Contents: protocol.MarkupContent{Kind: protocol.Markdown, Value: content},
	}
}

func formatRefHover(ref string, target interface{}) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("**$ref:** `%s`\n\n", ref))

	switch t := target.(type) {
	case *openapi.Schema:
		sb.WriteString(formatSchemaHover("", t))
	case *openapi.Response:
		sb.WriteString(fmt.Sprintf("**Response:** %s", formatDescription(t.Description.Text)))
	case *openapi.Parameter:
		sb.WriteString(formatParameterHover("", t))
	case *openapi.SecurityScheme:
		sb.WriteString(formatSecuritySchemeHover("", t))
	default:
		sb.WriteString("*(resolved)*")
	}
	return sb.String()
}

func formatSchemaHover(name string, schema *openapi.Schema) string {
	var sb strings.Builder
	if name != "" {
		sb.WriteString(fmt.Sprintf("### %s\n\n", name))
	}

	// Show composition summary for allOf/anyOf/oneOf schemas
	if len(schema.AllOf) > 0 || len(schema.AnyOf) > 0 || len(schema.OneOf) > 0 {
		sb.WriteString(formatCompositionHover(schema, 0))
		return sb.String()
	}

	if schema.Type != "" {
		sb.WriteString(fmt.Sprintf("**Type:** `%s`", schema.Type))
		if schema.Format != "" {
			sb.WriteString(fmt.Sprintf(" (`%s`)", schema.Format))
		}
		sb.WriteString("\n\n")
	}
	if schema.Description.Text != "" {
		sb.WriteString("---\n\n")
		sb.WriteString(formatDescription(schema.Description.Text) + "\n\n")
	}
	if len(schema.Enum) > 0 {
		sb.WriteString(fmt.Sprintf("**Enum:** `%s`\n\n", strings.Join(schema.Enum, "`, `")))
	}
	if len(schema.Required) > 0 {
		sb.WriteString(fmt.Sprintf("**Required:** %s\n\n", strings.Join(schema.Required, ", ")))
	}
	if len(schema.Properties) > 0 {
		sb.WriteString(formatPropertyTable(schema, 0))
	}
	return sb.String()
}

// formatPropertyTable renders a markdown table of schema properties.
// depth limits nested expansion; at depth >= 2 nested objects show "..." .
func formatPropertyTable(schema *openapi.Schema, depth int) string {
	if len(schema.Properties) == 0 {
		return ""
	}

	requiredSet := make(map[string]bool, len(schema.Required))
	for _, r := range schema.Required {
		requiredSet[r] = true
	}

	var sb strings.Builder
	sb.WriteString("| Property | Type | Required | Description |\n")
	sb.WriteString("|----------|------|----------|-------------|\n")

	names := make([]string, 0, len(schema.Properties))
	for n := range schema.Properties {
		names = append(names, n)
	}
	sort.Strings(names)

	for _, propName := range names {
		prop := schema.Properties[propName]
		typeStr := schemaTypeString(prop, depth)
		req := ""
		if requiredSet[propName] {
			req = "**yes**"
		}
		desc := ""
		if prop.Description.Text != "" {
			desc = strings.ReplaceAll(prop.Description.Text, "\n", " ")
			if len(desc) > 60 {
				desc = desc[:57] + "..."
			}
		}
		sb.WriteString(fmt.Sprintf("| `%s` | %s | %s | %s |\n", propName, typeStr, req, desc))
	}
	return sb.String()
}

// schemaTypeString returns a human-readable type string for a schema property.
func schemaTypeString(schema *openapi.Schema, depth int) string {
	if schema.Ref != "" {
		name := refBaseName(schema.Ref)
		return fmt.Sprintf("`→ %s`", name)
	}
	if len(schema.AllOf) > 0 {
		var parts []string
		for _, s := range schema.AllOf {
			parts = append(parts, schemaTypeString(s, depth+1))
		}
		return "allOf(" + strings.Join(parts, ", ") + ")"
	}
	if len(schema.OneOf) > 0 {
		var parts []string
		for _, s := range schema.OneOf {
			parts = append(parts, schemaTypeString(s, depth+1))
		}
		return strings.Join(parts, " \\| ")
	}
	if len(schema.AnyOf) > 0 {
		var parts []string
		for _, s := range schema.AnyOf {
			parts = append(parts, schemaTypeString(s, depth+1))
		}
		return strings.Join(parts, " \\| ")
	}
	t := schema.Type
	if t == "" {
		t = "any"
	}
	if t == "array" && schema.Items != nil {
		itemType := schemaTypeString(schema.Items, depth+1)
		return fmt.Sprintf("`%s[]`", itemType)
	}
	if schema.Format != "" {
		return fmt.Sprintf("`%s(%s)`", t, schema.Format)
	}
	if t == "object" && depth >= 2 {
		return "`object{...}`"
	}
	return fmt.Sprintf("`%s`", t)
}

// formatCompositionHover renders a merged view for allOf/anyOf/oneOf schemas.
func formatCompositionHover(schema *openapi.Schema, depth int) string {
	var sb strings.Builder

	if len(schema.AllOf) > 0 {
		sb.WriteString("**Composition:** `allOf`\n\n")
		merged := mergeAllOfProperties(schema.AllOf)
		if len(merged.Properties) > 0 {
			sb.WriteString(formatPropertyTable(merged, depth+1))
		}
		if schema.Description.Text != "" {
			sb.WriteString("\n---\n\n")
			sb.WriteString(formatDescription(schema.Description.Text) + "\n\n")
		}
	}

	if len(schema.OneOf) > 0 {
		sb.WriteString("**Composition:** `oneOf`\n\n")
		if schema.Discriminator != nil && schema.Discriminator.PropertyName != "" {
			sb.WriteString(fmt.Sprintf("**Discriminator:** `%s`\n\n", schema.Discriminator.PropertyName))
		}
		sb.WriteString("**Variants:**\n")
		for _, s := range schema.OneOf {
			sb.WriteString(fmt.Sprintf("- %s\n", schemaTypeString(s, depth+1)))
		}
		sb.WriteString("\n")
	}

	if len(schema.AnyOf) > 0 {
		sb.WriteString("**Composition:** `anyOf`\n\n")
		sb.WriteString("**Variants:**\n")
		for _, s := range schema.AnyOf {
			sb.WriteString(fmt.Sprintf("- %s\n", schemaTypeString(s, depth+1)))
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

// mergeAllOfProperties merges properties and required fields from all allOf sub-schemas
// into a single unified schema for display purposes.
func mergeAllOfProperties(schemas []*openapi.Schema) *openapi.Schema {
	merged := &openapi.Schema{
		Type:       "object",
		Properties: make(map[string]*openapi.Schema),
	}
	requiredSet := make(map[string]bool)

	for _, s := range schemas {
		// Follow $ref names for display, but merge inline properties
		for propName, prop := range s.Properties {
			merged.Properties[propName] = prop
		}
		for _, r := range s.Required {
			requiredSet[r] = true
		}
		// Recursively merge nested allOf
		if len(s.AllOf) > 0 {
			inner := mergeAllOfProperties(s.AllOf)
			for propName, prop := range inner.Properties {
				merged.Properties[propName] = prop
			}
			for _, r := range inner.Required {
				requiredSet[r] = true
			}
		}
	}

	merged.Required = make([]string, 0, len(requiredSet))
	for r := range requiredSet {
		merged.Required = append(merged.Required, r)
	}
	sort.Strings(merged.Required)
	return merged
}

// refBaseName extracts the component name from a $ref path.
func refBaseName(ref string) string {
	parts := strings.Split(ref, "/")
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return ref
}

func formatParameterHover(name string, param *openapi.Parameter) string {
	var sb strings.Builder
	if name != "" {
		sb.WriteString(fmt.Sprintf("### Parameter: %s\n\n", name))
	}
	sb.WriteString(fmt.Sprintf("**In:** `%s`\n\n", param.In))
	if param.Required {
		sb.WriteString("**Required:** yes\n\n")
	}
	if param.Schema != nil && param.Schema.Type != "" {
		sb.WriteString(fmt.Sprintf("**Type:** `%s`", param.Schema.Type))
		if param.Schema.Format != "" {
			sb.WriteString(fmt.Sprintf(" (`%s`)", param.Schema.Format))
		}
		sb.WriteString("\n\n")
	}
	if param.Description.Text != "" {
		sb.WriteString("---\n\n" + formatDescription(param.Description.Text) + "\n")
	}
	return sb.String()
}

func formatResponseHover(name string, resp *openapi.Response) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### Response: %s\n\n", name))
	if resp.Description.Text != "" {
		sb.WriteString(formatDescription(resp.Description.Text) + "\n\n")
	}
	if len(resp.Content) > 0 {
		sb.WriteString("**Content types:**\n")
		for mt := range resp.Content {
			sb.WriteString(fmt.Sprintf("- `%s`\n", mt))
		}
	}
	if len(resp.Headers) > 0 {
		sb.WriteString("\n**Headers:**\n")
		for h := range resp.Headers {
			sb.WriteString(fmt.Sprintf("- `%s`\n", h))
		}
	}
	return sb.String()
}

func formatSecuritySchemeHover(name string, ss *openapi.SecurityScheme) string {
	var sb strings.Builder
	if name != "" {
		sb.WriteString(fmt.Sprintf("### Security Scheme: %s\n\n", name))
	}
	sb.WriteString(fmt.Sprintf("**Type:** `%s`\n\n", ss.Type))
	if ss.Scheme != "" {
		sb.WriteString(fmt.Sprintf("**Scheme:** `%s`\n\n", ss.Scheme))
	}
	if ss.BearerFormat != "" {
		sb.WriteString(fmt.Sprintf("**Bearer format:** `%s`\n\n", ss.BearerFormat))
	}
	if ss.In != "" {
		sb.WriteString(fmt.Sprintf("**In:** `%s`\n\n", ss.In))
	}
	if ss.Name != "" {
		sb.WriteString(fmt.Sprintf("**Name:** `%s`\n\n", ss.Name))
	}
	if ss.Description.Text != "" {
		sb.WriteString("---\n\n" + formatDescription(ss.Description.Text) + "\n")
	}
	if ss.Flows != nil {
		sb.WriteString("\n**OAuth Flows:**\n")
		if ss.Flows.Implicit != nil {
			sb.WriteString("- Implicit\n")
		}
		if ss.Flows.Password != nil {
			sb.WriteString("- Password\n")
		}
		if ss.Flows.ClientCredentials != nil {
			sb.WriteString("- Client Credentials\n")
		}
		if ss.Flows.AuthorizationCode != nil {
			sb.WriteString("- Authorization Code\n")
		}
	}
	return sb.String()
}

func formatTagHover(tag *openapi.Tag) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### Tag: %s\n\n", tag.Name))
	if tag.Description.Text != "" {
		sb.WriteString(formatDescription(tag.Description.Text) + "\n\n")
	}
	if tag.ExternalDocs != nil {
		sb.WriteString(fmt.Sprintf("**External Docs:** [%s](%s)\n", tag.ExternalDocs.Description.Text, tag.ExternalDocs.URL))
	}
	return sb.String()
}

func formatPathItemHover(path string, item *openapi.PathItem) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### %s\n\n", path))
	if item.Summary != "" {
		sb.WriteString(item.Summary + "\n\n")
	}
	ops := item.Operations()
	if len(ops) > 0 {
		sb.WriteString("**Operations:**\n")
		for _, mo := range ops {
			name := strings.ToUpper(mo.Method)
			if mo.Operation.Summary != "" {
				name += " - " + mo.Operation.Summary
			}
			sb.WriteString(fmt.Sprintf("- `%s`\n", name))
		}
	}
	return sb.String()
}

// formatDescription renders a description string suitable for hover display.
// It escapes stray backticks, and for long descriptions provides either a
// heading outline or a truncated preview.
func formatDescription(desc string) string {
	if desc == "" {
		return ""
	}

	desc = escapeInlineBackticks(desc)

	headings := markdown.Headings(desc)
	links := markdown.Links(desc)

	// For long descriptions with multiple headings, show a structural outline.
	if len(desc) > maxHoverDescriptionLen && len(headings) >= 3 {
		var sb strings.Builder
		sb.WriteString("**Contents:**\n")
		for _, h := range headings {
			indent := strings.Repeat("  ", h.Level-1)
			sb.WriteString(fmt.Sprintf("%s- %s\n", indent, h.Text))
		}
		if len(links) > 0 {
			sb.WriteString(fmt.Sprintf("\n*(%d links)*\n", len(links)))
		}
		return sb.String()
	}

	// Truncate long descriptions.
	result := desc
	if len(result) > maxHoverDescriptionLen {
		result = result[:maxHoverDescriptionLen] + "..."
	}

	if len(links) > 0 {
		result += fmt.Sprintf("\n\n*(%d links)*", len(links))
	}

	return result
}

// escapeInlineBackticks escapes unmatched backticks that could break markdown
// rendering in hover popups. Paired backticks (inline code) are left alone.
func escapeInlineBackticks(s string) string {
	count := strings.Count(s, "`")
	if count == 0 || count%2 == 0 {
		return s
	}
	return strings.ReplaceAll(s, "`", "\\`")
}
