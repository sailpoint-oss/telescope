package lsp

import (
	"encoding/json"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

type callHierarchyData struct {
	URI     string `json:"uri"`
	Kind    string `json:"kind"`
	Name    string `json:"name"`
	RefPath string `json:"refPath"`
}

// NewPrepareCallHierarchyHandler identifies the component at cursor and returns
// a CallHierarchyItem for it.
func NewPrepareCallHierarchyHandler(cache *openapi.IndexCache) gossip.PrepareCallHierarchyHandler {
	return func(ctx *gossip.Context, params *protocol.CallHierarchyPrepareParams) ([]protocol.CallHierarchyItem, error) {
		uri := params.TextDocument.URI
		idx := cache.Get(uri)
		if idx == nil {
			return nil, nil
		}

		doc := ctx.Documents.Get(uri)
		if doc == nil {
			return nil, nil
		}

		word := doc.WordAt(params.Position)
		if word == "" {
			return nil, nil
		}

		// Check all component types
		for _, kind := range componentKinds {
			for _, name := range idx.ComponentNames(kind) {
				if name == word {
					refPath := openapi.ComponentRefPath(kind, name)
					defRange := componentDefinitionLoc(idx, kind, name)
					if isZeroRange(defRange) {
						continue
					}
					data, _ := json.Marshal(callHierarchyData{
						URI: string(uri), Kind: kind, Name: name, RefPath: refPath,
					})
					return []protocol.CallHierarchyItem{{
						Name:           name,
						Kind:           symbolKindForComponent(kind),
						Detail:         kind,
						URI:            uri,
						Range:          defRange,
						SelectionRange: defRange,
						Data:           json.RawMessage(data),
					}}, nil
				}
			}
		}

		return nil, nil
	}
}

// NewCallHierarchyIncomingHandler returns all $ref usages pointing to the item.
func NewCallHierarchyIncomingHandler(cache *openapi.IndexCache) gossip.CallHierarchyIncomingHandler {
	return func(ctx *gossip.Context, params *protocol.CallHierarchyIncomingCallsParams) ([]protocol.CallHierarchyIncomingCall, error) {
		data := extractCallData(params.Item.Data)
		if data == nil {
			return nil, nil
		}

		var calls []protocol.CallHierarchyIncomingCall

		for docURI, idx := range cache.All() {
			for _, usage := range idx.RefsTo(data.RefPath) {
				// Find which component this ref lives in
				container := findContainingComponent(idx, usage.Loc.Range)
				if container == nil {
					container = &protocol.CallHierarchyItem{
						Name:           "(document)",
						Kind:           protocol.SymbolFile,
						URI:            docURI,
						Range:          usage.Loc.Range,
						SelectionRange: usage.Loc.Range,
					}
				} else {
					container.URI = docURI
				}

				calls = append(calls, protocol.CallHierarchyIncomingCall{
					From:       *container,
					FromRanges: []protocol.Range{usage.Loc.Range},
				})
			}
		}

		return calls, nil
	}
}

// NewCallHierarchyOutgoingHandler returns all $ref targets from within the item.
func NewCallHierarchyOutgoingHandler(cache *openapi.IndexCache) gossip.CallHierarchyOutgoingHandler {
	return func(ctx *gossip.Context, params *protocol.CallHierarchyOutgoingCallsParams) ([]protocol.CallHierarchyOutgoingCall, error) {
		data := extractCallData(params.Item.Data)
		if data == nil {
			return nil, nil
		}

		idx := cache.Get(protocol.DocumentURI(data.URI))
		if idx == nil {
			return nil, nil
		}

		itemRange := params.Item.Range
		var calls []protocol.CallHierarchyOutgoingCall

		for target, usages := range idx.Refs {
			for _, usage := range usages {
				if !rangeContains(itemRange, usage.Loc.Range) {
					continue
				}

				// Resolve the target to get its location
				resolved, err := idx.Resolve(target)
				if err != nil {
					continue
				}

				loc := locationFromTarget(protocol.DocumentURI(data.URI), resolved)
				if loc == nil {
					continue
				}

				targetName := target
				if parts := strings.Split(target, "/"); len(parts) > 0 {
					targetName = parts[len(parts)-1]
				}

				toData, _ := json.Marshal(callHierarchyData{
					URI: data.URI, RefPath: target, Name: targetName,
				})

				calls = append(calls, protocol.CallHierarchyOutgoingCall{
					To: protocol.CallHierarchyItem{
						Name:           targetName,
						Kind:           protocol.SymbolClass,
						URI:            loc.URI,
						Range:          loc.Range,
						SelectionRange: loc.Range,
						Data:           json.RawMessage(toData),
					},
					FromRanges: []protocol.Range{usage.Loc.Range},
				})
			}
		}

		return calls, nil
	}
}

func extractCallData(raw interface{}) *callHierarchyData {
	if raw == nil {
		return nil
	}
	var data callHierarchyData
	switch d := raw.(type) {
	case json.RawMessage:
		if err := json.Unmarshal(d, &data); err != nil {
			return nil
		}
	case map[string]interface{}:
		b, _ := json.Marshal(d)
		if err := json.Unmarshal(b, &data); err != nil {
			return nil
		}
	default:
		return nil
	}
	return &data
}

func findContainingComponent(idx *openapi.Index, r protocol.Range) *protocol.CallHierarchyItem {
	if idx.Document.Components == nil {
		return nil
	}

	for name, schema := range idx.Document.Components.Schemas {
		if rangeContains(schema.Loc.Range, r) {
			return &protocol.CallHierarchyItem{
				Name:           name,
				Kind:           protocol.SymbolClass,
				Range:          schema.Loc.Range,
				SelectionRange: schema.NameLoc.Range,
			}
		}
	}

	for _, item := range idx.Document.Paths {
		if rangeContains(item.Loc.Range, r) {
			for _, mo := range item.Operations() {
				if rangeContains(mo.Operation.Loc.Range, r) {
					return &protocol.CallHierarchyItem{
						Name:           strings.ToUpper(mo.Method),
						Kind:           protocol.SymbolMethod,
						Range:          mo.Operation.Loc.Range,
						SelectionRange: mo.Operation.Loc.Range,
					}
				}
			}
		}
	}

	return nil
}

func symbolKindForComponent(kind string) protocol.SymbolKind {
	switch kind {
	case "schemas":
		return protocol.SymbolClass
	case "parameters":
		return protocol.SymbolVariable
	case "responses":
		return protocol.SymbolField
	case "securitySchemes":
		return protocol.SymbolProperty
	case "requestBodies":
		return protocol.SymbolStruct
	default:
		return protocol.SymbolField
	}
}
