package lsp

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
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
func NewPrepareCallHierarchyHandler(cache *openapi.IndexCache, graphBridge *GraphBridge) gossip.PrepareCallHierarchyHandler {
	return func(ctx *gossip.Context, params *protocol.CallHierarchyPrepareParams) ([]protocol.CallHierarchyItem, error) {
		uri := params.TextDocument.URI
		if !handlerTargetGate(ctx, graphBridge, cache, uri) {
			return nil, nil
		}
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
func NewCallHierarchyIncomingHandler(cache *openapi.IndexCache, graphBridge *GraphBridge) gossip.CallHierarchyIncomingHandler {
	return func(ctx *gossip.Context, params *protocol.CallHierarchyIncomingCallsParams) ([]protocol.CallHierarchyIncomingCall, error) {
		data := extractCallData(params.Item.Data)
		if data == nil {
			return nil, nil
		}

		var calls []protocol.CallHierarchyIncomingCall
		seen := make(map[string]struct{})
		candidateDocs := make(map[protocol.DocumentURI]struct{})
		if graphBridge != nil && data.URI != "" {
			for _, edge := range graphBridge.EdgesTo(data.URI) {
				candidateDocs[protocol.DocumentURI(edge.SourceURI)] = struct{}{}
			}
			candidateDocs[protocol.DocumentURI(data.URI)] = struct{}{}
		}

		for docURI, idx := range cache.All() {
			if len(candidateDocs) > 0 {
				if _, ok := candidateDocs[docURI]; !ok {
					continue
				}
			}
			for _, usage := range idx.RefsTo(data.RefPath) {
				// Find which component this ref lives in
				usageRange := adapt.RangeToProtocol(usage.Loc.Range)
				container := findContainingComponent(idx, usageRange)
				if container == nil {
					container = &protocol.CallHierarchyItem{
						Name:           "(document)",
						Kind:           protocol.SymbolFile,
						URI:            docURI,
						Range:          usageRange,
						SelectionRange: usageRange,
					}
				} else {
					container.URI = docURI
				}
				key := fmt.Sprintf("%s|%s|%d:%d", container.URI, container.Name, usageRange.Start.Line, usageRange.Start.Character)
				if _, ok := seen[key]; ok {
					continue
				}
				seen[key] = struct{}{}

				calls = append(calls, protocol.CallHierarchyIncomingCall{
					From:       *container,
					FromRanges: []protocol.Range{usageRange},
				})
			}
		}

		return calls, nil
	}
}

// NewCallHierarchyOutgoingHandler returns all $ref targets from within the item.
func NewCallHierarchyOutgoingHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.CallHierarchyOutgoingHandler {
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
		resolvedLoc := make(map[string]*protocol.Location)
		seen := make(map[string]struct{})

		for target, usages := range idx.Refs {
			for _, usage := range usages {
				if !rangeContains(itemRange, adapt.RangeToProtocol(usage.Loc.Range)) {
					continue
				}

				// Resolve the target to get its location
				loc := resolvedLoc[target]
				if loc == nil {
					resolved, err := idx.Resolve(target)
					if err != nil {
						continue
					}
					loc = locationFromTarget(protocol.DocumentURI(data.URI), resolved)
					resolvedLoc[target] = loc
				}
				if loc == nil {
					continue
				}
				dedupeKey := string(loc.URI) + "|" + target
				if _, ok := seen[dedupeKey]; ok {
					continue
				}
				seen[dedupeKey] = struct{}{}

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
					FromRanges: []protocol.Range{adapt.RangeToProtocol(usage.Loc.Range)},
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
		if rangeContains(adapt.RangeToProtocol(schema.Loc.Range), r) {
			return &protocol.CallHierarchyItem{
				Name:           name,
				Kind:           protocol.SymbolClass,
				Range:          adapt.RangeToProtocol(schema.Loc.Range),
				SelectionRange: adapt.RangeToProtocol(schema.NameLoc.Range),
			}
		}
	}

	for _, item := range idx.Document.Paths {
		if rangeContains(adapt.RangeToProtocol(item.Loc.Range), r) {
			for _, mo := range item.Operations() {
				if rangeContains(adapt.RangeToProtocol(mo.Operation.Loc.Range), r) {
					return &protocol.CallHierarchyItem{
						Name:           strings.ToUpper(mo.Method),
						Kind:           protocol.SymbolMethod,
						Range:          adapt.RangeToProtocol(mo.Operation.Loc.Range),
						SelectionRange: adapt.RangeToProtocol(mo.Operation.Loc.Range),
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
