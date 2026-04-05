// Package navadapt bridges gossip protocol types and navigator types.
// It is the single boundary between the navigator library and telescope's
// gossip-based LSP layer.
package navadapt

import (
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"

	navigator "github.com/sailpoint-oss/navigator"
	navgraph "github.com/sailpoint-oss/navigator/graph"
)

// --- Position / Range conversions ---

// PositionToProtocol converts a navigator Position to a protocol Position.
func PositionToProtocol(p navigator.Position) protocol.Position {
	return protocol.Position{Line: p.Line, Character: p.Character}
}

// PositionFromProtocol converts a protocol Position to a navigator Position.
func PositionFromProtocol(p protocol.Position) navigator.Position {
	return navigator.Position{Line: p.Line, Character: p.Character}
}

// RangeToProtocol converts a navigator Range to a protocol Range.
func RangeToProtocol(r navigator.Range) protocol.Range {
	return protocol.Range{
		Start: PositionToProtocol(r.Start),
		End:   PositionToProtocol(r.End),
	}
}

// RangeFromProtocol converts a protocol Range to a navigator Range.
func RangeFromProtocol(r protocol.Range) navigator.Range {
	return navigator.Range{
		Start: PositionFromProtocol(r.Start),
		End:   PositionFromProtocol(r.End),
	}
}

// --- Index building ---

// BuildIndex builds a navigator Index from a gossip tree-sitter tree and document.
// This replaces openapi.BuildIndex(tree, doc) in the old code.
func BuildIndex(tree *treesitter.Tree, doc *document.Document) *navigator.Index {
	if tree == nil || doc == nil {
		return nil
	}
	uri := string(doc.URI())
	format := navigator.FormatFromURI(uri)

	rawTree := tree.Raw()
	content := []byte(doc.Text())

	return navigator.ParseTree(rawTree, content, uri, format)
}

// --- IndexCache adapter ---

// IndexCacheAdapter wraps a navigator.IndexCache to accept protocol.DocumentURI
// keys, bridging between telescope's gossip-keyed API and navigator's string-keyed API.
type IndexCacheAdapter struct {
	Inner *navigator.IndexCache
}

// NewIndexCacheAdapter creates a new adapter around a navigator IndexCache.
func NewIndexCacheAdapter() *IndexCacheAdapter {
	return &IndexCacheAdapter{Inner: navigator.NewIndexCache()}
}

// Get returns the cached index for a URI.
func (a *IndexCacheAdapter) Get(uri protocol.DocumentURI) *navigator.Index {
	return a.Inner.Get(NormalizeDocURI(uri))
}

// Set stores an index for a URI.
func (a *IndexCacheAdapter) Set(uri protocol.DocumentURI, idx *navigator.Index) {
	a.Inner.Set(NormalizeDocURI(uri), idx)
}

// Delete removes the index for a URI.
func (a *IndexCacheAdapter) Delete(uri protocol.DocumentURI) {
	a.Inner.Delete(NormalizeDocURI(uri))
}

// All returns all cached indexes keyed by protocol.DocumentURI.
func (a *IndexCacheAdapter) All() map[protocol.DocumentURI]*navigator.Index {
	raw := a.Inner.All()
	result := make(map[protocol.DocumentURI]*navigator.Index, len(raw))
	for k, v := range raw {
		result[protocol.DocumentURI(k)] = v
	}
	return result
}

// FindByOperationID searches all cached indexes for an operationId.
func (a *IndexCacheAdapter) FindByOperationID(opID string) (protocol.DocumentURI, *navigator.OperationRef) {
	uri, ref := a.Inner.FindByOperationID(opID)
	return protocol.DocumentURI(uri), ref
}

// FindRefTarget searches all cached indexes for a $ref target.
func (a *IndexCacheAdapter) FindRefTarget(ref string) (protocol.DocumentURI, interface{}) {
	uri, val := a.Inner.FindRefTarget(ref)
	return protocol.DocumentURI(uri), val
}

// SetBuilder registers a fallback function that builds the index on-demand.
func (a *IndexCacheAdapter) SetBuilder(fn func(protocol.DocumentURI) *navigator.Index) {
	a.Inner.SetBuilder(func(uri string) *navigator.Index {
		return fn(protocol.DocumentURI(uri))
	})
}

// NormalizeDocURI normalizes a protocol.DocumentURI to a string using gossip's
// normalization for cache key consistency.
func NormalizeDocURI(uri protocol.DocumentURI) string {
	return string(protocol.NormalizeURI(uri))
}

// NormalizeURI normalizes a string URI using gossip's normalization.
func NormalizeURI(uri string) string {
	return string(protocol.NormalizeURI(protocol.DocumentURI(uri)))
}

// --- Document Store adapter ---

// StoreProvider wraps a gossip document.Store to implement the graph.LSPDocumentProvider
// interface expected by navigator/graph.LSPSource.
type StoreProvider struct {
	Store *document.Store
}

// Content returns the text content and version of a document, or ok=false if
// the document is not in the store.
func (p *StoreProvider) Content(uri string) (string, int32, bool) {
	doc := p.Store.Get(protocol.DocumentURI(uri))
	if doc == nil {
		return "", 0, false
	}
	return doc.Text(), doc.Version(), true
}

// --- Diagnostic conversion ---

// DiagnosticToProtocol converts a navigator graph.Diagnostic to a protocol.Diagnostic.
func DiagnosticToProtocol(d navgraph.Diagnostic) protocol.Diagnostic {
	return protocol.Diagnostic{
		Range:    RangeToProtocol(d.Range),
		Severity: protocol.DiagnosticSeverity(d.Severity),
		Code:     d.Code,
		Source:   d.Source,
		Message:  d.Message,
	}
}

// DiagnosticFromProtocol converts a protocol.Diagnostic to a navigator graph.Diagnostic.
func DiagnosticFromProtocol(d protocol.Diagnostic, uri string) navgraph.Diagnostic {
	code, _ := d.Code.(string)
	return navgraph.Diagnostic{
		URI:      uri,
		Range:    RangeFromProtocol(d.Range),
		Severity: int(d.Severity),
		Code:     code,
		Source:   d.Source,
		Message:  d.Message,
	}
}
