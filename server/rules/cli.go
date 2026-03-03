package rules

import (
	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NamedAnalyzer pairs a rule ID with its built analyzer for use outside the
// gossip LSP server (e.g., CLI lint mode).
type NamedAnalyzer struct {
	ID       string
	Meta     RuleMeta
	Analyzer treesitter.Analyzer
}

// analyzerCollector, when non-nil, captures every analyzer built via Register.
// Only set during CollectAnalyzers; single-threaded CLI use only.
var analyzerCollector *[]NamedAnalyzer

// CollectAnalyzers calls fn (which should invoke RegisterAll for analyzers)
// and returns all built analyzers. This enables CLI lint without requiring
// the gossip DiagnosticEngine.
func CollectAnalyzers(fn func(s *gossip.Server)) []NamedAnalyzer {
	var collected []NamedAnalyzer
	analyzerCollector = &collected
	defer func() { analyzerCollector = nil }()

	s := gossip.NewServer("telescope-collect", "0.0.0")
	fn(s)
	return collected
}

// RunAnalyzers runs all provided analyzers against an openapi.Index and returns
// the combined diagnostics. This is the core CLI lint execution path.
func RunAnalyzers(analyzers []NamedAnalyzer, idx *openapi.Index, docURI string) []protocol.Diagnostic {
	var diags []protocol.Diagnostic
	data := &AnalysisData{Index: idx, DocURI: docURI}
	for _, na := range analyzers {
		actx := &treesitter.AnalysisContext{UserData: data}
		diags = append(diags, na.Analyzer.Run(actx)...)
	}
	return diags
}
