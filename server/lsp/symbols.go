package lsp

import (
	"fmt"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
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
func NewSymbolHandler(cache *openapi.IndexCache) gossip.DocumentSymbolHandler {
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
				Range:          info.Loc.Range,
				SelectionRange: clampSelection(info.Loc.Range, info.TitleLoc.Range),
			})
		}

		// Paths
		if len(idx.Document.Paths) > 0 {
			var pathChildren []protocol.DocumentSymbol
			for path, item := range idx.Document.Paths {
				pathSymbol := protocol.DocumentSymbol{
					Name:           path,
					Kind:           protocol.SymbolModule,
					Range:          item.Loc.Range,
					SelectionRange: clampSelection(item.Loc.Range, item.PathLoc.Range),
				}
				for _, mo := range item.Operations() {
					name := strings.ToUpper(mo.Method)
					if mo.Operation.OperationID != "" {
						name = fmt.Sprintf("%s (%s)", name, mo.Operation.OperationID)
					}
					pathSymbol.Children = append(pathSymbol.Children, protocol.DocumentSymbol{
						Name:           name,
						Kind:           protocol.SymbolMethod,
						Range:          mo.Operation.Loc.Range,
						SelectionRange: mo.Operation.Loc.Range,
					})
				}
				pathChildren = append(pathChildren, pathSymbol)
			}
			symbols = append(symbols, protocol.DocumentSymbol{
				Name:           "paths",
				Kind:           protocol.SymbolNamespace,
				Range:          idx.Document.Loc.Range,
				SelectionRange: idx.Document.Loc.Range,
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
					Range:          schema.Loc.Range,
					SelectionRange: clampSelection(schema.Loc.Range, schema.NameLoc.Range),
				})
			}
			symbols = append(symbols, componentGroupSymbol("schemas", comp.Loc.Range, children))
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
					Range:          param.Loc.Range,
					SelectionRange: clampSelection(param.Loc.Range, param.NameLoc.Range),
				})
			}
			symbols = append(symbols, componentGroupSymbol("parameters", comp.Loc.Range, children))
		}

		// Responses
		if len(comp.Responses) > 0 {
			var children []protocol.DocumentSymbol
			for name, resp := range comp.Responses {
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Detail:         truncate(resp.Description.Text, 60),
					Kind:           protocol.SymbolField,
					Range:          resp.Loc.Range,
					SelectionRange: resp.Loc.Range,
				})
			}
			symbols = append(symbols, componentGroupSymbol("responses", comp.Loc.Range, children))
		}

		// Request Bodies
		if len(comp.RequestBodies) > 0 {
			var children []protocol.DocumentSymbol
			for name, rb := range comp.RequestBodies {
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Detail:         truncate(rb.Description.Text, 60),
					Kind:           protocol.SymbolStruct,
					Range:          rb.Loc.Range,
					SelectionRange: rb.Loc.Range,
				})
			}
			symbols = append(symbols, componentGroupSymbol("requestBodies", comp.Loc.Range, children))
		}

		// Headers
		if len(comp.Headers) > 0 {
			var children []protocol.DocumentSymbol
			for name, hdr := range comp.Headers {
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Detail:         truncate(hdr.Description.Text, 60),
					Kind:           protocol.SymbolField,
					Range:          hdr.Loc.Range,
					SelectionRange: hdr.Loc.Range,
				})
			}
			symbols = append(symbols, componentGroupSymbol("headers", comp.Loc.Range, children))
		}

		// Security Schemes
		if len(comp.SecuritySchemes) > 0 {
			var children []protocol.DocumentSymbol
			for name, ss := range comp.SecuritySchemes {
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Detail:         ss.Type,
					Kind:           protocol.SymbolProperty,
					Range:          ss.Loc.Range,
					SelectionRange: ss.Loc.Range,
				})
			}
			symbols = append(symbols, componentGroupSymbol("securitySchemes", comp.Loc.Range, children))
		}

		// Links
		if len(comp.Links) > 0 {
			var children []protocol.DocumentSymbol
			for name, link := range comp.Links {
				children = append(children, protocol.DocumentSymbol{
					Name:           name,
					Detail:         truncate(link.Description.Text, 60),
					Kind:           protocol.SymbolProperty,
					Range:          link.Loc.Range,
					SelectionRange: link.Loc.Range,
				})
			}
			symbols = append(symbols, componentGroupSymbol("links", comp.Loc.Range, children))
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
			symbols = append(symbols, componentGroupSymbol("callbacks", comp.Loc.Range, children))
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
			Range:          tag.Loc.Range,
			SelectionRange: clampSelection(tag.Loc.Range, tag.NameLoc.Range),
		})
	}
	symbols = append(symbols, protocol.DocumentSymbol{
		Name:           "tags",
		Kind:           protocol.SymbolNamespace,
		Range:          idx.Document.Loc.Range,
		SelectionRange: idx.Document.Loc.Range,
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
			return item.Loc.Range
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
