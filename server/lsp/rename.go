package lsp

import (
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewPrepareRenameHandler validates whether a rename is possible at the cursor.
func NewPrepareRenameHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.PrepareRenameHandler {
	return func(ctx *gossip.Context, params *protocol.PrepareRenameParams) (*protocol.PrepareRenameResult, error) {
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

		// Check all component types — use the exact source range from the index
		for _, kind := range componentKinds {
			for _, name := range idx.ComponentNames(kind) {
				if name == word {
					r := componentDefinitionLoc(idx, kind, name)
					if isZeroRange(r) {
						r = exactWordRange(doc, params.Position, word)
					}
					return &protocol.PrepareRenameResult{
						Range:       r,
						Placeholder: word,
					}, nil
				}
			}
		}

		// operationId — use OperationIDLoc from the index
		if opRef, ok := idx.Operations[word]; ok {
			r := adapt.RangeToProtocol(opRef.Operation.OperationIDLoc.Range)
			if isZeroRange(r) {
				r = exactWordRange(doc, params.Position, word)
			}
			return &protocol.PrepareRenameResult{
				Range:       r,
				Placeholder: word,
			}, nil
		}

		// Tag — use NameLoc from the index
		if tag, ok := idx.Tags[word]; ok {
			r := adapt.RangeToProtocol(tag.NameLoc.Range)
			if isZeroRange(r) {
				r = exactWordRange(doc, params.Position, word)
			}
			return &protocol.PrepareRenameResult{
				Range:       r,
				Placeholder: word,
			}, nil
		}

		return nil, nil
	}
}

// NewRenameHandler supports renaming operationId, all component types, tags,
// and security scheme usages across workspace files.
func NewRenameHandler(cache *openapi.IndexCache, graphBridge *GraphBridge) gossip.RenameHandler {
	return func(ctx *gossip.Context, params *protocol.RenameParams) (*protocol.WorkspaceEdit, error) {
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

		changes := make(map[protocol.DocumentURI][]protocol.TextEdit)

		// Rename any component type (schemas, parameters, responses, etc.)
		for _, kind := range componentKinds {
			if renamed := renameComponent(idx, cache, uri, kind, word, params.NewName, changes, graphBridge); renamed {
				return &protocol.WorkspaceEdit{Changes: changes}, nil
			}
		}

		// Rename operationId
		if opRef, ok := idx.Operations[word]; ok {
			changes[uri] = append(changes[uri], protocol.TextEdit{
				Range:   adapt.RangeToProtocol(opRef.Operation.OperationIDLoc.Range),
				NewText: params.NewName,
			})

		// Also rename operationId references in links/callbacks across workspace
		for docURI, docIdx := range cache.All() {
			if docIdx == nil || docIdx.Document == nil {
				continue
			}
			for _, item := range docIdx.Document.Paths {
					for _, mo := range item.Operations() {
						for _, link := range mo.Operation.Responses {
							if link == nil {
								continue
							}
							for _, l := range link.Links {
								if l.OperationID == word {
									changes[docURI] = append(changes[docURI], protocol.TextEdit{
										Range:   adapt.RangeToProtocol(l.Loc.Range),
										NewText: params.NewName,
									})
								}
							}
						}
					}
				}
			}

			return &protocol.WorkspaceEdit{Changes: changes}, nil
		}

		// Rename tag
		if tag, ok := idx.Tags[word]; ok {
			tagRange := adapt.RangeToProtocol(tag.NameLoc.Range)
			if isZeroRange(tagRange) {
				tagRange = exactWordRange(doc, params.Position, word)
			}
			// Rename root tag definition
			changes[uri] = append(changes[uri], protocol.TextEdit{
				Range:   tagRange,
				NewText: params.NewName,
			})

		// Rename all tag usages in operations across workspace
		for docURI, docIdx := range cache.All() {
			if docIdx == nil || docIdx.Document == nil {
				continue
			}
			for _, item := range docIdx.Document.Paths {
					for _, mo := range item.Operations() {
						if tu, ok := mo.Operation.HasTag(word); ok && tu.Loc.Node != nil {
							changes[docURI] = append(changes[docURI], protocol.TextEdit{
								Range:   adapt.RangeToProtocol(tu.Loc.Range),
								NewText: params.NewName,
							})
						}
					}
				}
			}

			return &protocol.WorkspaceEdit{Changes: changes}, nil
		}

		return nil, nil
	}
}

var componentKinds = []string{
	"schemas", "parameters", "responses", "requestBodies",
	"headers", "securitySchemes", "links",
}

func renameComponent(
	idx *openapi.Index,
	cache *openapi.IndexCache,
	uri protocol.DocumentURI,
	kind, word, newName string,
	changes map[protocol.DocumentURI][]protocol.TextEdit,
	gb *GraphBridge,
) bool {
	names := idx.ComponentNames(kind)
	found := false
	for _, n := range names {
		if n == word {
			found = true
			break
		}
	}
	if !found {
		return false
	}

	// Find the definition location for this component
	defLoc := componentDefinitionLoc(idx, kind, word)
	if !isZeroRange(defLoc) {
		changes[uri] = append(changes[uri], protocol.TextEdit{
			Range:   defLoc,
			NewText: newName,
		})
	}

	refPath := openapi.ComponentRefPath(kind, word)
	newRefPath := openapi.ComponentRefPath(kind, newName)

	// Graph-accelerated: use reverse edge index to only visit dependent documents
	if gb != nil {
		dependents := gb.Dependents(string(uri))
		visited := make(map[protocol.DocumentURI]bool, len(dependents)+1)
		visited[uri] = true
		for _, depURI := range dependents {
			docURI := protocol.DocumentURI(depURI)
			if visited[docURI] {
				continue
			}
			visited[docURI] = true
			docIdx := cache.Get(docURI)
			if docIdx == nil {
				continue
			}
			appendComponentRefRenames(docIdx, docURI, refPath, newRefPath, changes)
		}
		// Also check refs in the same document.
		appendComponentRefRenames(idx, uri, refPath, newRefPath, changes)
	} else {
		// Fallback: scan all documents
		for docURI, docIdx := range cache.All() {
			appendComponentRefRenames(docIdx, docURI, refPath, newRefPath, changes)
		}
	}

	// For security schemes, also rename keys in security arrays
	if kind == "securitySchemes" {
		renameSecurityUsages(cache, word, newName, changes)
	}

	return true
}

// appendComponentRefRenames appends edits for component refs matching either
// local form ("#/components/...") or external form ("./x.yaml#/components/...").
func appendComponentRefRenames(
	idx *openapi.Index,
	docURI protocol.DocumentURI,
	refPath string,
	newRefPath string,
	changes map[protocol.DocumentURI][]protocol.TextEdit,
) {
	if idx == nil {
		return
	}
	for _, ref := range idx.AllRefs {
		if !strings.HasSuffix(ref.Target, refPath) {
			continue
		}
		prefix := strings.TrimSuffix(ref.Target, refPath)
		changes[docURI] = append(changes[docURI], protocol.TextEdit{
			Range:   adapt.RangeToProtocol(ref.Loc.Range),
			NewText: prefix + newRefPath,
		})
	}
}

func componentDefinitionLoc(idx *openapi.Index, kind, name string) protocol.Range {
	if idx.Document == nil || idx.Document.Components == nil {
		return protocol.Range{}
	}
	comp := idx.Document.Components
	switch kind {
	case "schemas":
		if s, ok := comp.Schemas[name]; ok {
			return adapt.RangeToProtocol(openapi.LocOrFallback(s.NameLoc, s.Loc).Range)
		}
	case "parameters":
		if p, ok := comp.Parameters[name]; ok {
			return adapt.RangeToProtocol(openapi.LocOrFallback(p.NameLoc, p.Loc).Range)
		}
	case "responses":
		if r, ok := comp.Responses[name]; ok {
			return adapt.RangeToProtocol(openapi.LocOrFallback(r.NameLoc, r.Loc).Range)
		}
	case "requestBodies":
		if rb, ok := comp.RequestBodies[name]; ok {
			return adapt.RangeToProtocol(openapi.LocOrFallback(rb.NameLoc, rb.Loc).Range)
		}
	case "headers":
		if h, ok := comp.Headers[name]; ok {
			return adapt.RangeToProtocol(openapi.LocOrFallback(h.NameLoc, h.Loc).Range)
		}
	case "securitySchemes":
		if ss, ok := comp.SecuritySchemes[name]; ok {
			return adapt.RangeToProtocol(openapi.LocOrFallback(ss.NameLoc, ss.Loc).Range)
		}
	case "links":
		if l, ok := comp.Links[name]; ok {
			return adapt.RangeToProtocol(openapi.LocOrFallback(l.NameLoc, l.Loc).Range)
		}
	case "examples":
		if ex, ok := comp.Examples[name]; ok {
			return adapt.RangeToProtocol(openapi.LocOrFallback(ex.NameLoc, ex.Loc).Range)
		}
	}
	return protocol.Range{}
}

func renameSecurityUsages(
	cache *openapi.IndexCache,
	oldName, newName string,
	changes map[protocol.DocumentURI][]protocol.TextEdit,
) {
	for docURI, docIdx := range cache.All() {
		if docIdx == nil || docIdx.Document == nil {
			continue
		}
		// Root-level security
		for _, req := range docIdx.Document.Security {
			if entry, ok := req.HasScheme(oldName); ok && entry.NameLoc.Node != nil {
				changes[docURI] = append(changes[docURI], protocol.TextEdit{
					Range:   adapt.RangeToProtocol(entry.NameLoc.Range),
					NewText: newName,
				})
			}
		}
		// Operation-level security
		for _, item := range docIdx.Document.Paths {
			for _, mo := range item.Operations() {
				for _, req := range mo.Operation.Security {
					if entry, ok := req.HasScheme(oldName); ok && entry.NameLoc.Node != nil {
						changes[docURI] = append(changes[docURI], protocol.TextEdit{
							Range:   adapt.RangeToProtocol(entry.NameLoc.Range),
							NewText: newName,
						})
					}
				}
			}
		}
	}
}

func rangeForWord(pos protocol.Position, word string) protocol.Range {
	wordLen := utf16LenStr(word)
	half := wordLen / 2
	start := pos.Character
	if start > half {
		start -= half
	} else {
		start = 0
	}
	return protocol.Range{
		Start: protocol.Position{Line: pos.Line, Character: start},
		End:   protocol.Position{Line: pos.Line, Character: start + wordLen},
	}
}

func exactWordRange(doc *document.Document, pos protocol.Position, word string) protocol.Range {
	if doc == nil {
		return rangeForWord(pos, word)
	}
	text := doc.Text()
	offset := doc.OffsetAt(pos)
	if offset < 0 || offset > len(text) {
		return rangeForWord(pos, word)
	}
	start := offset
	for start > 0 && isRenameWordChar(text[start-1]) {
		start--
	}
	end := offset
	for end < len(text) && isRenameWordChar(text[end]) {
		end++
	}
	if start == end {
		return rangeForWord(pos, word)
	}
	return protocol.Range{
		Start: doc.PositionAt(start),
		End:   doc.PositionAt(end),
	}
}

func isRenameWordChar(b byte) bool {
	return (b >= 'a' && b <= 'z') ||
		(b >= 'A' && b <= 'Z') ||
		(b >= '0' && b <= '9') ||
		b == '_'
}

// utf16LenStr returns the number of UTF-16 code units needed to represent s.
func utf16LenStr(s string) uint32 {
	n := uint32(0)
	for len(s) > 0 {
		r, size := utf8.DecodeRuneInString(s)
		s = s[size:]
		n += uint32(utf16.RuneLen(r))
	}
	return n
}

func isRefToComponent(ref, kind, name string) bool {
	expected := "#/components/" + kind + "/" + name
	return strings.HasSuffix(ref, expected) || ref == expected
}
