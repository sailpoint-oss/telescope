package lsp

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// docForFormatting resolves the gossip document for formatting. Some clients send
// textDocument/formatting with a URI string that does not exactly match the key
// produced for didOpen/didChange after normalization; fall back to path equality.
func docForFormatting(ctx *gossip.Context, uri protocol.DocumentURI) *document.Document {
	if doc := ctx.Documents.Get(uri); doc != nil {
		return doc
	}
	want := protocol.URIToPath(protocol.NormalizeURI(uri))
	if want == "" {
		return nil
	}
	for _, u := range ctx.Documents.URIs() {
		if protocol.URIToPath(u) == want {
			return ctx.Documents.Get(u)
		}
	}
	return nil
}

// NewFormattingHandler provides document formatting for JSON OpenAPI files.
// JSON files are re-formatted with consistent indentation via json.MarshalIndent.
// YAML files are given a trailing-newline normalization pass.
func NewFormattingHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.FormattingHandler {
	return func(ctx *gossip.Context, params *protocol.DocumentFormattingParams) ([]protocol.TextEdit, error) {
		idx := cache.Get(params.TextDocument.URI)
		doc := docForFormatting(ctx, params.TextDocument.URI)
		if doc == nil {
			return []protocol.TextEdit{}, nil
		}

		original := doc.Text()
		if original == "" {
			return []protocol.TextEdit{}, nil
		}

		// Prefer the file extension for JSON vs YAML. Only fall back to the cached index
		// when the URI has no recognizable extension (FormatUnknown).
		// Normalize so fragments/query do not break ".json" / ".yaml" detection.
		format := openapi.FormatFromURI(string(protocol.NormalizeURI(params.TextDocument.URI)))
		if format == openapi.FormatUnknown && idx != nil && idx.Format != openapi.FormatUnknown {
			format = idx.Format
		}

		var formatted string
		if format == openapi.FormatJSON {
			f, err := formatJSON(original, params.Options)
			if err != nil {
				return nil, fmt.Errorf("formatting: %w", err)
			}
			formatted = f
		} else {
			formatted = normalizeYAML(original)
		}

		if formatted == original {
			return []protocol.TextEdit{}, nil
		}

		lines := strings.Count(original, "\n")
		lastLine := uint32(lines)
		lastChar := uint32(0)
		if nlIdx := strings.LastIndex(original, "\n"); nlIdx >= 0 {
			tail := original[nlIdx+1:]
			lastChar = utf16Len(tail)
		} else {
			lastChar = utf16Len(original)
		}

		return []protocol.TextEdit{{
			Range: protocol.Range{
				Start: protocol.Position{Line: 0, Character: 0},
				End:   protocol.Position{Line: lastLine, Character: lastChar},
			},
			NewText: formatted,
		}}, nil
	}
}

func formatJSON(text string, opts protocol.FormattingOptions) (string, error) {
	var raw interface{}
	if err := json.Unmarshal([]byte(text), &raw); err != nil {
		return "", err
	}

	indent := strings.Repeat(" ", int(opts.TabSize))
	if !opts.InsertSpaces {
		indent = "\t"
	}

	out, err := json.MarshalIndent(raw, "", indent)
	if err != nil {
		return "", err
	}

	result := string(out)
	if !strings.HasSuffix(result, "\n") {
		result += "\n"
	}
	return result, nil
}

func normalizeYAML(text string) string {
	newline := "\n"
	normalized := text
	if strings.Contains(text, "\r\n") {
		newline = "\r\n"
		normalized = strings.ReplaceAll(text, "\r\n", "\n")
	}

	lines := strings.Split(normalized, "\n")
	for i := range lines {
		lines[i] = strings.TrimRight(lines[i], " \t\r")
	}

	result := strings.Join(lines, "\n")
	result = strings.TrimRight(result, "\n")
	result += "\n"

	if newline == "\r\n" {
		result = strings.ReplaceAll(result, "\n", "\r\n")
	}

	return result
}

// utf16Len returns the number of UTF-16 code units needed to represent s.
func utf16Len(s string) uint32 {
	n := uint32(0)
	for len(s) > 0 {
		r, size := utf8.DecodeRuneInString(s)
		s = s[size:]
		n += uint32(utf16.RuneLen(r))
	}
	return n
}
