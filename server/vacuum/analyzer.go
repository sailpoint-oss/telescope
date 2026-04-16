package vacuum

import (
	"log/slog"
	"strings"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// Analyzer adapts the vacuum bridge into a gossip treesitter analyzer.
func Analyzer(engine *Engine, logger *slog.Logger) treesitter.Analyzer {
	if logger == nil {
		logger = slog.Default()
	}
	return treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			if engine == nil || ctx == nil || ctx.Document == nil {
				return nil
			}
			idx := rules.GetIndex(ctx)
			if idx == nil || idx.Document == nil || strings.TrimSpace(ctx.Document.Text()) == "" {
				return nil
			}
			diags, err := engine.LintBytes([]byte(ctx.Document.Text()), string(ctx.Document.URI()))
			if err != nil {
				logger.Debug("vacuum analyzer failed", "uri", ctx.Document.URI(), "error", err)
			}
			return adapt.DiagnosticsToProtocol(diags)
		},
	}
}
