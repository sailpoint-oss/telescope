package lsp

import (
	"fmt"
	"sort"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/markdown"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

const maxHoverDescriptionLen = 500
const maxHoverRefDepth = 3

type hoverRenderContext struct {
	resolveRef func(string) (interface{}, error)
	visited    map[string]struct{}
	maxDepth   int
}

func newHoverRenderContext(resolveRef func(string) (interface{}, error)) *hoverRenderContext {
	return &hoverRenderContext{
		resolveRef: resolveRef,
		visited:    make(map[string]struct{}),
		maxDepth:   maxHoverRefDepth,
	}
}

// NewHoverHandler returns a handler that provides hover information for
// $ref targets, schema types, parameters, responses, security schemes,
// tags, operationIds, and path items.
func NewHoverHandler(cache *openapi.IndexCache, bridge *GraphBridge) gossip.HoverHandler {
	return func(ctx *gossip.Context, params *protocol.HoverParams) (*protocol.Hover, error) {
		uri := params.TextDocument.URI

		// Check for virtual document at this position
		if bridge != nil {
			pos := adapt.PositionFromProtocol(params.Position)
			if vdoc := bridge.VirtualDocManager().FindAtPosition(string(uri), pos); vdoc != nil {
				for _, p := range bridge.VirtualDocManager().Providers() {
					if p.LanguageID() == vdoc.LanguageID {
						vpos := vdoc.Mapper.ToVirtual(pos)
						result, err := p.Hover(*vdoc, vpos)
						if err == nil && result != nil {
							return &protocol.Hover{
								Contents: protocol.MarkupContent{
									Kind:  protocol.Markdown,
									Value: result.Contents,
								},
							}, nil
						}
					}
				}
			}
		}

		idx := cache.Get(uri)
		if idx == nil || !idx.IsOpenAPI() {
			return nil, nil
		}

		doc := ctx.Documents.Get(uri)
		if doc == nil {
			return nil, nil
		}

		word := doc.WordAt(params.Position)
		line := doc.LineAt(params.Position.Line)

		// $ref value hover — extract the full ref from the line since WordAt()
		// breaks on #, /, etc. and returns fragments.
		if strings.Contains(line, "$ref") {
			refTarget := extractRefFromLine(line)
			if refTarget != "" {
				if target, err := idx.Resolve(refTarget); err == nil {
					content := formatRefHoverWithContext(refTarget, target, newHoverRenderContext(idx.Resolve))
					return &protocol.Hover{
						Contents: protocol.MarkupContent{Kind: protocol.Markdown, Value: content},
					}, nil
				}

				// Cross-file $ref hover: resolve via graph bridge + index cache
				if bridge != nil {
					if targetURI, targetPtr, ok := bridge.LookupDefinition(string(uri), refTarget); ok {
						normTarget := protocol.NormalizeURI(protocol.DocumentURI(targetURI))
						if targetIdx := cache.Get(normTarget); targetIdx != nil && targetPtr != "" {
							if target, err := targetIdx.Resolve("#" + targetPtr); err == nil {
								content := formatRefHoverWithContext(refTarget, target, newHoverRenderContext(targetIdx.Resolve))
								return &protocol.Hover{
									Contents: protocol.MarkupContent{Kind: protocol.Markdown, Value: content},
								}, nil
							}
						}
					}
				}

				return &protocol.Hover{
					Contents: protocol.MarkupContent{
						Kind:  protocol.Markdown,
						Value: formatUnresolvedRefHover(refTarget),
					},
				}, nil
			}
		}

		if word == "" {
			return nil, nil
		}

		// Component schema — only at definition site (NameLoc)
		if schema, ok := idx.Schemas[word]; ok && (isAtLocOrSameLineNameSpan(params.Position, schema.NameLoc, word) || cursorOnWordFirstOccurrence(line, word, params.Position)) {
			return markdownHover(formatSchemaHoverWithContext(word, schema, newHoverRenderContext(idx.Resolve))), nil
		}

		// Component parameter — only at definition site (NameLoc)
		if param, ok := idx.Parameters[word]; ok && (isAtLocOrSameLineNameSpan(params.Position, param.NameLoc, word) || cursorOnWordFirstOccurrence(line, word, params.Position)) {
			return markdownHover(formatParameterHover(word, param)), nil
		}

		// Component response — only at definition site (NameLoc)
		if resp, ok := idx.Responses[word]; ok && (isAtLocOrSameLineNameSpan(params.Position, resp.NameLoc, word) || cursorOnWordFirstOccurrence(line, word, params.Position)) {
			return markdownHover(formatResponseHover(word, resp)), nil
		}

		// Security scheme — at definition site OR in security: context
		if ss, ok := idx.SecuritySchemes[word]; ok {
			if isAtLocOrSameLineNameSpan(params.Position, ss.NameLoc, word) || cursorOnWordFirstOccurrence(line, word, params.Position) || isSecurityContext(line) {
				return markdownHover(formatSecuritySchemeHover(word, ss, idx)), nil
			}
		}

		// Tag — at root tag definition OR in operation tags: array
		if tag, ok := idx.Tags[word]; ok {
			if isAtLocOrSameLineNameSpan(params.Position, tag.NameLoc, word) || cursorOnWordFirstOccurrence(line, word, params.Position) || isTagUsageAt(idx, word, params.Position) {
				return markdownHover(formatTagHover(tag, idx)), nil
			}
		}

		// operationId — only on operationId: lines or Link operationId references
		if opRef, ok := idx.Operations[word]; ok {
			if strings.Contains(line, "operationId") {
				return markdownHover(formatOperationHover(opRef, idx)), nil
			}
		}

		// Path item — only for path-shaped words
		if strings.HasPrefix(word, "/") {
			if item, ok := idx.Document.Paths[word]; ok {
				return markdownHover(formatPathItemHover(word, item)), nil
			}
		}

		return nil, nil
	}
}

// isAtLoc checks if the given position falls within the loc's range on the same line.
func isAtLoc(pos protocol.Position, loc openapi.Loc) bool {
	r := adapt.RangeToProtocol(loc.Range)
	if isZeroRange(r) {
		return false
	}
	if pos.Line < r.Start.Line || pos.Line > r.End.Line {
		return false
	}
	if pos.Line == r.Start.Line && pos.Character < r.Start.Character {
		return false
	}
	if pos.Line == r.End.Line && pos.Character > r.End.Character {
		return false
	}
	return true
}

// isAtLocOrSameLineNameSpan treats tree-sitter key/value spans that are zero-width
// or shorter than the identifier as covering the full UTF-16 name (same line as
// NameLoc.Range.Start). This matches E2E and editor cursor placement on the
// middle of a component key or tag value.
func isAtLocOrSameLineNameSpan(pos protocol.Position, loc openapi.Loc, name string) bool {
	if name == "" {
		return isAtLoc(pos, loc)
	}
	if isAtLoc(pos, loc) {
		return true
	}
	r := adapt.RangeToProtocol(loc.Range)
	if isZeroRange(r) {
		return false
	}
	if pos.Line != r.Start.Line || pos.Line != r.End.Line {
		return false
	}
	want := utf16Len(name)
	if want == 0 {
		return false
	}
	// Tree-sitter NameLoc spans can be point-like, too short, or occasionally
	// mis-sized vs LSP positions; anchor on Range.Start and span the identifier.
	start := r.Start.Character
	end := start + want
	return pos.Character >= start && pos.Character < end
}

// cursorOnWordFirstOccurrence reports whether pos falls on the UTF-16 span of
// the first occurrence of word on line. Used when NameLoc columns disagree
// with the editor (tree-sitter vs VS Code).
func cursorOnWordFirstOccurrence(line string, word string, pos protocol.Position) bool {
	if word == "" {
		return false
	}
	idx := strings.Index(line, word)
	if idx < 0 {
		return false
	}
	start := utf16Len(line[:idx])
	end := start + utf16Len(word)
	return pos.Character >= start && pos.Character < end
}

// isTagUsageAt checks if the given position matches any tag usage location in operations.
func isTagUsageAt(idx *openapi.Index, name string, pos protocol.Position) bool {
	for _, item := range idx.Document.Paths {
		for _, mo := range item.Operations() {
			for _, t := range mo.Operation.Tags {
				if t.Name == name && isAtLoc(pos, t.Loc) {
					return true
				}
			}
		}
	}
	return false
}

func markdownHover(content string) *protocol.Hover {
	return &protocol.Hover{
		Contents: protocol.MarkupContent{Kind: protocol.Markdown, Value: content},
	}
}

func formatRefHover(ref string, target interface{}) string {
	return formatRefHoverWithContext(ref, target, nil)
}

func formatUnresolvedRefHover(ref string) string {
	return fmt.Sprintf("**$ref:** `%s`\n\n*Referenced object could not be resolved in the current workspace. If this points to an external file, preview is limited to the reference path.*\n", ref)
}

func formatRefHoverWithContext(ref string, target interface{}, renderCtx *hoverRenderContext) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("**$ref:** `%s`\n\n", ref))

	switch t := target.(type) {
	case *openapi.Schema:
		if t.Type == "" && t.Ref != "" && len(t.Properties) == 0 && len(t.AllOf) == 0 && len(t.OneOf) == 0 && len(t.AnyOf) == 0 {
			sb.WriteString(fmt.Sprintf("**Schema** → `%s`\n\n*Defined in external file (preview limited to reference path)*\n", t.Ref))
		} else {
			sb.WriteString(formatSchemaHoverWithContext("", t, renderCtx))
		}
	case *openapi.Response:
		if t.Ref != "" && t.Description.Text == "" && len(t.Content) == 0 {
			sb.WriteString(fmt.Sprintf("**Response** → `%s`\n\n*Defined in external file (preview limited to reference path)*\n", t.Ref))
		} else {
			sb.WriteString(formatResponseHover("", t))
		}
	case *openapi.Parameter:
		if t.Ref != "" && t.Name == "" {
			sb.WriteString(fmt.Sprintf("**Parameter** → `%s`\n\n*Defined in external file (preview limited to reference path)*\n", t.Ref))
		} else {
			sb.WriteString(formatParameterHover("", t))
		}
	case *openapi.SecurityScheme:
		if t.Type == "" && t.Ref != "" {
			sb.WriteString(fmt.Sprintf("**Security Scheme** → `%s`\n\n*Defined in external file (preview limited to reference path)*\n", t.Ref))
		} else {
			sb.WriteString(formatSecuritySchemeHover("", t, nil))
		}
	case *openapi.RequestBody:
		if t.Ref != "" && len(t.Content) == 0 {
			sb.WriteString(fmt.Sprintf("**Request Body** → `%s`\n\n*Defined in external file (preview limited to reference path)*\n", t.Ref))
		} else {
			sb.WriteString(formatRequestBodyHover("", t))
		}
	case *openapi.Header:
		if t.Ref != "" && t.Description.Text == "" {
			sb.WriteString(fmt.Sprintf("**Header** → `%s`\n\n*Defined in external file (preview limited to reference path)*\n", t.Ref))
		} else {
			sb.WriteString(formatHeaderHover("", t))
		}
	case *openapi.Link:
		if t.Ref != "" && t.OperationID == "" && t.OperationRef == "" {
			sb.WriteString(fmt.Sprintf("**Link** → `%s`\n\n*Defined in external file (preview limited to reference path)*\n", t.Ref))
		} else {
			sb.WriteString(formatLinkHover("", t))
		}
	case *openapi.Example:
		if t.Ref != "" && t.Summary == "" && t.Value == nil {
			sb.WriteString(fmt.Sprintf("**Example** → `%s`\n\n*Defined in external file (preview limited to reference path)*\n", t.Ref))
		} else {
			sb.WriteString(formatExampleHover("", t))
		}
	case *openapi.PathItem:
		sb.WriteString(formatPathItemHover("", t))
	default:
		sb.WriteString("*(resolved)*")
	}
	return sb.String()
}

