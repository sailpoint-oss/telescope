package lsp

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewFormattingHandler provides document formatting for JSON OpenAPI files.
// JSON files are re-formatted with consistent indentation via json.MarshalIndent.
// YAML files are given a trailing-newline normalization pass.
func NewFormattingHandler(cache *openapi.IndexCache) gossip.FormattingHandler {
	return func(ctx *gossip.Context, params *protocol.DocumentFormattingParams) ([]protocol.TextEdit, error) {
		idx := cache.Get(params.TextDocument.URI)
		doc := ctx.Documents.Get(params.TextDocument.URI)
		if doc == nil {
			return nil, nil
		}

		original := doc.Text()
		if original == "" {
			return nil, nil
		}

		var formatted string

		if idx != nil && idx.Format == openapi.FormatJSON {
			f, err := formatJSON(original, params.Options)
			if err != nil {
				return nil, fmt.Errorf("formatting: %w", err)
			}
			formatted = f
		} else {
			formatted = normalizeYAML(original)
		}

		if formatted == original {
			return nil, nil
		}

		lines := strings.Count(original, "\n")
		lastLine := uint32(lines)
		lastChar := uint32(0)
		if nlIdx := strings.LastIndex(original, "\n"); nlIdx >= 0 {
			lastChar = uint32(len(original) - nlIdx - 1)
		} else {
			lastChar = uint32(len(original))
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
	result := strings.TrimRight(text, " \t\n\r")
	if !strings.HasSuffix(result, "\n") {
		result += "\n"
	}
	return result
}
