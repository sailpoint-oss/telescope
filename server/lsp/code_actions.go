package lsp

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/jsonschema"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/rules/analyzers"
)

// NewCodeActionHandler provides quick fixes, rule suppression, and refactoring actions.
func NewCodeActionHandler(cache *openapi.IndexCache) gossip.CodeActionHandler {
	return func(ctx *gossip.Context, params *protocol.CodeActionParams) ([]protocol.CodeAction, error) {
		uri := params.TextDocument.URI
		idx := cache.Get(uri)
		doc := ctx.Documents.Get(uri)

		var actions []protocol.CodeAction

		// Diagnostic-triggered actions
		for _, diag := range params.Context.Diagnostics {
			if diag.Source == "oas3-schema" {
				if action := invalidKeyQuickFix(uri, diag); action != nil {
					actions = append(actions, *action)
				}
				continue
			}

			if diag.Source != rules.Source {
				continue
			}

			// Markdown heading fix code actions
			if action := markdownHeadingQuickFix(uri, doc, diag); action != nil {
				actions = append(actions, *action)
			}

			ruleID := ""
			if diag.Code != nil {
				if s, ok := diag.Code.(string); ok {
					ruleID = s
				}
			}

			if ruleID != "" {
				actions = append(actions, protocol.CodeAction{
					Title:       fmt.Sprintf("Suppress '%s' for this line", ruleID),
					Kind:        "quickfix",
					IsPreferred: true,
					Diagnostics: []protocol.Diagnostic{diag},
					Edit: &protocol.WorkspaceEdit{
						Changes: map[protocol.DocumentURI][]protocol.TextEdit{
							uri: {
								{
									Range: protocol.Range{
										Start: protocol.Position{Line: diag.Range.Start.Line, Character: 0},
										End:   protocol.Position{Line: diag.Range.Start.Line, Character: 0},
									},
									NewText: fmt.Sprintf("# x-telescope-ignore: %s\n", ruleID),
								},
							},
						},
					},
				})

				meta, ok := rules.DefaultRegistry.Get(ruleID)
				if ok && meta.DocURL != "" {
					actions = append(actions, protocol.CodeAction{
						Title:       fmt.Sprintf("View documentation for '%s'", ruleID),
						Kind:        "quickfix",
						Diagnostics: []protocol.Diagnostic{diag},
						Command: &protocol.Command{
							Title:     "Open Rule Documentation",
							Command:   "vscode.open",
							Arguments: []interface{}{meta.DocURL},
						},
					})
				}
			}
		}

		// Context-aware refactoring actions
		if idx == nil || doc == nil {
			return actions, nil
		}

		line := doc.LineAt(params.Range.Start.Line)
		isYAML := idx.Format == openapi.FormatYAML

		// Check if we're inside an operation
		for path, item := range idx.Document.Paths {
			for _, mo := range item.Operations() {
				op := mo.Operation
				opRange := op.Loc.Range
				if !rangeContains(opRange, params.Range) {
					continue
				}

				// Add description if missing
				if op.Description.Text == "" {
					actions = append(actions, addFieldAction(uri, "Add description", "description", opRange, isYAML))
				}

				// Add summary if missing
				if op.Summary == "" {
					actions = append(actions, addFieldAction(uri, "Add summary", "summary", opRange, isYAML))
				}

				// Add operationId if missing
				if op.OperationID == "" {
					opID := generateOperationID(mo.Method, path)
					insertLine := opRange.Start.Line + 1
					newText := fmt.Sprintf("  operationId: %s\n", opID)
					if !isYAML {
						newText = fmt.Sprintf("  \"operationId\": \"%s\",\n", opID)
					}
					actions = append(actions, protocol.CodeAction{
						Title: fmt.Sprintf("Add operationId '%s'", opID),
						Kind:  "refactor",
						Edit: &protocol.WorkspaceEdit{
							Changes: map[protocol.DocumentURI][]protocol.TextEdit{
								uri: {{
									Range: protocol.Range{
										Start: protocol.Position{Line: insertLine, Character: 0},
										End:   protocol.Position{Line: insertLine, Character: 0},
									},
									NewText: newText,
								}},
							},
						},
					})
				}
			}

			// Kebab-case path action
			if strings.Contains(line, path) && path != toKebabCase(path) {
				kebab := toKebabCase(path)
				actions = append(actions, protocol.CodeAction{
					Title: fmt.Sprintf("Convert path to kebab-case: %s", kebab),
					Kind:  "refactor",
					Edit: &protocol.WorkspaceEdit{
						Changes: map[protocol.DocumentURI][]protocol.TextEdit{
							uri: {{
								Range:   item.PathLoc.Range,
								NewText: kebab,
							}},
						},
					},
				})
			}
		}

		return actions, nil
	}
}

