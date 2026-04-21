package lsp

import (
	"fmt"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/barrelman/codemod"
	navigator "github.com/sailpoint-oss/navigator"
)

// sailpointFixActions returns CodeActions backed by the barrelman
// codemod framework for a single diagnostic. Returns nil when the
// diagnostic's rule has no Fix attached or when the fix declines to
// produce patches (typically because the target has already been
// corrected). The returned actions have Kind = "quickfix" and carry
// a WorkspaceEdit built from the patches.
func sailpointFixActions(uri protocol.DocumentURI, idx *navigator.Index, doc *document.Document, diag protocol.Diagnostic) []protocol.CodeAction {
	if idx == nil || doc == nil {
		return nil
	}
	ruleID, _ := diag.Code.(string)
	if ruleID == "" {
		return nil
	}
	rule, ok := findBarrelmanRule(ruleID)
	if !ok || rule.Fix == nil {
		return nil
	}

	// Translate the protocol diagnostic back into a barrelman
	// diagnostic carrying the byte range the fix needs. Tree-sitter
	// byte offsets are derived from the start/end positions by
	// walking the document's text; we compute them from the range.
	content := []byte(doc.Text())
	startByte, endByte, okRange := rangeToByteSpan(content, diag.Range)
	if !okRange {
		return nil
	}
	bdiag := barrelman.Diagnostic{
		URI:       string(uri),
		Range:     barrelman.Range{Start: barrelman.Position{Line: diag.Range.Start.Line, Character: diag.Range.Start.Character}, End: barrelman.Position{Line: diag.Range.End.Line, Character: diag.Range.End.Character}},
		ByteRange: barrelman.ByteRange{StartByte: uint(startByte), EndByte: uint(endByte)},
		Code:      ruleID,
		Source:    barrelman.Source,
		Message:   diag.Message,
	}

	fixCtx := &codemod.FixContext{
		Index:  idx,
		Source: content,
		URI:    string(uri),
	}
	patches, err := rule.Fix(fixCtx, bdiag)
	if err != nil || len(patches) == 0 {
		return nil
	}

	edits := make([]protocol.TextEdit, 0, len(patches))
	for _, p := range patches {
		rng, okConv := byteSpanToRange(content, int(p.StartByte), int(p.EndByte))
		if !okConv {
			continue
		}
		edits = append(edits, protocol.TextEdit{
			Range:   rng,
			NewText: string(p.Replacement),
		})
	}
	if len(edits) == 0 {
		return nil
	}

	title := fmt.Sprintf("Auto-fix: %s", ruleID)
	if len(patches) > 0 && patches[0].Description != "" {
		title = "Auto-fix: " + patches[0].Description
	}
	return []protocol.CodeAction{{
		Title:       title,
		Kind:        "quickfix",
		IsPreferred: true,
		Diagnostics: []protocol.Diagnostic{diag},
		Edit: &protocol.WorkspaceEdit{
			Changes: map[protocol.DocumentURI][]protocol.TextEdit{
				uri: edits,
			},
		},
	}}
}

// findBarrelmanRule looks up a rule in the barrelman DefaultRegistry
// by ID. Returns false when no rule with that ID is registered.
func findBarrelmanRule(id string) (barrelman.Rule, bool) {
	for _, r := range barrelman.DefaultRegistry.AllRules() {
		if r.ID == id {
			return r, true
		}
	}
	return barrelman.Rule{}, false
}

// rangeToByteSpan converts an LSP (line, UTF-16 character) Range into
// a (startByte, endByte) span in content. Returns false when the
// range falls outside the document.
func rangeToByteSpan(content []byte, r protocol.Range) (int, int, bool) {
	s, ok := positionToByte(content, r.Start)
	if !ok {
		return 0, 0, false
	}
	e, ok := positionToByte(content, r.End)
	if !ok {
		return s, s, true
	}
	if e < s {
		e = s
	}
	return s, e, true
}

// positionToByte walks content, counting newlines and UTF-16 code
// units on the target line, until it reaches the requested position.
// Uses the LSP UTF-16 convention.
func positionToByte(content []byte, pos protocol.Position) (int, bool) {
	line := uint32(0)
	col := uint32(0)
	i := 0
	for i < len(content) {
		if line == pos.Line && col == pos.Character {
			return i, true
		}
		r, size := utf8.DecodeRune(content[i:])
		if r == '\n' {
			if line == pos.Line {
				return i, true
			}
			line++
			col = 0
			i += size
			continue
		}
		if line == pos.Line {
			col += uint32(utf16LenRune(r))
		}
		i += size
	}
	if line == pos.Line && col == pos.Character {
		return i, true
	}
	return len(content), false
}

// byteSpanToRange converts (startByte, endByte) into an LSP Range.
func byteSpanToRange(content []byte, start, end int) (protocol.Range, bool) {
	startPos, ok := byteToPosition(content, start)
	if !ok {
		return protocol.Range{}, false
	}
	endPos, ok := byteToPosition(content, end)
	if !ok {
		return protocol.Range{}, false
	}
	return protocol.Range{Start: startPos, End: endPos}, true
}

func byteToPosition(content []byte, target int) (protocol.Position, bool) {
	if target < 0 {
		return protocol.Position{}, false
	}
	line := uint32(0)
	col := uint32(0)
	i := 0
	for i < len(content) && i < target {
		r, size := utf8.DecodeRune(content[i:])
		if r == '\n' {
			line++
			col = 0
			i += size
			continue
		}
		col += uint32(utf16LenRune(r))
		i += size
	}
	return protocol.Position{Line: line, Character: col}, true
}

func utf16LenRune(r rune) int {
	if r < 0x10000 {
		return 1
	}
	return utf16.RuneLen(r)
}
