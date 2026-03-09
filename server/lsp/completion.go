package lsp

import (
	"fmt"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

var snippetFmt = protocol.InsertTextFormatSnippet

var snippetEscaper = strings.NewReplacer("\\", "\\\\", "$", "\\$", "}", "\\}")

// NewCompletionHandler returns completions for $ref paths, HTTP status codes,
// media types, security schemes, tags, and common OpenAPI fields.
func NewCompletionHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.CompletionHandler {
	return func(ctx *gossip.Context, params *protocol.CompletionParams) (*protocol.CompletionList, error) {
		uri := params.TextDocument.URI
		idx := cache.Get(uri)

		doc := ctx.Documents.Get(uri)
		if doc == nil {
			return nil, nil
		}

		line := doc.LineAt(params.Position.Line)
		var items []protocol.CompletionItem

		if strings.Contains(line, "$ref") {
			items = append(items, refCompletions(idx)...)
		}

		if isResponseContext(line) {
			items = append(items, statusCodeCompletions()...)
		}

		if isContentContext(line) {
			items = append(items, mediaTypeCompletions()...)
		}

		if isSecurityContext(line) && idx != nil {
			items = append(items, securitySchemeCompletions(idx)...)
		}
		if isSecurityScopeContext(line) && idx != nil {
			items = append(items, securityScopeCompletions(idx, line)...)
		}

		if isTagContext(line) && idx != nil {
			items = append(items, tagCompletions(idx)...)
		}

		// Schema property completions
		if isPropertyContext(line) {
			items = append(items, propertyPatternCompletions()...)
		}

		// Path key/template completions under paths:
		if isPathTemplateContext(line) && idx != nil {
			items = append(items, pathTemplateCompletions(idx)...)
		}

		// HTTP method / operation template completions
		if isHTTPMethodContext(line) {
			items = append(items, operationTemplateCompletions()...)
		}

		// Header completions
		if isHeaderContext(line) {
			items = append(items, headerCompletions()...)
		}

		return &protocol.CompletionList{
			IsIncomplete: false,
			Items:        items,
		}, nil
	}
}

// NewCompletionResolveHandler enriches a completion item with documentation.
func NewCompletionResolveHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.CompletionResolveHandler {
	return func(ctx *gossip.Context, item *protocol.CompletionItem) (*protocol.CompletionItem, error) {
		if item.Data == nil {
			return item, nil
		}
		dataMap, ok := item.Data.(map[string]interface{})
		if !ok {
			return item, nil
		}
		kind, _ := dataMap["resolveKind"].(string)
		value, _ := dataMap["resolveValue"].(string)

		switch kind {
		case "statusCode":
			item.Documentation = &protocol.MarkupContent{
				Kind:  protocol.Markdown,
				Value: fmt.Sprintf("HTTP Status Code **%s**\n\n%s", value, item.Detail),
			}
		case "mediaType":
			item.Documentation = &protocol.MarkupContent{
				Kind:  protocol.Markdown,
				Value: fmt.Sprintf("Media type `%s`", value),
			}
		case "ref":
			doc := fmt.Sprintf("Reference to `%s`", value)
			if _, target := cache.FindRefTarget(value); target != nil {
				doc = formatRefHover(value, target)
			}
			item.Documentation = &protocol.MarkupContent{
				Kind:  protocol.Markdown,
				Value: doc,
			}
		case "securityScheme":
			doc := fmt.Sprintf("Security scheme `%s`", value)
			for _, idx := range cache.All() {
				if ss, ok := idx.SecuritySchemes[value]; ok {
					doc = formatSecuritySchemeHover(value, ss, idx)
					break
				}
			}
			item.Documentation = &protocol.MarkupContent{
				Kind:  protocol.Markdown,
				Value: doc,
			}
		case "tag":
			doc := fmt.Sprintf("Tag `%s`", value)
			for _, idx := range cache.All() {
				if tag, ok := idx.Tags[value]; ok {
					doc = formatTagHover(tag, idx)
					break
				}
			}
			item.Documentation = &protocol.MarkupContent{
				Kind:  protocol.Markdown,
				Value: doc,
			}
		}

		return item, nil
	}
}

func refCompletions(idx *openapi.Index) []protocol.CompletionItem {
	var items []protocol.CompletionItem
	if idx == nil {
		return items
	}

	componentKinds := []string{"schemas", "responses", "parameters", "examples", "requestBodies", "headers", "securitySchemes", "links"}
	for _, kind := range componentKinds {
		for _, name := range idx.ComponentNames(kind) {
			ref := fmt.Sprintf("#/components/%s/%s", kind, name)
			items = append(items, protocol.CompletionItem{
				Label:      ref,
				Kind:       protocol.CompletionKindVariable,
				Detail:     fmt.Sprintf("Component %s", kind),
				InsertText: ref,
				SortText:   kind + "/" + name,
				FilterText: name,
				Data: map[string]interface{}{
					"resolveKind":  "ref",
					"resolveValue": ref,
				},
			})
		}
	}
	return items
}

func statusCodeCompletions() []protocol.CompletionItem {
	codes := []struct {
		code, desc string
	}{
		{"200", "OK"}, {"201", "Created"}, {"204", "No Content"},
		{"301", "Moved Permanently"}, {"304", "Not Modified"},
		{"400", "Bad Request"}, {"401", "Unauthorized"}, {"403", "Forbidden"},
		{"404", "Not Found"}, {"409", "Conflict"}, {"422", "Unprocessable Entity"},
		{"429", "Too Many Requests"},
		{"500", "Internal Server Error"}, {"502", "Bad Gateway"}, {"503", "Service Unavailable"},
		{"default", "Default response"},
	}
	items := make([]protocol.CompletionItem, 0, len(codes))
	for _, c := range codes {
		items = append(items, protocol.CompletionItem{
			Label:            c.code,
			Kind:             protocol.CompletionKindKeyword,
			Detail:           c.desc,
			InsertText:       fmt.Sprintf("'%s':\n  description: ${1:%s}", c.code, snippetEscaper.Replace(c.desc)),
			InsertTextFormat: &snippetFmt,
			SortText:         c.code,
			Data: map[string]interface{}{
				"resolveKind":  "statusCode",
				"resolveValue": c.code,
			},
		})
	}
	return items
}

func mediaTypeCompletions() []protocol.CompletionItem {
	types := []string{
		"application/json", "application/xml", "application/x-www-form-urlencoded",
		"multipart/form-data", "text/plain", "text/html", "application/octet-stream",
		"application/pdf", "image/png", "image/jpeg",
	}
	items := make([]protocol.CompletionItem, 0, len(types))
	for _, t := range types {
		items = append(items, protocol.CompletionItem{
			Label:            t,
			Kind:             protocol.CompletionKindKeyword,
			Detail:           "Media type",
			InsertText:       fmt.Sprintf("%s:\n  schema:\n    $0", t),
			InsertTextFormat: &snippetFmt,
			Data: map[string]interface{}{
				"resolveKind":  "mediaType",
				"resolveValue": t,
			},
		})
	}
	return items
}

func securitySchemeCompletions(idx *openapi.Index) []protocol.CompletionItem {
	names := idx.ComponentNames("securitySchemes")
	items := make([]protocol.CompletionItem, 0, len(names))
	for _, name := range names {
		items = append(items, protocol.CompletionItem{
			Label:            name,
			Kind:             protocol.CompletionKindField,
			Detail:           "Security scheme",
			InsertText:       fmt.Sprintf("- %s: [${1}]", snippetEscaper.Replace(name)),
			InsertTextFormat: &snippetFmt,
			Data: map[string]interface{}{
				"resolveKind":  "securityScheme",
				"resolveValue": name,
			},
		})
	}
	return items
}

func securityScopeCompletions(idx *openapi.Index, line string) []protocol.CompletionItem {
	if idx == nil || idx.Document == nil || idx.Document.Components == nil {
		return nil
	}
	schemeName := extractSecuritySchemeFromLine(line)
	items := make([]protocol.CompletionItem, 0)
	appendScopes := func(name string, ss *openapi.SecurityScheme) {
		if ss == nil || ss.Flows == nil {
			return
		}
		flows := []*openapi.OAuthFlow{
			ss.Flows.AuthorizationCode,
			ss.Flows.ClientCredentials,
			ss.Flows.Implicit,
			ss.Flows.Password,
		}
		for _, flow := range flows {
			if flow == nil || len(flow.Scopes) == 0 {
				continue
			}
			for scope, desc := range flow.Scopes {
				detail := "OAuth scope"
				if name != "" {
					detail = fmt.Sprintf("OAuth scope for %s", name)
				}
				if desc != "" {
					detail += ": " + desc
				}
				items = append(items, protocol.CompletionItem{
					Label:            scope,
					Kind:             protocol.CompletionKindField,
					Detail:           detail,
					InsertText:       scope,
					InsertTextFormat: &snippetFmt,
					SortText:         "scope_" + scope,
				})
			}
		}
	}

	if schemeName != "" {
		if ss, ok := idx.SecuritySchemes[schemeName]; ok {
			appendScopes(schemeName, ss)
			return items
		}
	}
	for name, ss := range idx.SecuritySchemes {
		appendScopes(name, ss)
	}
	return items
}

func tagCompletions(idx *openapi.Index) []protocol.CompletionItem {
	var items []protocol.CompletionItem
	for _, tag := range idx.Document.Tags {
		items = append(items, protocol.CompletionItem{
			Label:      tag.Name,
			Kind:       protocol.CompletionKindField,
			Detail:     truncate(tag.Description.Text, 60),
			InsertText: "- " + tag.Name,
			Data: map[string]interface{}{
				"resolveKind":  "tag",
				"resolveValue": tag.Name,
			},
		})
	}
	return items
}

func isResponseContext(line string) bool {
	trimmed := strings.TrimSpace(line)
	if strings.HasPrefix(trimmed, "responses:") {
		return true
	}
	// Match quoted status codes (e.g. '200':, "404":) that appear under responses.
	if (strings.HasPrefix(trimmed, "'") || strings.HasPrefix(trimmed, "\"")) && strings.Contains(trimmed, ":") {
		// Extract the quoted value and check if it looks like a status code.
		for _, q := range []byte{'"', '\''} {
			if trimmed[0] == q {
				end := strings.IndexByte(trimmed[1:], q)
				if end >= 0 {
					val := trimmed[1 : end+1]
					if val == "default" || (len(val) == 3 && val[0] >= '1' && val[0] <= '5') {
						return true
					}
				}
				break
			}
		}
	}
	return false
}

func isContentContext(line string) bool {
	trimmed := strings.TrimSpace(line)
	return strings.HasPrefix(trimmed, "content:")
}

func isPropertyContext(line string) bool {
	trimmed := strings.TrimSpace(line)
	return strings.HasPrefix(trimmed, "properties:")
}

func isHTTPMethodContext(line string) bool {
	trimmed := strings.TrimSpace(line)
	// User is likely adding a new HTTP method under a path
	for _, method := range []string{"get:", "post:", "put:", "patch:", "delete:", "options:", "head:", "trace:"} {
		if strings.HasPrefix(trimmed, method) {
			return true
		}
	}
	return false
}

func isHeaderContext(line string) bool {
	trimmed := strings.TrimSpace(line)
	return strings.HasPrefix(trimmed, "headers:")
}

func isPathTemplateContext(line string) bool {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "/") {
		return false
	}
	return strings.HasSuffix(trimmed, ":")
}

