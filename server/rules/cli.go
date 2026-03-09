package rules

import (
	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NamedAnalyzer pairs a rule ID with its built analyzer for use outside the
// gossip LSP server (e.g., CLI lint mode).
type NamedAnalyzer struct {
	ID       string
	Meta     RuleMeta
	Analyzer treesitter.Analyzer
}

// NamedCheck pairs a rule name with its Check definition for CLI execution.
type NamedCheck struct {
	Name  string
	Check treesitter.Check
}

// CollectAll calls analyzerFn and checkFn (which should invoke RegisterAll for
// analyzers and checks respectively) and returns all built analyzers and
// checks. This uses gossip Server hooks to capture everything, including
// analyzers registered directly via s.Analyze() (like oas3-schema).
func CollectAll(analyzerFn, checkFn func(s *gossip.Server)) ([]NamedAnalyzer, []NamedCheck) {
	var collectedAnalyzers []NamedAnalyzer
	var collectedChecks []NamedCheck

	s := gossip.NewServer("telescope-collect", "0.0.0")

	s.SetAnalyzeHook(func(name string, a treesitter.Analyzer) {
		collectedAnalyzers = append(collectedAnalyzers, NamedAnalyzer{ID: name, Analyzer: a})
	})
	s.SetCheckHook(func(name string, c treesitter.Check) {
		collectedChecks = append(collectedChecks, NamedCheck{Name: name, Check: c})
	})

	analyzerFn(s)
	checkFn(s)
	return collectedAnalyzers, collectedChecks
}

// CollectAnalyzers calls fn (which should invoke RegisterAll for analyzers)
// and returns all built analyzers. This enables CLI lint without requiring
// the gossip DiagnosticEngine. Kept for backward compatibility; prefer
// CollectAll for full coverage.
func CollectAnalyzers(fn func(s *gossip.Server)) []NamedAnalyzer {
	analyzers, _ := CollectAll(fn, func(s *gossip.Server) {})
	return analyzers
}

// RunAnalyzers runs all provided analyzers against an openapi.Index and returns
// the combined diagnostics as protocol-independent core types. When tree is
// non-nil, it is passed through the AnalysisContext so tree-dependent
// analyzers (like oas3-schema) can execute.
func RunAnalyzers(analyzers []NamedAnalyzer, idx *openapi.Index, docURI string, tree *treesitter.Tree, opts ...AnalyzerOption) []ctypes.Diagnostic {
	var diags []ctypes.Diagnostic
	data := &AnalysisData{Index: idx, DocURI: docURI}
	for _, opt := range opts {
		opt(data)
	}
	for _, na := range analyzers {
		actx := &treesitter.AnalysisContext{
			UserData: data,
			Tree:     tree,
		}
		protoDiags := na.Analyzer.Run(actx)
		diags = append(diags, adapt.DiagnosticsFromProtocol(protoDiags)...)
	}
	return diags
}

// RunAnalyzersProto is like RunAnalyzers but returns protocol.Diagnostic
// for backward compatibility with consumers that need protocol types directly.
func RunAnalyzersProto(analyzers []NamedAnalyzer, idx *openapi.Index, docURI string, tree *treesitter.Tree, opts ...AnalyzerOption) []protocol.Diagnostic {
	var diags []protocol.Diagnostic
	data := &AnalysisData{Index: idx, DocURI: docURI}
	for _, opt := range opts {
		opt(data)
	}
	for _, na := range analyzers {
		actx := &treesitter.AnalysisContext{
			UserData: data,
			Tree:     tree,
		}
		diags = append(diags, na.Analyzer.Run(actx)...)
	}
	return diags
}

// AnalyzerOption configures optional fields on AnalysisData.
type AnalyzerOption func(*AnalysisData)

// WithTargetVersion sets the target OpenAPI version for fragment validation.
func WithTargetVersion(v openapi.Version) AnalyzerOption {
	return func(d *AnalysisData) {
		d.TargetVersion = v
	}
}

// RunChecks executes pattern-based tree-sitter checks against the given tree
// and returns the combined diagnostics as core types.
func RunChecks(checks []NamedCheck, tree *treesitter.Tree, lang *tree_sitter.Language) []ctypes.Diagnostic {
	protoDiags := RunChecksProto(checks, tree, lang)
	return adapt.DiagnosticsFromProtocol(protoDiags)
}

// RunChecksProto executes pattern-based tree-sitter checks and returns
// protocol diagnostics for backward compatibility.
func RunChecksProto(checks []NamedCheck, tree *treesitter.Tree, lang *tree_sitter.Language) []protocol.Diagnostic {
	if tree == nil || lang == nil {
		return nil
	}
	enc := tree.Encoder()
	var diags []protocol.Diagnostic
	for _, nc := range checks {
		captures, err := tree.QueryCaptures(lang, nc.Check.Pattern)
		if err != nil {
			continue
		}
		for _, c := range captures {
			if nc.Check.DeduplicateNested && hasChildOfSameKind(c.Node) {
				continue
			}
			if nc.Check.Filter != nil && !nc.Check.Filter(c) {
				continue
			}
			msg := c.Text
			if nc.Check.Message != nil {
				msg = nc.Check.Message(c)
			}
			source := nc.Check.Source
			if source == "" {
				source = nc.Name
			}
			d := protocol.Diagnostic{
				Range:    enc.NodeRange(c.Node),
				Severity: nc.Check.Severity,
				Source:   source,
				Message:  msg,
			}
			if nc.Check.Code != "" {
				d.Code = nc.Check.Code
			}
			if nc.Check.CodeDescription != nil {
				d.CodeDescription = nc.Check.CodeDescription
			}
			if nc.Check.Tags != nil {
				d.Tags = nc.Check.Tags
			}
			diags = append(diags, d)
		}
	}
	return diags
}

func hasChildOfSameKind(node *tree_sitter.Node) bool {
	kind := node.Kind()
	for i := uint(0); i < node.ChildCount(); i++ {
		if child := node.Child(i); child != nil && child.Kind() == kind {
			return true
		}
	}
	return false
}
