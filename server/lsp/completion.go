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
func NewCompletionHandler(cache *openapi.IndexCache) gossip.CompletionHandler {
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

		if isTagContext(line) && idx != nil {
			items = append(items, tagCompletions(idx)...)
		}

		return &protocol.CompletionList{
			IsIncomplete: false,
			Items:        items,
		}, nil
	}
}

// NewCompletionResolveHandler enriches a completion item with documentation.
func NewCompletionResolveHandler(cache *openapi.IndexCache) gossip.CompletionResolveHandler {
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
			item.Documentation = &protocol.MarkupContent{
				Kind:  protocol.Markdown,
				Value: fmt.Sprintf("Reference to `%s`", value),
			}
		case "securityScheme":
			item.Documentation = &protocol.MarkupContent{
				Kind:  protocol.Markdown,
				Value: fmt.Sprintf("Security scheme `%s`", value),
			}
		case "tag":
			item.Documentation = &protocol.MarkupContent{
				Kind:  protocol.Markdown,
				Value: fmt.Sprintf("Tag `%s`", value),
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
	return strings.HasPrefix(trimmed, "responses:") || strings.HasPrefix(trimmed, "'") || strings.HasPrefix(trimmed, "\"")
}

func isContentContext(line string) bool {
	trimmed := strings.TrimSpace(line)
	return strings.HasPrefix(trimmed, "content:")
}
