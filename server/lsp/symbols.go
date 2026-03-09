package lsp

import (
	"fmt"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// clampSelection ensures selectionRange is contained within fullRange.
// If it isn't (or is zero-valued) fullRange is returned as the selection.
func clampSelection(fullRange, selRange protocol.Range) protocol.Range {
	if rangeContains(fullRange, selRange) {
		return selRange
	}
	return fullRange
}

func rangeContains(outer, inner protocol.Range) bool {
	if positionBefore(inner.Start, outer.Start) {
		return false
	}
	if positionBefore(outer.End, inner.End) {
		return false
	}
	return true
}

func positionBefore(a, b protocol.Position) bool {
	return a.Line < b.Line || (a.Line == b.Line && a.Character < b.Character)
}

// NewSymbolHandler provides document symbols for the OpenAPI structure.
func NewSymbolHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.DocumentSymbolHandler {
	return func(ctx *gossip.Context, params *protocol.DocumentSymbolParams) ([]protocol.DocumentSymbol, error) {
		idx := cache.Get(params.TextDocument.URI)
		if idx == nil || !idx.IsOpenAPI() {
			return nil, nil
		}

		var symbols []protocol.DocumentSymbol

		// Info
		if idx.Document.Info != nil {
			info := idx.Document.Info
			title := info.Title
			if title == "" {
				title = "(untitled)"
			}
			detail := ""
			if info.Version != "" {
				detail = "v" + info.Version
			}
			symbols = append(symbols, protocol.DocumentSymbol{
				Name:           title,
				Detail:         detail,
				Kind:           protocol.SymbolPackage,
				Range:          adapt.RangeToProtocol(info.Loc.Range),
				SelectionRange: clampSelection(adapt.RangeToProtocol(info.Loc.Range), adapt.RangeToProtocol(info.TitleLoc.Range)),
			})
		}

		// Paths
		if len(idx.Document.Paths) > 0 {
			var pathChildren []protocol.DocumentSymbol
			for path, item := range idx.Document.Paths {
				pathSymbol := protocol.DocumentSymbol{
					Name:           path,
					Kind:           protocol.SymbolModule,
					Range:          adapt.RangeToProtocol(item.Loc.Range),
					SelectionRange: clampSelection(adapt.RangeToProtocol(item.Loc.Range), adapt.RangeToProtocol(item.PathLoc.Range)),
				}
				for _, mo := range item.Operations() {
					name := strings.ToUpper(mo.Method)
					if mo.Operation.OperationID != "" {
						name = fmt.Sprintf("%s (%s)", name, mo.Operation.OperationID)
					}
					pathSymbol.Children = append(pathSymbol.Children, protocol.DocumentSymbol{
						Name:           name,
						Kind:           protocol.SymbolMethod,
						Range:          adapt.RangeToProtocol(mo.Operation.Loc.Range),
						SelectionRange: adapt.RangeToProtocol(mo.Operation.Loc.Range),
					})
				}
				pathChildren = append(pathChildren, pathSymbol)
			}
			symbols = append(symbols, protocol.DocumentSymbol{
				Name:           "paths",
				Kind:           protocol.SymbolNamespace,
				Range:          adapt.RangeToProtocol(idx.Document.Loc.Range),
				SelectionRange: adapt.RangeToProtocol(idx.Document.Loc.Range),
				Children:       pathChildren,
			})
		}

		if idx.Document.Components == nil {
			return appendTagSymbols(symbols, idx), nil
		}
		comp := idx.Document.Components

		// Schemas
		if len(comp.Schemas) > 0 {
			var children []protocol.DocumentSymbol
			for name, schema := range comp.Schemas {
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Detail:         schema.Type,
					Kind:           protocol.SymbolClass,
					Range:          adapt.RangeToProtocol(schema.Loc.Range),
					SelectionRange: clampSelection(adapt.RangeToProtocol(schema.Loc.Range), adapt.RangeToProtocol(schema.NameLoc.Range)),
				})
			}
			symbols = append(symbols, componentGroupSymbol("schemas", adapt.RangeToProtocol(comp.Loc.Range), children))
		}

		// Parameters
		if len(comp.Parameters) > 0 {
			var children []protocol.DocumentSymbol
			for name, param := range comp.Parameters {
				detail := param.In
				if param.Required {
					detail += " (required)"
				}
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Detail:         detail,
					Kind:           protocol.SymbolVariable,
					Range:          adapt.RangeToProtocol(param.Loc.Range),
					SelectionRange: clampSelection(adapt.RangeToProtocol(param.Loc.Range), adapt.RangeToProtocol(param.NameLoc.Range)),
				})
			}
			symbols = append(symbols, componentGroupSymbol("parameters", adapt.RangeToProtocol(comp.Loc.Range), children))
		}

		// Responses
		if len(comp.Responses) > 0 {
			var children []protocol.DocumentSymbol
			for name, resp := range comp.Responses {
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Detail:         truncate(resp.Description.Text, 60),
					Kind:           protocol.SymbolField,
					Range:          adapt.RangeToProtocol(resp.Loc.Range),
					SelectionRange: adapt.RangeToProtocol(resp.Loc.Range),
				})
			}
			symbols = append(symbols, componentGroupSymbol("responses", adapt.RangeToProtocol(comp.Loc.Range), children))
		}

		// Request Bodies
		if len(comp.RequestBodies) > 0 {
			var children []protocol.DocumentSymbol
			for name, rb := range comp.RequestBodies {
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Detail:         truncate(rb.Description.Text, 60),
					Kind:           protocol.SymbolStruct,
					Range:          adapt.RangeToProtocol(rb.Loc.Range),
					SelectionRange: adapt.RangeToProtocol(rb.Loc.Range),
				})
			}
			symbols = append(symbols, componentGroupSymbol("requestBodies", adapt.RangeToProtocol(comp.Loc.Range), children))
		}

		// Headers
		if len(comp.Headers) > 0 {
			var children []protocol.DocumentSymbol
			for name, hdr := range comp.Headers {
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Detail:         truncate(hdr.Description.Text, 60),
					Kind:           protocol.SymbolField,
					Range:          adapt.RangeToProtocol(hdr.Loc.Range),
					SelectionRange: adapt.RangeToProtocol(hdr.Loc.Range),
				})
			}
			symbols = append(symbols, componentGroupSymbol("headers", adapt.RangeToProtocol(comp.Loc.Range), children))
		}

		// Security Schemes
		if len(comp.SecuritySchemes) > 0 {
			var children []protocol.DocumentSymbol
			for name, ss := range comp.SecuritySchemes {
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Detail:         ss.Type,
					Kind:           protocol.SymbolProperty,
					Range:          adapt.RangeToProtocol(ss.Loc.Range),
					SelectionRange: adapt.RangeToProtocol(ss.Loc.Range),
				})
			}
			symbols = append(symbols, componentGroupSymbol("securitySchemes", adapt.RangeToProtocol(comp.Loc.Range), children))
		}

		// Links
		if len(comp.Links) > 0 {
			var children []protocol.DocumentSymbol
			for name, link := range comp.Links {
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Detail:         truncate(link.Description.Text, 60),
					Kind:           protocol.SymbolProperty,
					Range:          adapt.RangeToProtocol(link.Loc.Range),
					SelectionRange: adapt.RangeToProtocol(link.Loc.Range),
				})
			}
			symbols = append(symbols, componentGroupSymbol("links", adapt.RangeToProtocol(comp.Loc.Range), children))
		}

		// Callbacks
		if len(comp.Callbacks) > 0 {
			var children []protocol.DocumentSymbol
			for name, cb := range comp.Callbacks {
				r := callbackRange(*cb)
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Kind:           protocol.SymbolFunction,
					Range:          r,
					SelectionRange: r,
				})
			}
			symbols = append(symbols, componentGroupSymbol("callbacks", adapt.RangeToProtocol(comp.Loc.Range), children))
		}

		return appendTagSymbols(symbols, idx), nil
	}
}

