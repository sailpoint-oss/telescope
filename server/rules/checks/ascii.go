package checks

import (
	"fmt"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var asciiMeta = rules.RuleMeta{
	ID:          "ascii",
	Description: "Reports non-ASCII characters in the document that may cause interoperability issues.",
	Severity:    protocol.SeverityWarning,
	Category:    rules.CategorySyntax,
	Recommended: true,
	HowToFix:    "Replace non-ASCII characters with their ASCII equivalents or escape sequences.",
	DocURL:      rules.DocBaseURL + "ascii",
}

func registerASCII(s *gossip.Server) {
	s.Analyze("ascii", treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			text := ctx.Document.Text()
			var diags []protocol.Diagnostic

			line := uint32(0)
			col := uint32(0)
			for i := 0; i < len(text); i++ {
				b := text[i]
				if b == '\n' {
					line++
					col = 0
					continue
				}
				if b > 127 {
					diags = append(diags, protocol.Diagnostic{
						Range: protocol.Range{
							Start: protocol.Position{Line: line, Character: col},
							End:   protocol.Position{Line: line, Character: col + 1},
						},
						Severity: protocol.SeverityWarning,
						Source:   rules.Source,
						Code:     "ascii",
						CodeDescription: &protocol.CodeDescription{
							Href: protocol.URI(asciiMeta.DocURL),
						},
						Message: fmt.Sprintf("Non-ASCII character (0x%02x) at line %d, column %d", b, line+1, col+1),
					})
				}
				col++
			}
			return diags
		},
	})
}
