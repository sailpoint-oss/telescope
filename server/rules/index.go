package rules

import (
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// CrossRefResolver can resolve $ref values across files within a project.
// The project package implements this interface.
type CrossRefResolver interface {
	CanResolve(fromURI, ref string) bool
}

// AnalysisData bundles the per-document index with optional project-level
// cross-file resolution. The UserDataProvider sets this as UserData.
type AnalysisData struct {
	Index         *openapi.Index
	Resolver      CrossRefResolver // nil until a project context is built
	DocURI        string           // the document URI for cross-file resolution
	TargetVersion openapi.Version  // from config or project root; empty = auto-detect
}

// GetIndex extracts the *openapi.Index from a treesitter AnalysisContext.
// Supports both raw *openapi.Index (legacy) and *AnalysisData.
func GetIndex(ctx *treesitter.AnalysisContext) *openapi.Index {
	if ctx.UserData == nil {
		return nil
	}
	if data, ok := ctx.UserData.(*AnalysisData); ok {
		return data.Index
	}
	if idx, ok := ctx.UserData.(*openapi.Index); ok {
		return idx
	}
	return nil
}

// GetAnalysisData extracts the full AnalysisData from a treesitter
// AnalysisContext. Returns nil if UserData is not *AnalysisData.
func GetAnalysisData(ctx *treesitter.AnalysisContext) *AnalysisData {
	if ctx.UserData == nil {
		return nil
	}
	data, _ := ctx.UserData.(*AnalysisData)
	return data
}
