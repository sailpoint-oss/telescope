package lsp

import (
	"fmt"
	"sort"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewExecuteCommandHandler handles custom telescope commands.
// Commands expect a document URI as the first argument.
func NewExecuteCommandHandler(cache *openapi.IndexCache) gossip.ExecuteCommandHandler {
	return func(ctx *gossip.Context, params *protocol.ExecuteCommandParams) (interface{}, error) {
		uri := extractDocURI(params.Arguments)

		switch params.Command {
		case "telescope.sortTags":
			return executeSortTags(ctx, cache, uri)
		case "telescope.sortPaths":
			return executeSortPaths(ctx, cache, uri)
		case "telescope.generateResponseSkeletons":
			return executeGenerateResponses(ctx, cache, uri)
		default:
			return nil, nil
		}
	}
}

func extractDocURI(args []interface{}) protocol.DocumentURI {
	if len(args) == 0 {
		return ""
	}
	if s, ok := args[0].(string); ok {
		return protocol.DocumentURI(s)
	}
	return ""
}

func executeSortTags(ctx *gossip.Context, cache *openapi.IndexCache, uri protocol.DocumentURI) (interface{}, error) {
	idx := cache.Get(uri)
	if idx == nil || !idx.IsOpenAPI() {
		return nil, nil
	}

	doc := ctx.Documents.Get(uri)
	if doc == nil {
		return nil, nil
	}

	// Sort root-level tags alphabetically by name
	tags := make([]openapi.Tag, len(idx.Document.Tags))
	copy(tags, idx.Document.Tags)
	sort.Slice(tags, func(i, j int) bool {
		return tags[i].Name < tags[j].Name
	})

	// Build YAML replacement for the tags section
	if len(tags) == 0 {
		return nil, nil
	}

	isYAML := idx.Format == openapi.FormatYAML
	var sb strings.Builder
	for _, tag := range tags {
		if isYAML {
			sb.WriteString(fmt.Sprintf("  - name: %s\n", tag.Name))
			if tag.Description.Text != "" {
				sb.WriteString(fmt.Sprintf("    description: %s\n", tag.Description.Text))
			}
		} else {
			sb.WriteString(fmt.Sprintf("    {\"name\": \"%s\"", tag.Name))
			if tag.Description.Text != "" {
				sb.WriteString(fmt.Sprintf(", \"description\": \"%s\"", tag.Description.Text))
			}
			sb.WriteString("},\n")
		}
	}

	// Find the range of the tags array
	first := idx.Document.Tags[0]
	last := idx.Document.Tags[len(idx.Document.Tags)-1]
	editRange := protocol.Range{
		Start: first.Loc.Range.Start,
		End:   last.Loc.Range.End,
	}

	edit := &protocol.WorkspaceEdit{
		Changes: map[protocol.DocumentURI][]protocol.TextEdit{
			uri: {{Range: editRange, NewText: strings.TrimRight(sb.String(), "\n")}},
		},
	}

	if ctx.Client != nil {
		_, _ = ctx.Client.ApplyEdit(ctx, &protocol.ApplyWorkspaceEditParams{
			Label: "Sort tags",
			Edit:  *edit,
		})
	}

	return nil, nil
}

func executeSortPaths(ctx *gossip.Context, cache *openapi.IndexCache, uri protocol.DocumentURI) (interface{}, error) {
	idx := cache.Get(uri)
	if idx == nil || !idx.IsOpenAPI() || len(idx.Document.Paths) == 0 {
		return nil, nil
	}

	doc := ctx.Documents.Get(uri)
	if doc == nil {
		return nil, nil
	}

	// Collect path keys and sort them
	type pathEntry struct {
		key  string
		item *openapi.PathItem
	}

	entries := make([]pathEntry, 0, len(idx.Document.Paths))
	for path, item := range idx.Document.Paths {
		entries = append(entries, pathEntry{key: path, item: item})
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].key < entries[j].key
	})

	// Find the total range spanning all path items
	var startLine, endLine uint32
	first := true
	for _, e := range entries {
		r := e.item.Loc.Range
		if first || r.Start.Line < startLine {
			startLine = r.Start.Line
		}
		if first || r.End.Line > endLine {
			endLine = r.End.Line
		}
		first = false
	}

	// Get the original text and rebuild with sorted path order
	// For now, just return the sorted order as a rebuild
	isYAML := idx.Format == openapi.FormatYAML
	var sb strings.Builder
	for _, e := range entries {
		startL := e.item.Loc.Range.Start.Line
		endL := e.item.Loc.Range.End.Line
		for l := startL; l <= endL; l++ {
			lineContent := doc.LineAt(l)
			sb.WriteString(lineContent)
			if !strings.HasSuffix(lineContent, "\n") {
				sb.WriteString("\n")
			}
		}
	}
	_ = isYAML

	editRange := protocol.Range{
		Start: protocol.Position{Line: startLine, Character: 0},
		End:   protocol.Position{Line: endLine + 1, Character: 0},
	}

	edit := &protocol.WorkspaceEdit{
		Changes: map[protocol.DocumentURI][]protocol.TextEdit{
			uri: {{Range: editRange, NewText: sb.String()}},
		},
	}

	if ctx.Client != nil {
		_, _ = ctx.Client.ApplyEdit(ctx, &protocol.ApplyWorkspaceEditParams{
			Label: "Sort paths",
			Edit:  *edit,
		})
	}

	return nil, nil
}

