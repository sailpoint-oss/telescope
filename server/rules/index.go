package rules

import (
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// GetIndex extracts the *openapi.Index from a treesitter AnalysisContext.
// Returns nil if UserData is nil or not an *openapi.Index.
func GetIndex(ctx *treesitter.AnalysisContext) *openapi.Index {
	if ctx.UserData == nil {
		return nil
	}
	idx, ok := ctx.UserData.(*openapi.Index)
	if !ok {
		return nil
	}
	return idx
}