func isSecurityScopeContext(line string) bool {
	trimmed := strings.TrimSpace(line)
	// Examples:
	// - bearerAuth: [<cursor>]
	// bearerAuth: [<cursor>]
	return strings.Contains(trimmed, ": [") || strings.HasSuffix(trimmed, ":[")
}

func extractSecuritySchemeFromLine(line string) string {
	trimmed := strings.TrimSpace(line)
	trimmed = strings.TrimPrefix(trimmed, "- ")
	colon := strings.Index(trimmed, ":")
	if colon <= 0 {
		return ""
	}
	return strings.TrimSpace(trimmed[:colon])
}

func pathTemplateCompletions(idx *openapi.Index) []protocol.CompletionItem {
	if idx == nil || idx.Document == nil || len(idx.Document.Paths) == 0 {
		return nil
	}
	items := make([]protocol.CompletionItem, 0, len(idx.Document.Paths)+3)
	seen := map[string]bool{}

	// Derived suggestions based on existing paths in the same document.
	for path := range idx.Document.Paths {
		if seen[path] {
			continue
		}
		seen[path] = true
		items = append(items, protocol.CompletionItem{
			Label:            path,
			Kind:             protocol.CompletionKindSnippet,
			Detail:           "Existing path",
			InsertText:       path + ":",
			InsertTextFormat: &snippetFmt,
			SortText:         "path_existing_" + path,
		})

		// Suggest ID route variant for collection-style paths.
		idVariant := strings.TrimSuffix(path, "/") + "/{id}"
		if !seen[idVariant] {
			seen[idVariant] = true
			items = append(items, protocol.CompletionItem{
				Label:            idVariant,
				Kind:             protocol.CompletionKindSnippet,
				Detail:           "Path template with parameter",
				InsertText:       idVariant + ":",
				InsertTextFormat: &snippetFmt,
				SortText:         "path_variant_" + idVariant,
			})
		}
	}

	// Generic templates useful when starting a new path section.
	generic := []string{"/resources", "/resources/{resourceId}", "/resources/{resourceId}/subresources"}
	for _, p := range generic {
		if seen[p] {
			continue
		}
		items = append(items, protocol.CompletionItem{
			Label:            p,
			Kind:             protocol.CompletionKindSnippet,
			Detail:           "Path template",
			InsertText:       p + ":",
			InsertTextFormat: &snippetFmt,
			SortText:         "path_template_" + p,
		})
	}
	return items
}

