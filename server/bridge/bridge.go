// Package bridge adapts barrelman rules for the gossip LSP framework.
// This is the ONLY place gossip types appear in the rule execution chain.
package bridge

import (
	"fmt"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/barrelman"
	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// WrapForGossip converts a barrelman.Rule into a gossip treesitter.Analyzer.
func WrapForGossip(rule barrelman.Rule) treesitter.Analyzer {
	return treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(gctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			if analysisHasMalformedIndex(gctx.UserData) {
				return nil
			}
			bctx := ContextFromGossip(gctx)
			diags := rule.Run(bctx)
			diags = stabilizeDiagnostics(bctx.Index, diags)
			diags = filterLSPOnlyDiagnostics(diags)
			return DiagnosticsToProtocol(diags)
		},
	}
}

func analysisHasMalformedIndex(userData any) bool {
	switch data := userData.(type) {
	case *AnalysisData:
		return data != nil && data.Index != nil && data.Index.IsMalformed()
	case *openapi.Index:
		return data != nil && data.IsMalformed()
	default:
		return false
	}
}

func filterLSPOnlyDiagnostics(diags []barrelman.Diagnostic) []barrelman.Diagnostic {
	if len(diags) == 0 {
		return diags
	}
	out := diags[:0]
	for _, diag := range diags {
		if shouldSuppressLSPDiagnostic(diag) {
			continue
		}
		out = append(out, diag)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func shouldSuppressLSPDiagnostic(diag barrelman.Diagnostic) bool {
	if diag.Code != "oas3-schema" {
		return false
	}
	if diagnosticDataString(diag.Data, "category") == "syntax" {
		return true
	}
	return diagnosticDataString(diag.Data, "issueCode") == "structural.root-not-mapping"
}

func diagnosticDataString(data any, key string) string {
	switch v := data.(type) {
	case map[string]string:
		return v[key]
	case map[string]any:
		if raw, ok := v[key]; ok {
			return fmt.Sprint(raw)
		}
	}
	return ""
}

// ContextFromGossip builds a barrelman AnalysisContext from gossip's context.
func ContextFromGossip(gctx *treesitter.AnalysisContext) *barrelman.AnalysisContext {
	ctx := &barrelman.AnalysisContext{}
	var parsedFromContent *navigator.Index

	if gctx.UserData != nil {
		if data, ok := gctx.UserData.(*AnalysisData); ok {
			ctx.URI = data.DocURI
			ctx.Resolver = data.Resolver
			ctx.TargetVersion = data.TargetVersion
			if gctx.Tree != nil {
				parsedFromContent = navigator.ParseContent(gctx.Tree.Source(), data.DocURI)
			}
			if parsedFromContent != nil {
				ctx.Index = parsedFromContent
			} else {
				ctx.Index = navigatorIndex(data.Index)
			}
		} else if idx, ok := gctx.UserData.(*openapi.Index); ok {
			if gctx.Tree != nil {
				parsedFromContent = navigator.ParseContent(gctx.Tree.Source(), "")
			}
			if parsedFromContent != nil {
				ctx.Index = parsedFromContent
			} else {
				ctx.Index = navigatorIndex(idx)
			}
		}
	}

	if gctx.Tree != nil {
		ctx.Tree = gctx.Tree.Raw()
		ctx.Content = gctx.Tree.Source()
	}

	return ctx
}

func navigatorIndex(idx *openapi.Index) *navigator.Index {
	if idx == nil {
		return nil
	}
	ni := navigator.NewIndexFromDocument(idx.Document)
	if ni.Version == "" || ni.Version == navigator.VersionUnknown {
		ni.Version = idx.Version
	}
	for target, usages := range idx.Refs {
		for _, u := range usages {
			ni.Refs[target] = append(ni.Refs[target], navigator.RefUsage{
				URI:    string(u.URI),
				Loc:    u.Loc,
				Target: u.Target,
				From:   u.From,
			})
		}
	}
	return ni
}