func executeGenerateResponses(ctx *gossip.Context, cache *openapi.IndexCache, uri protocol.DocumentURI) (interface{}, error) {
	idx := cache.Get(uri)
	if idx == nil || !idx.IsOpenAPI() {
		return nil, nil
	}

	isYAML := idx.Format == openapi.FormatYAML
	var edits []protocol.TextEdit

	for _, item := range idx.Document.Paths {
		for _, mo := range item.Operations() {
			op := mo.Operation
			responses := op.Responses

			has2xx := false
			has4xx := false
			has5xx := false
			for code := range responses {
				if strings.HasPrefix(code, "2") {
					has2xx = true
				}
				if strings.HasPrefix(code, "4") {
					has4xx = true
				}
				if strings.HasPrefix(code, "5") {
					has5xx = true
				}
			}

			var missing []string
			if !has2xx {
				missing = append(missing, "200")
			}
			if !has4xx {
				missing = append(missing, "400")
			}
			if !has5xx {
				missing = append(missing, "500")
			}

			if len(missing) == 0 {
				continue
			}

			// Insert at the end of the responses block
			insertLine := op.Loc.Range.End.Line
			for _, resp := range responses {
				if resp == nil {
					continue
				}
				if resp.Loc.Range.End.Line > insertLine-1 {
					insertLine = resp.Loc.Range.End.Line
				}
			}

			var sb strings.Builder
			for _, code := range missing {
				desc := statusDescription(code)
				if isYAML {
					sb.WriteString(fmt.Sprintf("        '%s':\n          description: %s\n", code, desc))
				} else {
					sb.WriteString(fmt.Sprintf("          \"%s\": {\"description\": \"%s\"},\n", code, desc))
				}
			}

			edits = append(edits, protocol.TextEdit{
				Range: protocol.Range{
					Start: protocol.Position{Line: insertLine, Character: 0},
					End:   protocol.Position{Line: insertLine, Character: 0},
				},
				NewText: sb.String(),
			})
		}
	}

	if len(edits) == 0 {
		return nil, nil
	}

	edit := &protocol.WorkspaceEdit{
		Changes: map[protocol.DocumentURI][]protocol.TextEdit{uri: edits},
	}

	if ctx.Client != nil {
		_, _ = ctx.Client.ApplyEdit(ctx, &protocol.ApplyWorkspaceEditParams{
			Label: "Generate response skeletons",
			Edit:  *edit,
		})
	}

	return nil, nil
}

func statusDescription(code string) string {
	switch code {
	case "200":
		return "OK"
	case "201":
		return "Created"
	case "204":
		return "No Content"
	case "400":
		return "Bad Request"
	case "401":
		return "Unauthorized"
	case "403":
		return "Forbidden"
	case "404":
		return "Not Found"
	case "500":
		return "Internal Server Error"
	default:
		return "Response"
	}
}