// propertyPatternCompletions offers common schema property patterns.
func propertyPatternCompletions() []protocol.CompletionItem {
	patterns := []struct {
		name, typ, format, desc string
	}{
		{"id", "integer", "int64", "Unique identifier"},
		{"uuid", "string", "uuid", "UUID identifier"},
		{"name", "string", "", "Display name"},
		{"email", "string", "email", "Email address"},
		{"phone", "string", "", "Phone number"},
		{"description", "string", "", "Description text"},
		{"created_at", "string", "date-time", "Creation timestamp"},
		{"updated_at", "string", "date-time", "Last update timestamp"},
		{"status", "string", "", "Current status"},
		{"url", "string", "uri", "URL reference"},
		{"is_active", "boolean", "", "Whether item is active"},
		{"count", "integer", "int32", "Count value"},
		{"amount", "number", "double", "Monetary or measured amount"},
	}

	items := make([]protocol.CompletionItem, 0, len(patterns))
	for _, p := range patterns {
		var insertText string
		if p.format != "" {
			insertText = fmt.Sprintf("%s:\n  type: %s\n  format: %s\n  description: ${1:%s}", p.name, p.typ, p.format, snippetEscaper.Replace(p.desc))
		} else {
			insertText = fmt.Sprintf("%s:\n  type: %s\n  description: ${1:%s}", p.name, p.typ, snippetEscaper.Replace(p.desc))
		}
		items = append(items, protocol.CompletionItem{
			Label:            p.name,
			Kind:             protocol.CompletionKindProperty,
			Detail:           fmt.Sprintf("%s property (%s)", p.typ, p.desc),
			InsertText:       insertText,
			InsertTextFormat: &snippetFmt,
			SortText:         "property_" + p.name,
		})
	}
	return items
}

