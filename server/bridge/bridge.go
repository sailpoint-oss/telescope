// Package bridge adapts barrelman rules for the gossip LSP framework.
// This is the ONLY place gossip types appear in the rule execution chain.
package bridge

import (
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
			bctx := ContextFromGossip(gctx)
			diags := rule.Run(bctx)
			return DiagnosticsToProtocol(diags)
		},
	}
}

// ContextFromGossip builds a barrelman AnalysisContext from gossip's context.
func ContextFromGossip(gctx *treesitter.AnalysisContext) *barrelman.AnalysisContext {
	ctx := &barrelman.AnalysisContext{}

	if gctx.UserData != nil {
		if data, ok := gctx.UserData.(*AnalysisData); ok {
			ctx.Index = navigatorIndex(data.Index)
			ctx.URI = data.DocURI
			ctx.Resolver = data.Resolver
			ctx.TargetVersion = data.TargetVersion
		} else if idx, ok := gctx.UserData.(*openapi.Index); ok {
			ctx.Index = navigatorIndex(idx)
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
