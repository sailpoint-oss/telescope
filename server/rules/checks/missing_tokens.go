package checks

import (
	"fmt"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var missingTokenMeta = rules.RuleMeta{
	ID:          "missing-token",
	Description: "Reports tokens the parser expected but did not find (e.g., a missing closing brace).",
	Severity:    ctypes.SeverityError,
	Category:    rules.CategorySyntax,
	Recommended: true,
	HowToFix:    "Add the missing token indicated by the diagnostic.",
	DocURL:      rules.DocBaseURL + "missing-token",
}

var kindLabels = map[string]string{
	"}":  "`}`",
	"{":  "`{`",
	"]":  "`]`",
	"[":  "`[`",
	":":  "`:`",
	",":  "`,`",
	"\"": "`\"`",
	"'":  "`'`",
}

func missingTokenLabelForKind(kind string) string {
	if label := kindLabels[kind]; label != "" {
		return label
	}
	return kind
}

func registerMissingTokens(s *gossip.Server) {
	s.Analyze("missing-token", treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			if ctx.Tree == nil {
				return nil
			}
			missing := ctx.Tree.MissingNodes()
			if len(missing) == 0 {
				return nil
			}

			var diags []protocol.Diagnostic
			for _, node := range missing {
				kind := node.Kind()
				label := missingTokenLabelForKind(kind)
				diags = append(diags, protocol.Diagnostic{
					Range:    ctx.Tree.NodeRange(node),
					Severity: protocol.SeverityError,
					Source:   rules.Source,
					Code:     "missing-token",
					CodeDescription: &protocol.CodeDescription{
						Href: protocol.URI(missingTokenMeta.DocURL),
					},
					Message: fmt.Sprintf("Expected %s", label),
				})
			}
			return diags
		},
	})
}