func formatSchemaHoverWithContext(name string, schema *openapi.Schema, renderCtx *hoverRenderContext) string {
	var sb strings.Builder
	if name != "" {
		sb.WriteString(fmt.Sprintf("### %s\n\n", name))
	}

	// Show composition summary for allOf/anyOf/oneOf schemas
	if len(schema.AllOf) > 0 || len(schema.AnyOf) > 0 || len(schema.OneOf) > 0 {
		sb.WriteString(formatCompositionHoverWithContext(schema, 0, renderCtx))
		return sb.String()
	}

	if schema.Title != "" && schema.Title != name {
		sb.WriteString(fmt.Sprintf("*%s*\n\n", schema.Title))
	}
	if schema.Type != "" {
		sb.WriteString(fmt.Sprintf("**Type:** `%s`", schema.Type))
		if schema.Format != "" {
			sb.WriteString(fmt.Sprintf(" (`%s`)", schema.Format))
		}
		sb.WriteString("\n\n")
	}
	if flags := formatSchemaFlags(schema); flags != "" {
		sb.WriteString(flags)
	}
	if schema.Description.Text != "" {
		sb.WriteString("---\n\n")
		sb.WriteString(formatDescription(schema.Description.Text) + "\n\n")
	}
	if len(schema.Enum) > 0 {
		sb.WriteString(fmt.Sprintf("**Enum:** `%s`\n\n", strings.Join(schema.Enum, "`, `")))
	}
	if constraints := formatSchemaConstraints(schema); constraints != "" {
		sb.WriteString(constraints)
	}
	if schema.Default != nil && schema.Default.Value != "" {
		sb.WriteString(fmt.Sprintf("**Default:** `%s`\n\n", truncate(schema.Default.Value, 100)))
	}
	if schema.Example != nil && schema.Example.Value != "" {
		sb.WriteString(fmt.Sprintf("**Example:** `%s`\n\n", truncate(schema.Example.Value, 100)))
	}
	if len(schema.Required) > 0 {
		sb.WriteString(fmt.Sprintf("**Required:** %s\n\n", strings.Join(schema.Required, ", ")))
	}
	if len(schema.Properties) > 0 {
		sb.WriteString(formatPropertyTable(schema, 0, renderCtx))
	}
	return sb.String()
}

