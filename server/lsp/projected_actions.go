package lsp

import (
	"encoding/json"

	"github.com/LukasParke/gossip/protocol"

	"github.com/sailpoint-oss/telescope/server/lsp/projection"
)

// projectedCodeActions returns a CodeAction offering "Open generated spec at
// this location" when diag carries ProjectionData set by the projection
// Publisher. Returns nil for non-projected diagnostics so spec-side
// CodeActions are unaffected.
//
// Source-side patches (insert a Go doc comment / Java @Schema annotation) are
// deferred to a later phase; the jump-to-spec action is cheap, deterministic
// and always-available.
func projectedCodeActions(diag protocol.Diagnostic) []protocol.CodeAction {
	data, ok := extractProjectionData(diag.Data)
	if !ok || data.SpecURI == "" {
		return nil
	}
	cmd := &protocol.Command{
		Title:     "Open generated spec at this location",
		Command:   "telescope.openGeneratedSpec",
		Arguments: []interface{}{data.SpecURI, data.Pointer},
	}
	return []protocol.CodeAction{
		{
			Title:       "Open generated spec at this location",
			Kind:        "source.openGeneratedSpec",
			Command:     cmd,
			Diagnostics: []protocol.Diagnostic{diag},
		},
	}
}

// extractProjectionData extracts a ProjectionData struct from a diagnostic's
// Data field. Accepts either a typed value (from projection.Project) or a
// JSON-decoded map (from an LSP client request round-trip).
func extractProjectionData(raw any) (projection.ProjectionData, bool) {
	switch v := raw.(type) {
	case projection.ProjectionData:
		return v, true
	case map[string]any:
		data := projection.ProjectionData{}
		if s, ok := v["projectedFrom"].(string); ok {
			data.ProjectedFrom = s
		}
		if s, ok := v["specUri"].(string); ok {
			data.SpecURI = s
		}
		if s, ok := v["pointer"].(string); ok {
			data.Pointer = s
		}
		return data, data.ProjectedFrom != ""
	case json.RawMessage:
		var data projection.ProjectionData
		if err := json.Unmarshal(v, &data); err == nil && data.ProjectedFrom != "" {
			return data, true
		}
	}
	return projection.ProjectionData{}, false
}
