// Package bridge adapts barrelman rules for the gossip LSP framework.
// This is the ONLY place gossip types appear in the rule execution chain.
package bridge

import (
	"fmt"
	"strings"

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
			if shouldSuppressNonTarget(gctx.UserData) {
				return nil
			}
			if shouldSuppressMalformedIndex(gctx.UserData) {
				return nil
			}
			bctx := ContextFromGossip(gctx)
			diags := rule.Run(bctx)
			diags = stabilizeDiagnostics(bctx.Index, diags)
			diags = filterLSPOnlyDiagnostics(diags)
			diags = enrichStructuralMessages(diags)
			return DiagnosticsToProtocol(diags)
		},
	}
}

// enrichStructuralMessages rewrites oas3-schema diagnostic messages so that
// reviewers see "Properties 'allOf' are not valid in Response Object" instead
// of the generic "Value is not valid in this document". The pointer embedded
// in diag.Data tells us which OpenAPI object class the violation belongs to;
// we only prefix when the location is unambiguously one of the well-known
// classes (Response Object, Reference Object, Path Item, Operation).
//
// The issueCode + pointer payload barrelman already emits is sufficient to
// classify the violation without a Barrelman upstream change.
func enrichStructuralMessages(diags []barrelman.Diagnostic) []barrelman.Diagnostic {
	for i := range diags {
		if diags[i].Code != "oas3-schema" {
			continue
		}
		pointer := diagnosticDataString(diags[i].Data, "pointer")
		if pointer == "" {
			continue
		}
		kind := classifyPointer(pointer)
		if kind == "" {
			continue
		}
		diags[i].Message = prefixWithKind(diags[i].Message, kind)
	}
	return diags
}

// classifyPointer returns a human-readable OpenAPI object class name based on
// the segments of a JSON Pointer. The mapping is intentionally conservative:
// if the pointer doesn't clearly land in a known class we return "" so the
// caller falls back to the original message.
//
// The classifier walks segments once and tracks the most-specific known
// container encountered. For example, /paths/~1users/get/responses/200/allOf
// passes through "Path Item" → "Operation" → "Response Object", and the last
// state wins.
func classifyPointer(pointer string) string {
	segs := strings.Split(strings.TrimPrefix(pointer, "/"), "/")
	kind := ""
	i := 0
	for i < len(segs) {
		seg := segs[i]
		switch {
		case seg == "paths":
			// The very next segment is a path template; anything deeper is
			// an Operation or below. A path template without a following
			// segment is a Path Item.
			if i+1 >= len(segs) {
				return kind
			}
			if i+2 >= len(segs) {
				return "Path Item"
			}
			if _, ok := httpMethodSegments[segs[i+2]]; ok {
				kind = "Operation"
				i += 3
				continue
			}
			kind = "Path Item"
			i += 2
			continue
		case seg == "responses" && i+1 < len(segs):
			kind = "Response Object"
			i += 2
			continue
		case seg == "parameters" && i+1 < len(segs):
			kind = "Parameter Object"
			i += 2
			continue
		case seg == "requestBody":
			kind = "Request Body Object"
			i++
			continue
		case seg == "schemas" && i+1 < len(segs):
			kind = "Schema Object"
			i += 2
			continue
		}
		i++
	}
	return kind
}

var httpMethodSegments = map[string]struct{}{
	"get":     {},
	"put":     {},
	"post":    {},
	"delete":  {},
	"options": {},
	"head":    {},
	"patch":   {},
	"trace":   {},
}

func prefixWithKind(message, kind string) string {
	if message == "" {
		return message
	}
	// Avoid double-prefixing if upstream already mentioned the kind.
	if strings.Contains(message, kind) {
		return message
	}
	return kind + ": " + message
}

func shouldSuppressNonTarget(userData any) bool {
	data, ok := userData.(*AnalysisData)
	if !ok || data == nil || !data.TargetChecked {
		return false
	}
	return !data.IsOpenAPIDiagnosticTarget
}

func shouldSuppressMalformedIndex(userData any) bool {
	data, ok := userData.(*AnalysisData)
	if !ok || data == nil || !data.SuppressMalformedDiagnostics || data.Index == nil {
		return false
	}
	return data.Index.IsMalformed()
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