// formatPropertyTable renders a markdown table of schema properties.
// depth limits nested expansion; at depth >= 2 nested objects show "..." .
func formatPropertyTable(schema *openapi.Schema, depth int, renderCtx *hoverRenderContext) string {
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
		typeStr := schemaTypeString(prop, depth, renderCtx)
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
func schemaTypeString(schema *openapi.Schema, depth int, renderCtx *hoverRenderContext) string {
	if schema.Ref != "" {
		name := refBaseName(schema.Ref)
		if renderCtx == nil || renderCtx.resolveRef == nil {
			return fmt.Sprintf("`→ %s`", name)
		}
		if depth >= renderCtx.maxDepth {
			return fmt.Sprintf("`→ %s` `{...}`", name)
		}
		if _, seen := renderCtx.visited[schema.Ref]; seen {
			return fmt.Sprintf("`→ %s` *(cycle)*", name)
		}
		target, err := renderCtx.resolveRef(schema.Ref)
		if err != nil {
			return fmt.Sprintf("`→ %s`", name)
		}
		refSchema, ok := target.(*openapi.Schema)
		if !ok || refSchema == nil {
			return fmt.Sprintf("`→ %s`", name)
		}
		renderCtx.visited[schema.Ref] = struct{}{}
		defer delete(renderCtx.visited, schema.Ref)
		summary := summarizeSchemaShape(refSchema, depth+1, renderCtx)
		if summary == "" {
			return fmt.Sprintf("`→ %s`", name)
		}
		return fmt.Sprintf("`→ %s` (%s)", name, summary)
	}
	if len(schema.AllOf) > 0 {
		var parts []string
		for _, s := range schema.AllOf {
			parts = append(parts, schemaTypeString(s, depth+1, renderCtx))
		}
		return "allOf(" + strings.Join(parts, ", ") + ")"
	}
	if len(schema.OneOf) > 0 {
		var parts []string
		for _, s := range schema.OneOf {
			parts = append(parts, schemaTypeString(s, depth+1, renderCtx))
		}
		return strings.Join(parts, " \\| ")
	}
	if len(schema.AnyOf) > 0 {
		var parts []string
		for _, s := range schema.AnyOf {
			parts = append(parts, schemaTypeString(s, depth+1, renderCtx))
		}
		return strings.Join(parts, " \\| ")
	}
	t := schema.Type
	if t == "" {
		t = "any"
	}
	if t == "array" && schema.Items != nil {
		itemType := schemaTypeString(schema.Items, depth+1, renderCtx)
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

// formatCompositionHoverWithContext renders a merged view for allOf/anyOf/oneOf schemas.
func formatCompositionHoverWithContext(schema *openapi.Schema, depth int, renderCtx *hoverRenderContext) string {
	var sb strings.Builder

	if len(schema.AllOf) > 0 {
		sb.WriteString("**Composition:** `allOf`\n\n")
		merged := mergeAllOfProperties(schema.AllOf)
		if len(merged.Properties) > 0 {
			sb.WriteString(formatPropertyTable(merged, depth+1, renderCtx))
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
			sb.WriteString(fmt.Sprintf("- %s\n", schemaTypeString(s, depth+1, renderCtx)))
		}
		sb.WriteString("\n")
	}

	if len(schema.AnyOf) > 0 {
		sb.WriteString("**Composition:** `anyOf`\n\n")
		sb.WriteString("**Variants:**\n")
		for _, s := range schema.AnyOf {
			sb.WriteString(fmt.Sprintf("- %s\n", schemaTypeString(s, depth+1, renderCtx)))
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

func summarizeSchemaShape(schema *openapi.Schema, depth int, renderCtx *hoverRenderContext) string {
	if schema == nil {
		return ""
	}
	if schema.Type == "array" && schema.Items != nil {
		return "array"
	}
	if schema.Type == "object" || len(schema.Properties) > 0 {
		names := make([]string, 0, len(schema.Properties))
		for n := range schema.Properties {
			names = append(names, n)
		}
		sort.Strings(names)
		if len(names) == 0 {
			return "object"
		}
		const maxFields = 3
		end := min(len(names), maxFields)
		previewFields := make([]string, 0, end)
		for _, propName := range names[:end] {
			propPreview := propName
			if prop := schema.Properties[propName]; prop != nil && prop.Ref != "" {
				nested := schemaTypeString(prop, depth+1, renderCtx)
				nested = strings.ReplaceAll(nested, "`", "")
				nested = strings.ReplaceAll(nested, "*", "")
				propPreview = propName + ":" + nested
			}
			previewFields = append(previewFields, propPreview)
		}
		preview := strings.Join(previewFields, ", ")
		if len(names) > maxFields {
			preview += ", ..."
		}
		return "{" + preview + "}"
	}
	if schema.Type != "" {
		return schema.Type
	}
	if len(schema.Enum) > 0 {
		return "enum"
	}
	return ""
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
	if param.Deprecated {
		sb.WriteString("**Deprecated**\n\n")
	}
	if param.Schema != nil && param.Schema.Type != "" {
		sb.WriteString(fmt.Sprintf("**Type:** `%s`", param.Schema.Type))
		if param.Schema.Format != "" {
			sb.WriteString(fmt.Sprintf(" (`%s`)", param.Schema.Format))
		}
		sb.WriteString("\n\n")
	}
	if param.Schema != nil && len(param.Schema.Enum) > 0 {
		sb.WriteString(fmt.Sprintf("**Enum:** `%s`\n\n", strings.Join(param.Schema.Enum, "`, `")))
	}
	if param.Example != nil && param.Example.Value != "" {
		sb.WriteString(fmt.Sprintf("**Example:** `%s`\n\n", truncate(param.Example.Value, 100)))
	}
	if param.Description.Text != "" {
		sb.WriteString("---\n\n" + formatDescription(param.Description.Text) + "\n")
	}
	return sb.String()
}

func formatResponseHover(name string, resp *openapi.Response) string {
	var sb strings.Builder
	if name != "" {
		sb.WriteString(fmt.Sprintf("### Response: %s\n\n", name))
	}
	if resp.Description.Text != "" {
		sb.WriteString(formatDescription(resp.Description.Text) + "\n\n")
	}
	if len(resp.Content) > 0 {
		sb.WriteString("**Content types:**\n")
		for mt, mediaType := range resp.Content {
			typeStr := ""
			if mediaType != nil && mediaType.Schema != nil {
				typeStr = " → " + schemaTypeString(mediaType.Schema, 0, nil)
			}
			sb.WriteString(fmt.Sprintf("- `%s`%s\n", mt, typeStr))
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

func formatSecuritySchemeHover(name string, ss *openapi.SecurityScheme, idx *openapi.Index) string {
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
	// Usage context
	if name != "" && idx != nil {
		var ops []string
		isGlobal := false
		for _, req := range idx.Document.Security {
			if _, ok := req.HasScheme(name); ok {
				isGlobal = true
				break
			}
		}
		if isGlobal {
			sb.WriteString("\n**Scope:** Global (all operations)\n")
		} else {
			for path, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					for _, req := range mo.Operation.Security {
						if _, ok := req.HasScheme(name); ok {
							ops = append(ops, fmt.Sprintf("`%s %s`", strings.ToUpper(mo.Method), path))
						}
					}
				}
			}
			if len(ops) > 0 {
				sort.Strings(ops)
				sb.WriteString(fmt.Sprintf("\n**Used by** (%d operations):\n", len(ops)))
				for _, op := range ops {
					sb.WriteString("- " + op + "\n")
				}
			}
		}
	}
	return sb.String()
}

func formatTagHover(tag *openapi.Tag, idx *openapi.Index) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("### Tag: %s\n\n", tag.Name))
	if tag.Description.Text != "" {
		sb.WriteString(formatDescription(tag.Description.Text) + "\n\n")
	}
	if tag.ExternalDocs != nil && tag.ExternalDocs.URL != "" {
		desc := tag.ExternalDocs.Description.Text
		if desc == "" {
			desc = tag.ExternalDocs.URL
		}
		sb.WriteString(fmt.Sprintf("**External Docs:** [%s](%s)\n\n", desc, tag.ExternalDocs.URL))
	}
	// Operations using this tag
	if idx != nil {
		var ops []string
		for path, item := range idx.Document.Paths {
			for _, mo := range item.Operations() {
				if _, ok := mo.Operation.HasTag(tag.Name); ok {
					entry := fmt.Sprintf("`%s %s`", strings.ToUpper(mo.Method), path)
					if mo.Operation.Summary != "" {
						entry += " — " + mo.Operation.Summary
					}
					ops = append(ops, entry)
				}
			}
		}
		if len(ops) > 0 {
			sort.Strings(ops)
			sb.WriteString(fmt.Sprintf("**Operations** (%d):\n", len(ops)))
			for _, op := range ops {
				sb.WriteString("- " + op + "\n")
			}
		}
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

// formatSchemaFlags returns a line of flags (deprecated, nullable, etc.) or "".
func formatSchemaFlags(schema *openapi.Schema) string {
	var flags []string
	if schema.Deprecated {
		flags = append(flags, "deprecated")
	}
	if schema.Nullable {
		flags = append(flags, "nullable")
	}
	if schema.ReadOnly {
		flags = append(flags, "readOnly")
	}
	if schema.WriteOnly {
		flags = append(flags, "writeOnly")
	}
	if schema.HasConst {
		flags = append(flags, "const")
	}
	if len(flags) == 0 {
		return ""
	}
	return "**Flags:** " + strings.Join(flags, ", ") + "\n\n"
}

// formatSchemaConstraints returns a constraints line for a schema, or "".
func formatSchemaConstraints(schema *openapi.Schema) string {
	var parts []string
	if schema.MinLength != nil {
		parts = append(parts, fmt.Sprintf("minLength: %d", *schema.MinLength))
	}
	if schema.MaxLength != nil {
		parts = append(parts, fmt.Sprintf("maxLength: %d", *schema.MaxLength))
	}
	if schema.Minimum != nil {
		parts = append(parts, fmt.Sprintf("minimum: %g", *schema.Minimum))
	}
	if schema.Maximum != nil {
		parts = append(parts, fmt.Sprintf("maximum: %g", *schema.Maximum))
	}
	if schema.ExclusiveMinimum != nil {
		parts = append(parts, fmt.Sprintf("exclusiveMinimum: %g", *schema.ExclusiveMinimum))
	}
	if schema.ExclusiveMaximum != nil {
		parts = append(parts, fmt.Sprintf("exclusiveMaximum: %g", *schema.ExclusiveMaximum))
	}
	if schema.MinItems != nil {
		parts = append(parts, fmt.Sprintf("minItems: %d", *schema.MinItems))
	}
	if schema.MaxItems != nil {
		parts = append(parts, fmt.Sprintf("maxItems: %d", *schema.MaxItems))
	}
	if schema.MaxProperties != nil {
		parts = append(parts, fmt.Sprintf("maxProperties: %d", *schema.MaxProperties))
	}
	if schema.Pattern != "" {
		parts = append(parts, fmt.Sprintf("pattern: `%s`", schema.Pattern))
	}
	if len(parts) == 0 {
		return ""
	}
	return "**Constraints:** " + strings.Join(parts, " | ") + "\n\n"
}

func formatRequestBodyHover(name string, rb *openapi.RequestBody) string {
	var sb strings.Builder
	if name != "" {
		sb.WriteString(fmt.Sprintf("### Request Body: %s\n\n", name))
	}
	if rb.Required {
		sb.WriteString("**Required:** yes\n\n")
	}
	if rb.Description.Text != "" {
		sb.WriteString(formatDescription(rb.Description.Text) + "\n\n")
	}
	if len(rb.Content) > 0 {
		sb.WriteString("**Content types:**\n")
		for mt, mediaType := range rb.Content {
			typeStr := ""
			if mediaType != nil && mediaType.Schema != nil {
				typeStr = " → " + schemaTypeString(mediaType.Schema, 0, nil)
			}
			sb.WriteString(fmt.Sprintf("- `%s`%s\n", mt, typeStr))
		}
	}
	return sb.String()
}

func formatHeaderHover(name string, h *openapi.Header) string {
	var sb strings.Builder
	if name != "" {
		sb.WriteString(fmt.Sprintf("### Header: %s\n\n", name))
	}
	if h.Required {
		sb.WriteString("**Required:** yes\n\n")
	}
	if h.Deprecated {
		sb.WriteString("**Deprecated**\n\n")
	}
	if h.Schema != nil && h.Schema.Type != "" {
		sb.WriteString(fmt.Sprintf("**Type:** `%s`", h.Schema.Type))
		if h.Schema.Format != "" {
			sb.WriteString(fmt.Sprintf(" (`%s`)", h.Schema.Format))
		}
		sb.WriteString("\n\n")
	}
	if h.Description.Text != "" {
		sb.WriteString("---\n\n" + formatDescription(h.Description.Text) + "\n")
	}
	return sb.String()
}

func formatLinkHover(name string, l *openapi.Link) string {
	var sb strings.Builder
	if name != "" {
		sb.WriteString(fmt.Sprintf("### Link: %s\n\n", name))
	}
	if l.OperationRef != "" {
		sb.WriteString(fmt.Sprintf("**operationRef:** `%s`\n\n", l.OperationRef))
	}
	if l.OperationID != "" {
		sb.WriteString(fmt.Sprintf("**operationId:** `%s`\n\n", l.OperationID))
	}
	if l.Description.Text != "" {
		sb.WriteString("---\n\n" + formatDescription(l.Description.Text) + "\n")
	}
	return sb.String()
}

func formatExampleHover(name string, ex *openapi.Example) string {
	var sb strings.Builder
	if name != "" {
		sb.WriteString(fmt.Sprintf("### Example: %s\n\n", name))
	}
	if ex.Summary != "" {
		sb.WriteString(ex.Summary + "\n\n")
	}
	if ex.Description.Text != "" {
		sb.WriteString(formatDescription(ex.Description.Text) + "\n\n")
	}
	if ex.Value != nil && ex.Value.Value != "" {
		sb.WriteString(fmt.Sprintf("```\n%s\n```\n", truncate(ex.Value.Value, 200)))
	}
	if ex.ExternalValue != "" {
		sb.WriteString(fmt.Sprintf("**External:** `%s`\n", ex.ExternalValue))
	}
	return sb.String()
}

// formatOperationHover renders a rich hover for an operation.
func formatOperationHover(opRef *openapi.OperationRef, idx *openapi.Index) string {
	op := opRef.Operation
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("### `%s %s`\n\n", strings.ToUpper(opRef.Method), opRef.Path))

	if op.Deprecated {
		sb.WriteString("**DEPRECATED**\n\n")
	}
	if op.OperationID != "" {
		sb.WriteString(fmt.Sprintf("**operationId:** `%s`\n\n", op.OperationID))
	}
	if op.Summary != "" {
		sb.WriteString(op.Summary + "\n\n")
	}
	if op.Description.Text != "" {
		sb.WriteString("---\n\n" + formatDescription(op.Description.Text) + "\n\n")
	}
	if len(op.Tags) > 0 {
		names := op.TagNames()
		sb.WriteString(fmt.Sprintf("**Tags:** %s\n\n", strings.Join(names, ", ")))
	}
	if len(op.Parameters) > 0 {
		counts := map[string]int{}
		for _, p := range op.Parameters {
			counts[p.In]++
		}
		var paramParts []string
		for _, loc := range []string{"path", "query", "header", "cookie"} {
			if n, ok := counts[loc]; ok {
				paramParts = append(paramParts, fmt.Sprintf("%d %s", n, loc))
			}
		}
		sb.WriteString(fmt.Sprintf("**Parameters:** %s\n\n", strings.Join(paramParts, ", ")))
	}
	if len(op.Responses) > 0 {
		codes := make([]string, 0, len(op.Responses))
		for code := range op.Responses {
			codes = append(codes, code)
		}
		sort.Strings(codes)
		sb.WriteString(fmt.Sprintf("**Responses:** `%s`\n", strings.Join(codes, "`, `")))
	}
	// Sibling operations sharing the same tags
	if idx != nil && len(op.Tags) > 0 {
		for _, tagUsage := range op.Tags {
			var siblings []string
			for path, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					if mo.Operation.OperationID == op.OperationID && opRef.Path == path {
						continue
					}
					if _, ok := mo.Operation.HasTag(tagUsage.Name); ok {
						entry := fmt.Sprintf("`%s %s`", strings.ToUpper(mo.Method), path)
						if mo.Operation.Summary != "" {
							entry += " — " + mo.Operation.Summary
						}
						siblings = append(siblings, entry)
					}
				}
			}
			if len(siblings) > 0 && len(siblings) <= 10 {
				sort.Strings(siblings)
				sb.WriteString(fmt.Sprintf("\n**Other %s operations:**\n", tagUsage.Name))
				for _, s := range siblings {
					sb.WriteString("- " + s + "\n")
				}
			}
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
