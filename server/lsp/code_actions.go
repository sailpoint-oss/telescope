package lsp

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/jsonschema"
	"github.com/LukasParke/gossip/protocol"
	barrelAnalyzers "github.com/sailpoint-oss/barrelman/analyzers"
	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/vacuum"
)

// lineEndCharUTF16 returns the length of the line in UTF-16 code units,
// suitable for use as an LSP Position.Character at end-of-line.
func lineEndCharUTF16(line string) uint32 {
	return utf16LenStr(line)
}

// NewCodeActionHandler provides quick fixes, rule suppression, and refactoring actions.
func NewCodeActionHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.CodeActionHandler {
	return func(ctx *gossip.Context, params *protocol.CodeActionParams) ([]protocol.CodeAction, error) {
		uri := params.TextDocument.URI
		idx := cache.Get(uri)
		doc := ctx.Documents.Get(uri)

		if idx != nil && idx.IsMalformed() {
			return nil, nil
		}

		var actions []protocol.CodeAction
		var vacuumDiagnostics []protocol.Diagnostic

		// Scaffolding code actions when cursor is on a path
		if idx != nil && doc != nil {
			actions = append(actions, scaffoldingActions(uri, idx, doc, params)...)
		}

		// Diagnostic-triggered actions
		for _, diag := range params.Context.Diagnostics {
			if diag.Source == vacuum.Source {
				vacuumDiagnostics = append(vacuumDiagnostics, diag)
				continue
			}
			if diag.Source == "oas3-schema" {
				if action := invalidKeyQuickFix(uri, diag); action != nil {
					actions = append(actions, *action)
				}
				continue
			}

			if diag.Source != rules.Source {
				continue
			}

			// Markdown heading fix code actions (doc may be nil if the document was closed)
			if doc != nil {
				if action := markdownHeadingQuickFix(uri, doc, diag); action != nil {
					actions = append(actions, *action)
				}
				if idx != nil {
					if action := diagnosticReplacementQuickFix(uri, diag, idx, doc, cache); action != nil {
						actions = append(actions, *action)
					}
				}
			}

			ruleID := ""
			if diag.Code != nil {
				if s, ok := diag.Code.(string); ok {
					ruleID = s
				}
			}

			if ruleID != "" {
				// SailPoint rule auto-fix (Phase 2 codemod framework).
				// Offered first so it appears above the Suppress /
				// View-docs actions in editor menus.
				var navIdx *navigator.Index
				if idx != nil {
					navIdx = idx.NavigatorIndex()
				}
				actions = append(actions, sailpointFixActions(uri, navIdx, doc, diag)...)

				actions = append(actions, protocol.CodeAction{
					Title:       fmt.Sprintf("Suppress '%s' for this line", ruleID),
					Kind:        "quickfix",
					IsPreferred: false,
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

		if len(vacuumDiagnostics) > 0 && doc != nil {
			if edit := vacuumFixAllEdit(ctx, uri, doc); edit != nil {
				actions = append(actions, protocol.CodeAction{
					Title:       "Apply Vacuum auto-fixes",
					Kind:        "quickfix",
					Diagnostics: append([]protocol.Diagnostic(nil), vacuumDiagnostics...),
					Edit:        edit,
				})
			}
		}

		// "Fix All" source action: collect all auto-fixable diagnostics
		if params.Context.Only != nil {
			for _, kind := range params.Context.Only {
				if kind == "source.fixAll.telescope" || kind == "source.fixAll" {
					fixAllAction := buildFixAllAction(uri, doc, idx, params.Context.Diagnostics)
					if fixAllAction != nil {
						actions = append(actions, *fixAllAction)
					}
				}
				if kind == "source.fixAll.vacuum" || kind == "source.fixAll" {
					if edit := vacuumFixAllEdit(ctx, uri, doc); edit != nil {
						actions = append(actions, protocol.CodeAction{
							Title: "Fix all Vacuum auto-fixable issues",
							Kind:  "source.fixAll.vacuum",
							Edit:  edit,
						})
					}
				}
			}
		}

		// Context-aware refactoring actions
		if idx == nil || doc == nil {
			return actions, nil
		}

		line := doc.LineAt(params.Range.Start.Line)
		isYAML := idx.Format == openapi.FormatYAML

		if action := infoQuickFixAction(uri, idx, doc, params); action != nil {
			actions = append(actions, *action)
		}

		// Example/schema validation action for quick manual verification while authoring.
		trimmedLine := strings.TrimSpace(line)
		if strings.HasPrefix(trimmedLine, "example:") || strings.HasPrefix(trimmedLine, "examples:") {
			actions = append(actions, protocol.CodeAction{
				Title: "Validate examples against schema types",
				Kind:  "quickfix",
				Command: &protocol.Command{
					Title:     "Validate examples",
					Command:   "telescope.validateExamples",
					Arguments: []interface{}{string(uri)},
				},
			})
		}

		// Check if we're inside an operation
		for path, item := range idx.Document.Paths {
			for _, mo := range item.Operations() {
				op := mo.Operation
				opRange := operationContextRange(op)
				if !rangeContains(opRange, params.Range) {
					continue
				}

				// Add description if missing
				if op.Description.Text == "" {
					actions = append(actions, addFieldAction(uri, "Add description", "description", adapt.RangeToProtocol(op.Loc.Range), isYAML))
				}

				// Add summary if missing
				if op.Summary == "" {
					actions = append(actions, addFieldAction(uri, "Add summary", "summary", adapt.RangeToProtocol(op.Loc.Range), isYAML))
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

				if action := missingResponsesQuickFix(uri, path, mo.Method, op, doc, isYAML); action != nil {
					actions = append(actions, *action)
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
								Range:   adapt.RangeToProtocol(item.PathLoc.Range),
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

	var fixData barrelAnalyzers.HeadingFixData
	switch d := diag.Data.(type) {
	case barrelAnalyzers.HeadingFixData:
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
							End:   protocol.Position{Line: diag.Range.Start.Line, Character: lineEndCharUTF16(line)},
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

func infoQuickFixAction(
	uri protocol.DocumentURI,
	idx *openapi.Index,
	doc interface{ LineAt(uint32) string },
	params *protocol.CodeActionParams,
) *protocol.CodeAction {
	if idx == nil || idx.Document == nil || idx.Format != openapi.FormatYAML {
		return nil
	}
	if idx.Document.Info == nil {
		if params.Range.Start.Line > 2 && !diagnosticsContain(params.Context.Diagnostics, "`info`") {
			return nil
		}
	} else {
		infoRange := adapt.RangeToProtocol(idx.Document.Info.Loc.Range)
		if !rangeContains(infoRange, params.Range) && !diagnosticsContain(params.Context.Diagnostics, "`info.") {
			return nil
		}
	}

	title, edit, ok := infoQuickFixEdit(doc, idx)
	if !ok {
		return nil
	}

	var related []protocol.Diagnostic
	for _, diag := range params.Context.Diagnostics {
		if diag.Source == "oas3-schema" && strings.Contains(diag.Message, "`info.") {
			related = append(related, diag)
		}
	}

	return &protocol.CodeAction{
		Title:       title,
		Kind:        "quickfix",
		IsPreferred: true,
		Diagnostics: related,
		Edit: &protocol.WorkspaceEdit{
			Changes: map[protocol.DocumentURI][]protocol.TextEdit{
				uri: {edit},
			},
		},
	}
}

func infoQuickFixEdit(
	doc interface{ LineAt(uint32) string },
	idx *openapi.Index,
) (string, protocol.TextEdit, bool) {
	if idx == nil || idx.Document == nil || idx.Format != openapi.FormatYAML {
		return "", protocol.TextEdit{}, false
	}

	if idx.Document.Info == nil {
		insertLine := firstVersionInsertionLine(doc)
		return "Add info block (title + version)", protocol.TextEdit{
			Range: protocol.Range{
				Start: protocol.Position{Line: insertLine, Character: 0},
				End:   protocol.Position{Line: insertLine, Character: 0},
			},
			NewText: "info:\n  title: TODO title\n  version: \"1.0.0\"\n",
		}, true
	}

	info := idx.Document.Info
	childIndent := nestedIndent(doc.LineAt(info.Loc.Range.Start.Line))
	insertLine := info.Loc.Range.Start.Line + 1

	switch {
	case info.Title == "" && info.Version == "":
		return "Add info.title and info.version", protocol.TextEdit{
			Range: protocol.Range{
				Start: protocol.Position{Line: insertLine, Character: 0},
				End:   protocol.Position{Line: insertLine, Character: 0},
			},
			NewText: childIndent + "title: TODO title\n" + childIndent + "version: \"1.0.0\"\n",
		}, true
	case info.Title == "":
		if !isZeroRange(adapt.RangeToProtocol(info.VersionLoc.Range)) {
			insertLine = info.VersionLoc.Range.Start.Line
		}
		return "Add info.title", protocol.TextEdit{
			Range: protocol.Range{
				Start: protocol.Position{Line: insertLine, Character: 0},
				End:   protocol.Position{Line: insertLine, Character: 0},
			},
			NewText: childIndent + "title: TODO title\n",
		}, true
	case info.Version == "":
		if !isZeroRange(adapt.RangeToProtocol(info.TitleLoc.Range)) {
			insertLine = info.TitleLoc.Range.End.Line + 1
		}
		return "Add info.version", protocol.TextEdit{
			Range: protocol.Range{
				Start: protocol.Position{Line: insertLine, Character: 0},
				End:   protocol.Position{Line: insertLine, Character: 0},
			},
			NewText: childIndent + "version: \"1.0.0\"\n",
		}, true
	default:
		return "", protocol.TextEdit{}, false
	}
}

func missingResponsesQuickFix(
	uri protocol.DocumentURI,
	path string,
	method string,
	op *openapi.Operation,
	doc interface{ LineAt(uint32) string },
	isYAML bool,
) *protocol.CodeAction {
	title, edit, ok := missingResponsesEdit(path, method, op, doc, isYAML)
	if !ok {
		return nil
	}
	return &protocol.CodeAction{
		Title:       title,
		Kind:        "quickfix",
		IsPreferred: true,
		Edit: &protocol.WorkspaceEdit{
			Changes: map[protocol.DocumentURI][]protocol.TextEdit{
				uri: {edit},
			},
		},
	}
}

func missingResponsesEdit(
	path string,
	method string,
	op *openapi.Operation,
	doc interface{ LineAt(uint32) string },
	isYAML bool,
) (string, protocol.TextEdit, bool) {
	if !isYAML || op == nil || len(op.Responses) > 0 {
		return "", protocol.TextEdit{}, false
	}

	insertLine := op.Loc.Range.End.Line + 1
	childIndent := nestedIndent(doc.LineAt(op.Loc.Range.Start.Line))
	newText := childIndent + "responses:\n" +
		childIndent + "  \"200\":\n" +
		childIndent + "    description: Success\n"

	return fmt.Sprintf("Add default 200 response to %s %s", strings.ToUpper(method), path), protocol.TextEdit{
		Range: protocol.Range{
			Start: protocol.Position{Line: insertLine, Character: 0},
			End:   protocol.Position{Line: insertLine, Character: 0},
		},
		NewText: newText,
	}, true
}

func operationContextRange(op *openapi.Operation) protocol.Range {
	if op == nil {
		return protocol.Range{}
	}
	methodRange := adapt.RangeToProtocol(openapi.LocOrFallback(op.MethodLoc, op.Loc).Range)
	bodyRange := adapt.RangeToProtocol(op.Loc.Range)
	if isZeroRange(methodRange) {
		return bodyRange
	}
	if isZeroRange(bodyRange) {
		return methodRange
	}
	return protocol.Range{
		Start: methodRange.Start,
		End:   bodyRange.End,
	}
}

func diagnosticReplacementQuickFix(
	uri protocol.DocumentURI,
	diag protocol.Diagnostic,
	idx *openapi.Index,
	doc interface{ LineAt(uint32) string },
	cache *openapi.IndexCache,
) *protocol.CodeAction {
	replacement := suggestionFromMessage(diag.Message)
	code, _ := diag.Code.(string)

	if replacement == "" && code == "unresolved-ref" {
		line := doc.LineAt(diag.Range.Start.Line)
		refTarget := extractRefFromLine(line)
		if refTarget == "" {
			return nil
		}
		replacement = suggestRefReplacement(string(uri), refTarget, idx, cache)
		if replacement == "" || replacement == refTarget {
			return nil
		}
	}

	if replacement == "" {
		return nil
	}

	title := fmt.Sprintf("Replace with '%s'", replacement)
	if code == "unresolved-ref" || strings.Contains(diag.Message, "$ref") {
		title = fmt.Sprintf("Replace $ref with '%s'", replacement)
	}

	return &protocol.CodeAction{
		Title:       title,
		Kind:        "quickfix",
		IsPreferred: true,
		Diagnostics: []protocol.Diagnostic{diag},
		Edit: &protocol.WorkspaceEdit{
			Changes: map[protocol.DocumentURI][]protocol.TextEdit{
				uri: {{
					Range:   diag.Range,
					NewText: replacement,
				}},
			},
		},
	}
}

func suggestionFromMessage(message string) string {
	const marker = "Did you mean '"
	start := strings.Index(message, marker)
	if start < 0 {
		return ""
	}
	rest := message[start+len(marker):]
	end := strings.Index(rest, "'")
	if end < 0 {
		return ""
	}
	return rest[:end]
}

func suggestRefReplacement(baseURI string, ref string, idx *openapi.Index, cache *openapi.IndexCache) string {
	if ref == "" {
		return ""
	}
	if strings.HasPrefix(ref, "#") {
		return suggestLocalRef(idx, ref)
	}

	filePart, pointer, external := splitExternalRef(ref)
	if !external || filePart == "" {
		return ""
	}

	bestFilePart := filePart
	bestPointer := pointer
	changed := false

	targetURI := protocol.NormalizeURI(protocol.DocumentURI(graphResolveRefTarget(baseURI, ref)))
	targetIdx := cache.Get(targetURI)
	if targetIdx == nil {
		if suggestedPath := suggestExternalRefPath(baseURI, filePart, cache); suggestedPath != "" && suggestedPath != filePart {
			bestFilePart = suggestedPath
			changed = true
			refWithSuggestedPath := bestFilePart
			if bestPointer != "" {
				refWithSuggestedPath += "#" + strings.TrimPrefix(bestPointer, "#")
			}
			targetURI = protocol.NormalizeURI(protocol.DocumentURI(graphResolveRefTarget(baseURI, refWithSuggestedPath)))
			targetIdx = cache.Get(targetURI)
		}
	}

	if targetIdx != nil {
		if suggestedPointer := suggestPointerInIndex(targetIdx, pointer); suggestedPointer != "" && suggestedPointer != pointer {
			bestPointer = suggestedPointer
			changed = true
		}
	}

	if !changed {
		return ""
	}
	if bestPointer == "" {
		return bestFilePart
	}
	return bestFilePart + "#" + strings.TrimPrefix(bestPointer, "#")
}

func suggestLocalRef(idx *openapi.Index, ref string) string {
	suggestion := suggestPointerInIndex(idx, strings.TrimPrefix(ref, "#"))
	if suggestion == "" {
		return ""
	}
	return "#" + strings.TrimPrefix(suggestion, "#")
}

func suggestPointerInIndex(idx *openapi.Index, pointer string) string {
	if idx == nil || pointer == "" {
		return ""
	}
	if _, err := idx.Resolve("#" + strings.TrimPrefix(pointer, "#")); err == nil {
		return ""
	}

	parts := strings.Split(strings.TrimPrefix(pointer, "/"), "/")
	if len(parts) != 3 || parts[0] != "components" {
		return ""
	}

	kind := parts[1]
	name := unescapePointerSegment(parts[2])
	suggestion := closestStringSuggestion(name, componentNamesForKind(idx, kind))
	if suggestion == "" {
		return ""
	}

	return "/components/" + kind + "/" + escapePointerSegment(suggestion)
}

func componentNamesForKind(idx *openapi.Index, kind string) []string {
	if idx == nil || idx.Document == nil || idx.Document.Components == nil {
		return nil
	}
	if kind == "pathItems" {
		names := make([]string, 0, len(idx.Document.Components.PathItems))
		for name := range idx.Document.Components.PathItems {
			names = append(names, name)
		}
		return names
	}
	return idx.ComponentNames(kind)
}

func suggestExternalRefPath(baseURI string, filePart string, cache *openapi.IndexCache) string {
	if cache == nil {
		return ""
	}

	basePath := uriToFSPath(baseURI)
	if basePath == "" {
		return ""
	}

	baseDir := filepath.Dir(basePath)
	best := ""
	bestDist := len(filePart)/2 + 1

	for uri := range cache.All() {
		targetPath := uriToFSPath(string(uri))
		if targetPath == "" || targetPath == basePath {
			continue
		}

		rel, err := filepath.Rel(baseDir, targetPath)
		if err != nil {
			continue
		}
		rel = normalizeRelativeRefPath(filepath.ToSlash(rel))
		dist := levenshteinDistance(strings.ToLower(filePart), strings.ToLower(rel))
		if dist < bestDist {
			bestDist = dist
			best = rel
		}
	}

	return best
}

func diagnosticsContain(diags []protocol.Diagnostic, needle string) bool {
	for _, diag := range diags {
		if strings.Contains(diag.Message, needle) {
			return true
		}
	}
	return false
}

func nestedIndent(line string) string {
	return leadingWhitespace(line) + "  "
}

func leadingWhitespace(line string) string {
	i := 0
	for i < len(line) && (line[i] == ' ' || line[i] == '\t') {
		i++
	}
	return line[:i]
}

func firstVersionInsertionLine(doc interface{ LineAt(uint32) string }) uint32 {
	for lineNum := uint32(0); lineNum < 12; lineNum++ {
		line := strings.TrimSpace(doc.LineAt(lineNum))
		if strings.HasPrefix(line, "openapi:") || strings.HasPrefix(line, "swagger:") {
			return lineNum + 1
		}
	}
	return 0
}

func normalizeRelativeRefPath(rel string) string {
	if rel == "" || strings.HasPrefix(rel, "../") || strings.HasPrefix(rel, "./") {
		return rel
	}
	return "./" + rel
}

func closestStringSuggestion(target string, candidates []string) string {
	if target == "" || len(candidates) == 0 {
		return ""
	}
	best := ""
	bestDist := len(target)/2 + 1
	for _, candidate := range candidates {
		dist := levenshteinDistance(strings.ToLower(target), strings.ToLower(candidate))
		if dist < bestDist {
			bestDist = dist
			best = candidate
		}
	}
	return best
}

func levenshteinDistance(a string, b string) int {
	if a == "" {
		return len(b)
	}
	if b == "" {
		return len(a)
	}

	prev := make([]int, len(b)+1)
	curr := make([]int, len(b)+1)
	for j := 0; j <= len(b); j++ {
		prev[j] = j
	}

	for i := 1; i <= len(a); i++ {
		curr[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			curr[j] = min3(curr[j-1]+1, prev[j]+1, prev[j-1]+cost)
		}
		prev, curr = curr, prev
	}

	return prev[len(b)]
}

func min3(a int, b int, c int) int {
	if a > b {
		a = b
	}
	if a > c {
		a = c
	}
	return a
}

func escapePointerSegment(s string) string {
	s = strings.ReplaceAll(s, "~", "~0")
	return strings.ReplaceAll(s, "/", "~1")
}

func unescapePointerSegment(s string) string {
	s = strings.ReplaceAll(s, "~1", "/")
	return strings.ReplaceAll(s, "~0", "~")
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

// scaffoldingActions returns context-aware scaffolding code actions for path items.
func scaffoldingActions(uri protocol.DocumentURI, idx *openapi.Index, doc interface{ LineAt(uint32) string }, params *protocol.CodeActionParams) []protocol.CodeAction {
	if idx == nil || !idx.IsOpenAPI() {
		return nil
	}

	var actions []protocol.CodeAction
	isYAML := idx.Format == openapi.FormatYAML
	_ = isYAML

	line := doc.LineAt(params.Range.Start.Line)

	for path, item := range idx.Document.Paths {
		if !strings.Contains(line, path) {
			continue
		}
		if !rangeContains(adapt.RangeToProtocol(item.Loc.Range), params.Range) {
			continue
		}

		// Offer "Add standard error responses" for operations missing error responses
		for _, mo := range item.Operations() {
			op := mo.Operation
			if !rangeContains(adapt.RangeToProtocol(op.Loc.Range), params.Range) {
				continue
			}

			hasError := false
			for code := range op.Responses {
				if strings.HasPrefix(code, "4") || strings.HasPrefix(code, "5") || code == "default" {
					hasError = true
					break
				}
			}

			if !hasError && len(op.Responses) > 0 {
				// Find the end of the responses block
				var lastLine uint32
				for _, resp := range op.Responses {
					if resp.Loc.Range.End.Line > lastLine {
						lastLine = resp.Loc.Range.End.Line
					}
				}
				insertLine := lastLine + 1
				errorText := "        '400':\n          description: Bad Request\n        '401':\n          description: Unauthorized\n        '404':\n          description: Not Found\n        '500':\n          description: Internal Server Error\n"

				actions = append(actions, protocol.CodeAction{
					Title: "Add standard error responses (400, 401, 404, 500)",
					Kind:  "refactor",
					Edit: &protocol.WorkspaceEdit{
						Changes: map[protocol.DocumentURI][]protocol.TextEdit{
							uri: {{
								Range: protocol.Range{
									Start: protocol.Position{Line: insertLine, Character: 0},
									End:   protocol.Position{Line: insertLine, Character: 0},
								},
								NewText: errorText,
							}},
						},
					},
				})
			}

			// Offer "Add pagination parameters" for GET operations without pagination
			if strings.ToUpper(mo.Method) == "GET" {
				hasPagination := false
				paginationNames := map[string]bool{"page": true, "pageSize": true, "limit": true, "offset": true, "cursor": true}
				for _, p := range op.Parameters {
					if paginationNames[p.Name] {
						hasPagination = true
						break
					}
				}

				if !hasPagination {
					insertLine := op.Loc.Range.Start.Line + 1
					paginationText := "      parameters:\n        - name: page\n          in: query\n          description: Page number\n          schema:\n            type: integer\n            default: 1\n        - name: pageSize\n          in: query\n          description: Number of items per page\n          schema:\n            type: integer\n            default: 20\n            maximum: 100\n"
					if len(op.Parameters) > 0 {
						// Append to existing parameters
						lastParam := op.Parameters[len(op.Parameters)-1]
						insertLine = lastParam.Loc.Range.End.Line + 1
						paginationText = "        - name: page\n          in: query\n          description: Page number\n          schema:\n            type: integer\n            default: 1\n        - name: pageSize\n          in: query\n          description: Number of items per page\n          schema:\n            type: integer\n            default: 20\n            maximum: 100\n"
					}

					actions = append(actions, protocol.CodeAction{
						Title: "Add pagination parameters (page, pageSize)",
						Kind:  "refactor",
						Edit: &protocol.WorkspaceEdit{
							Changes: map[protocol.DocumentURI][]protocol.TextEdit{
								uri: {{
									Range: protocol.Range{
										Start: protocol.Position{Line: insertLine, Character: 0},
										End:   protocol.Position{Line: insertLine, Character: 0},
									},
									NewText: paginationText,
								}},
							},
						},
					})
				}
			}
		}

		// Offer "Generate CRUD operations" if path has few operations
		existingMethods := make(map[string]bool)
		for _, mo := range item.Operations() {
			existingMethods[strings.ToUpper(mo.Method)] = true
		}

		if len(existingMethods) < 4 {
			resourceName := inferResourceName(path)
			var crudText string
			insertLine := item.Loc.Range.End.Line + 1

			if !existingMethods["GET"] {
				crudText += fmt.Sprintf("    get:\n      summary: List %ss\n      operationId: list%ss\n      responses:\n        '200':\n          description: Success\n", resourceName, capitalizeFirst(resourceName))
			}
			if !existingMethods["POST"] {
				crudText += fmt.Sprintf("    post:\n      summary: Create %s\n      operationId: create%s\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema:\n              type: object\n      responses:\n        '201':\n          description: Created\n", resourceName, capitalizeFirst(resourceName))
			}
			if !existingMethods["PUT"] {
				crudText += fmt.Sprintf("    put:\n      summary: Update %s\n      operationId: update%s\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema:\n              type: object\n      responses:\n        '200':\n          description: Success\n", resourceName, capitalizeFirst(resourceName))
			}
			if !existingMethods["DELETE"] {
				crudText += fmt.Sprintf("    delete:\n      summary: Delete %s\n      operationId: delete%s\n      responses:\n        '204':\n          description: No Content\n", resourceName, capitalizeFirst(resourceName))
			}

			if crudText != "" {
				actions = append(actions, protocol.CodeAction{
					Title: fmt.Sprintf("Generate missing CRUD operations for %s", path),
					Kind:  "refactor",
					Edit: &protocol.WorkspaceEdit{
						Changes: map[protocol.DocumentURI][]protocol.TextEdit{
							uri: {{
								Range: protocol.Range{
									Start: protocol.Position{Line: insertLine, Character: 0},
									End:   protocol.Position{Line: insertLine, Character: 0},
								},
								NewText: crudText,
							}},
						},
					},
				})
			}
		}
	}

	return actions
}

// inferResourceName extracts a reasonable resource name from a path.
func inferResourceName(path string) string {
	segments := strings.Split(strings.Trim(path, "/"), "/")
	// Find the last non-parameter segment
	for i := len(segments) - 1; i >= 0; i-- {
		seg := segments[i]
		if !strings.HasPrefix(seg, "{") {
			// Singularize if it ends with 's'
			if strings.HasSuffix(seg, "s") && len(seg) > 1 {
				return seg[:len(seg)-1]
			}
			return seg
		}
	}
	return "resource"
}

// buildFixAllAction constructs a single "Fix All" code action that applies all
// auto-fixable diagnostics in the file at once.
func buildFixAllAction(uri protocol.DocumentURI, doc interface{ LineAt(uint32) string }, idx *openapi.Index, diagnostics []protocol.Diagnostic) *protocol.CodeAction {
	if idx == nil || doc == nil {
		return nil
	}

	var edits []protocol.TextEdit
	isYAML := idx.Format == openapi.FormatYAML

	for _, diag := range diagnostics {
		if diag.Source != rules.Source {
			continue
		}
		ruleID := ""
		if diag.Code != nil {
			if s, ok := diag.Code.(string); ok {
				ruleID = s
			}
		}

		switch ruleID {
		case "operation-description", "deprecated-description":
			// Add missing description
			insertLine := diag.Range.Start.Line + 1
			newText := "  description: \"TODO: Add description\"\n"
			if !isYAML {
				newText = "  \"description\": \"TODO: Add description\",\n"
			}
			edits = append(edits, protocol.TextEdit{
				Range: protocol.Range{
					Start: protocol.Position{Line: insertLine, Character: 0},
					End:   protocol.Position{Line: insertLine, Character: 0},
				},
				NewText: newText,
			})
		}
	}

	// Also add auto-fixable refactoring: generate missing operationIds
	if _, edit, ok := infoQuickFixEdit(doc, idx); ok {
		edits = append(edits, edit)
	}

	for path, item := range idx.Document.Paths {
		for _, mo := range item.Operations() {
			if mo.Operation.OperationID != "" {
				// keep scanning; missing responses can still be auto-fixed
			} else {
				opID := generateOperationID(mo.Method, path)
				insertLine := mo.Operation.Loc.Range.Start.Line + 1
				newText := fmt.Sprintf("  operationId: %s\n", opID)
				if !isYAML {
					newText = fmt.Sprintf("  \"operationId\": \"%s\",\n", opID)
				}
				edits = append(edits, protocol.TextEdit{
					Range: protocol.Range{
						Start: protocol.Position{Line: insertLine, Character: 0},
						End:   protocol.Position{Line: insertLine, Character: 0},
					},
					NewText: newText,
				})
			}

			if _, edit, ok := missingResponsesEdit(path, mo.Method, mo.Operation, doc, isYAML); ok {
				edits = append(edits, edit)
			}
		}
	}

	if len(edits) == 0 {
		return nil
	}

	return &protocol.CodeAction{
		Title: fmt.Sprintf("Fix all auto-fixable issues (%d fixes)", len(edits)),
		Kind:  "source.fixAll.telescope",
		Edit: &protocol.WorkspaceEdit{
			Changes: map[protocol.DocumentURI][]protocol.TextEdit{
				uri: edits,
			},
		},
	}
}

func vacuumFixAllEdit(ctx *gossip.Context, uri protocol.DocumentURI, doc interface {
	Text() string
	PositionAt(int) protocol.Position
}) *protocol.WorkspaceEdit {
	if ctx == nil || doc == nil {
		return nil
	}
	text := doc.Text()
	if strings.TrimSpace(text) == "" {
		return nil
	}
	workspaceRoot := uriToFSPath(string(protocol.NormalizeURI(ctx.WorkspaceRoot())))
	cfg, err := config.Load(workspaceRoot)
	if err != nil {
		cfg = config.DefaultConfig()
	}
	engine, err := vacuum.NewEngineWithBaseDir(cfg.Lint.Vacuum, workspaceRoot, nil)
	if err != nil {
		return nil
	}
	_, modified, err := engine.LintAndFix([]byte(text), string(uri))
	if err != nil || string(modified) == text {
		return nil
	}
	return &protocol.WorkspaceEdit{
		Changes: map[protocol.DocumentURI][]protocol.TextEdit{
			uri: {{
				Range: protocol.Range{
					Start: protocol.Position{Line: 0, Character: 0},
					End:   doc.PositionAt(len(text)),
				},
				NewText: string(modified),
			}},
		},
	}
}