// operationTemplateCompletions offers full operation skeleton snippets.
func operationTemplateCompletions() []protocol.CompletionItem {
	methods := []struct {
		method, desc string
	}{
		{"get", "GET operation"},
		{"post", "POST operation with request body"},
		{"put", "PUT operation with request body"},
		{"patch", "PATCH operation with request body"},
		{"delete", "DELETE operation"},
	}

	items := make([]protocol.CompletionItem, 0, len(methods))
	for _, m := range methods {
		var insertText string
		if m.method == "get" || m.method == "delete" {
			insertText = fmt.Sprintf("%s:\n  summary: ${1:Summary}\n  operationId: ${2:operationId}\n  description: ${3:Description}\n  responses:\n    '200':\n      description: ${4:Success}\n    '404':\n      description: Not Found", m.method)
		} else {
			insertText = fmt.Sprintf("%s:\n  summary: ${1:Summary}\n  operationId: ${2:operationId}\n  description: ${3:Description}\n  requestBody:\n    required: true\n    content:\n      application/json:\n        schema:\n          $$ref: ${4:'#/components/schemas/Model'}\n  responses:\n    '200':\n      description: ${5:Success}\n    '400':\n      description: Bad Request", m.method)
		}
		items = append(items, protocol.CompletionItem{
			Label:            m.method + " (template)",
			Kind:             protocol.CompletionKindSnippet,
			Detail:           m.desc,
			InsertText:       insertText,
			InsertTextFormat: &snippetFmt,
			SortText:         "zz_template_" + m.method,
		})
	}
	return items
}

// headerCompletions offers standard HTTP header completions.
func headerCompletions() []protocol.CompletionItem {
	headers := []struct {
		name, desc, typ string
	}{
		{"X-Request-ID", "Unique request identifier", "string"},
		{"X-Rate-Limit-Limit", "Rate limit ceiling", "integer"},
		{"X-Rate-Limit-Remaining", "Rate limit remaining", "integer"},
		{"X-Rate-Limit-Reset", "Rate limit reset time", "integer"},
		{"X-Total-Count", "Total number of items", "integer"},
		{"ETag", "Entity tag for caching", "string"},
		{"X-Correlation-ID", "Correlation identifier for tracing", "string"},
		{"Retry-After", "Seconds to wait before retrying", "integer"},
	}

	items := make([]protocol.CompletionItem, 0, len(headers))
	for _, h := range headers {
		insertText := fmt.Sprintf("%s:\n  description: ${1:%s}\n  schema:\n    type: %s", h.name, snippetEscaper.Replace(h.desc), h.typ)
		items = append(items, protocol.CompletionItem{
			Label:            h.name,
			Kind:             protocol.CompletionKindField,
			Detail:           h.desc,
			InsertText:       insertText,
			InsertTextFormat: &snippetFmt,
			SortText:         "header_" + h.name,
		})
	}
	return items
}