func appendTagSymbols(symbols []protocol.DocumentSymbol, idx *openapi.Index) []protocol.DocumentSymbol {
	if len(idx.Tags) == 0 {
		return symbols
	}
	var children []protocol.DocumentSymbol
	for _, tag := range idx.Document.Tags {
		children = append(children, protocol.DocumentSymbol{
			Name:           tag.Name,
			Detail:         truncate(tag.Description.Text, 60),
			Kind:           protocol.SymbolString,
			Range:          adapt.RangeToProtocol(tag.Loc.Range),
			SelectionRange: clampSelection(adapt.RangeToProtocol(tag.Loc.Range), adapt.RangeToProtocol(tag.NameLoc.Range)),
		})
	}
	symbols = append(symbols, protocol.DocumentSymbol{
		Name:           "tags",
		Kind:           protocol.SymbolNamespace,
		Range:          adapt.RangeToProtocol(idx.Document.Loc.Range),
		SelectionRange: adapt.RangeToProtocol(idx.Document.Loc.Range),
		Children:       children,
	})
	return symbols
}

func componentGroupSymbol(name string, parentRange protocol.Range, children []protocol.DocumentSymbol) protocol.DocumentSymbol {
	return protocol.DocumentSymbol{
		Name:           name,
		Kind:           protocol.SymbolNamespace,
		Range:          parentRange,
		SelectionRange: parentRange,
		Children:       children,
	}
}

func callbackRange(cb openapi.Callback) protocol.Range {
	for _, item := range cb {
		if item != nil {
			return adapt.RangeToProtocol(item.Loc.Range)
		}
	}
	return protocol.Range{}
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}
