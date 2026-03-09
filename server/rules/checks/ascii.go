package checks

import (
	"fmt"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var asciiMeta = rules.RuleMeta{
	ID:          "ascii",
	Description: "Reports non-ASCII characters in the document that may cause interoperability issues.",
	Severity:    ctypes.SeverityWarning,
	Category:    rules.CategorySyntax,
	Recommended: true,
	HowToFix:    "Replace non-ASCII characters with their ASCII equivalents or escape sequences.",
	DocURL:      rules.DocBaseURL + "ascii",
}

func registerASCII(s *gossip.Server) {
	s.Analyze("ascii", treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			var text string
			if ctx.Document != nil {
				text = ctx.Document.Text()
			} else if ctx.Tree != nil {
				text = string(ctx.Tree.Source())
			} else {
				return nil
			}
			var diags []protocol.Diagnostic

			line := uint32(0)
			col := uint32(0)
			for i := 0; i < len(text); {
				b := text[i]
				if b == '\n' {
					line++
					col = 0
					i++
					continue
				}
				if b <= 127 {
					col++
					i++
					continue
				}
				// Non-ASCII: decode the full rune to compute its UTF-16 width
				r, size := utf8.DecodeRuneInString(text[i:])
				runeUTF16Len := uint32(utf16.RuneLen(r))
				diags = append(diags, protocol.Diagnostic{
					Range: protocol.Range{
						Start: protocol.Position{Line: line, Character: col},
						End:   protocol.Position{Line: line, Character: col + runeUTF16Len},
					},
					Severity: protocol.SeverityWarning,
					Source:   rules.Source,
					Code:     "ascii",
					CodeDescription: &protocol.CodeDescription{
						Href: protocol.URI(asciiMeta.DocURL),
					},
					Message: fmt.Sprintf("Non-ASCII character (U+%04X) at line %d, column %d", r, line+1, col+1),
				})
				col += runeUTF16Len
				i += size
			}
			return diags
		},
	})
}
