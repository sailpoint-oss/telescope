package checks

import (
	"fmt"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var syntaxErrorMeta = rules.RuleMeta{
	ID:          "syntax-error",
	Description: "Reports YAML/JSON syntax errors detected by the parser.",
	Severity:    ctypes.SeverityError,
	Category:    rules.CategorySyntax,
	Recommended: true,
	HowToFix:    "Fix the syntax error indicated by the parser.",
	DocURL:      rules.DocBaseURL + "syntax-error",
}

func registerSyntaxErrors(s *gossip.Server) {
	s.Check("syntax-error", treesitter.Check{
		Pattern:           "(ERROR) @error",
		Severity:          protocol.SeverityError,
		DeduplicateNested: true,
		Source:            rules.Source,
		Code:              "syntax-error",
		CodeDescription: &protocol.CodeDescription{
			Href: protocol.URI(syntaxErrorMeta.DocURL),
		},
		Message: func(c treesitter.Capture) string {
			text := c.Text
			if len(text) > 40 {
				text = text[:40] + "..."
			}
			return fmt.Sprintf("Syntax error near '%s'", text)
		},
	})
}