func invalidKeyQuickFix(uri protocol.DocumentURI, diag protocol.Diagnostic) *protocol.CodeAction {
	if diag.Data == nil {
		return nil
	}

	var keyData jsonschema.InvalidKeyData

	switch d := diag.Data.(type) {
	case jsonschema.InvalidKeyData:
		keyData = d
	case map[string]interface{}:
		raw, _ := json.Marshal(d)
		if err := json.Unmarshal(raw, &keyData); err != nil {
			return nil
		}
	default:
		return nil
	}

	if keyData.Kind != "invalid_key" || keyData.SuggestTo == "" {
		return nil
	}

	return &protocol.CodeAction{
		Title:       fmt.Sprintf("Rename to '%s'", keyData.SuggestTo),
		Kind:        "quickfix",
		IsPreferred: true,
		Diagnostics: []protocol.Diagnostic{diag},
		Edit: &protocol.WorkspaceEdit{
			Changes: map[protocol.DocumentURI][]protocol.TextEdit{
				uri: {{
					Range:   diag.Range,
					NewText: keyData.SuggestTo,
				}},
			},
		},
	}
}

// markdownHeadingQuickFix offers code actions for description-markdown diagnostics
// that carry HeadingFixData (skipped heading level or empty heading).
func markdownHeadingQuickFix(uri protocol.DocumentURI, doc interface{ LineAt(uint32) string }, diag protocol.Diagnostic) *protocol.CodeAction {
	if diag.Code != "description-markdown" || diag.Data == nil {
		return nil
	}

	var fixData analyzers.HeadingFixData
	switch d := diag.Data.(type) {
	case analyzers.HeadingFixData:
		fixData = d
	case map[string]interface{}:
		raw, _ := json.Marshal(d)
		if err := json.Unmarshal(raw, &fixData); err != nil {
			return nil
		}
	default:
		return nil
	}

	switch fixData.Kind {
	case "skipped-heading":
		if fixData.ExpectedLevel == 0 || fixData.ActualLevel == 0 {
			return nil
		}
		line := doc.LineAt(diag.Range.Start.Line)
		oldPrefix := strings.Repeat("#", fixData.ActualLevel)
		newPrefix := strings.Repeat("#", fixData.ExpectedLevel)
		newLine := strings.Replace(line, oldPrefix, newPrefix, 1)
		return &protocol.CodeAction{
			Title:       fmt.Sprintf("Fix heading level (h%d → h%d)", fixData.ActualLevel, fixData.ExpectedLevel),
			Kind:        "quickfix",
			IsPreferred: true,
			Diagnostics: []protocol.Diagnostic{diag},
			Edit: &protocol.WorkspaceEdit{
				Changes: map[protocol.DocumentURI][]protocol.TextEdit{
					uri: {{
						Range: protocol.Range{
							Start: protocol.Position{Line: diag.Range.Start.Line, Character: 0},
							End:   protocol.Position{Line: diag.Range.Start.Line, Character: uint32(len(line))},
						},
						NewText: newLine,
					}},
				},
			},
		}

	case "empty-heading":
		return &protocol.CodeAction{
			Title:       "Remove empty heading",
			Kind:        "quickfix",
			IsPreferred: true,
			Diagnostics: []protocol.Diagnostic{diag},
			Edit: &protocol.WorkspaceEdit{
				Changes: map[protocol.DocumentURI][]protocol.TextEdit{
					uri: {{
						Range: protocol.Range{
							Start: protocol.Position{Line: diag.Range.Start.Line, Character: 0},
							End:   protocol.Position{Line: diag.Range.Start.Line + 1, Character: 0},
						},
						NewText: "",
					}},
				},
			},
		}
	}

	return nil
}

func addFieldAction(uri protocol.DocumentURI, title, field string, opRange protocol.Range, isYAML bool) protocol.CodeAction {
	insertLine := opRange.Start.Line + 1
	newText := fmt.Sprintf("  %s: \"TODO: Add %s\"\n", field, field)
	if !isYAML {
		newText = fmt.Sprintf("  \"%s\": \"TODO: Add %s\",\n", field, field)
	}
	return protocol.CodeAction{
		Title: title,
		Kind:  "refactor",
		Edit: &protocol.WorkspaceEdit{
			Changes: map[protocol.DocumentURI][]protocol.TextEdit{
				uri: {{
					Range: protocol.Range{
						Start: protocol.Position{Line: insertLine, Character: 0},
						End:   protocol.Position{Line: insertLine, Character: 0},
					},
					NewText: newText,
				}},
			},
		},
	}
}

func generateOperationID(method, path string) string {
	segments := strings.Split(strings.Trim(path, "/"), "/")
	var parts []string
	for _, seg := range segments {
		seg = strings.TrimPrefix(seg, "{")
		seg = strings.TrimSuffix(seg, "}")
		if seg == "" {
			continue
		}
		parts = append(parts, capitalizeFirst(seg))
	}
	return strings.ToLower(method) + strings.Join(parts, "")
}

func capitalizeFirst(s string) string {
	if s == "" {
		return s
	}
	runes := []rune(s)
	runes[0] = unicode.ToUpper(runes[0])
	return string(runes)
}

// toKebabCase converts camelCase path segments to kebab-case, preserving {params}.
func toKebabCase(path string) string {
	segments := strings.Split(path, "/")
	for i, seg := range segments {
		if strings.HasPrefix(seg, "{") && strings.HasSuffix(seg, "}") {
			continue
		}
		segments[i] = camelToKebab(seg)
	}
	return strings.Join(segments, "/")
}

func camelToKebab(s string) string {
	var result strings.Builder
	for i, r := range s {
		if unicode.IsUpper(r) && i > 0 {
			result.WriteByte('-')
		}
		result.WriteRune(unicode.ToLower(r))
	}
	return result.String()
}
