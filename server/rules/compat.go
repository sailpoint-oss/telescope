package rules

import (
	"github.com/LukasParke/gossip/treesitter"
	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/bridge"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// WalkIndex is a convenience that converts an openapi.Index to a
// navigator.Index before calling Walk. Prefer Walk with a navigator.Index
// in new code.
func WalkIndex(idx *openapi.Index, v Visitors, r *Reporter) {
	if idx == nil {
		Walk(nil, v, r)
		return
	}
	Walk(navigator.NewIndexFromDocument(idx.Document), v, r)
}

// GetIndex extracts the *openapi.Index from a treesitter AnalysisContext.
// Supports both raw *openapi.Index (legacy) and *bridge.AnalysisData.
func GetIndex(ctx *treesitter.AnalysisContext) *openapi.Index {
	if ctx.UserData == nil {
		return nil
	}
	if data, ok := ctx.UserData.(*bridge.AnalysisData); ok {
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
	data, _ := ctx.UserData.(*bridge.AnalysisData)
	return data
}
