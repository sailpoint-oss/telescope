package lsp

import (
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewPrepareRenameHandler validates whether a rename is possible at the cursor.
func NewPrepareRenameHandler(cache *openapi.IndexCache) gossip.PrepareRenameHandler {
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

		// Check all component types
		for _, kind := range componentKinds {
			for _, name := range idx.ComponentNames(kind) {
				if name == word {
					return &protocol.PrepareRenameResult{
						Range:       rangeForWord(params.Position, word),
						Placeholder: word,
					}, nil
				}
			}
		}

		// operationId
		if _, ok := idx.Operations[word]; ok {
			return &protocol.PrepareRenameResult{
				Range:       rangeForWord(params.Position, word),
				Placeholder: word,
			}, nil
		}

		// Tag
		if _, ok := idx.Tags[word]; ok {
			return &protocol.PrepareRenameResult{
				Range:       rangeForWord(params.Position, word),
				Placeholder: word,
			}, nil
		}

		return nil, nil
	}
}

// NewRenameHandler supports renaming operationId, all component types, tags,
// and security scheme usages across workspace files.
func NewRenameHandler(cache *openapi.IndexCache) gossip.RenameHandler {
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
			if renamed := renameComponent(idx, cache, uri, kind, word, params.NewName, changes); renamed {
				return &protocol.WorkspaceEdit{Changes: changes}, nil
			}
		}

		// Rename operationId
		if opRef, ok := idx.Operations[word]; ok {
			changes[uri] = append(changes[uri], protocol.TextEdit{
				Range:   opRef.Operation.OperationIDLoc.Range,
				NewText: params.NewName,
			})

			// Also rename operationId references in links/callbacks across workspace
			for docURI, docIdx := range cache.All() {
				for _, item := range docIdx.Document.Paths {
					for _, mo := range item.Operations() {
						for _, link := range mo.Operation.Responses {
							if link == nil {
								continue
							}
							for _, l := range link.Links {
								if l.OperationID == word {
									changes[docURI] = append(changes[docURI], protocol.TextEdit{
										Range:   l.Loc.Range,
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
			// Rename root tag definition
			changes[uri] = append(changes[uri], protocol.TextEdit{
				Range:   tag.NameLoc.Range,
				NewText: params.NewName,
			})

		// Rename all tag usages in operations across workspace
		for docURI, docIdx := range cache.All() {
			for _, item := range docIdx.Document.Paths {
				for _, mo := range item.Operations() {
					if tu, ok := mo.Operation.HasTag(word); ok && tu.Loc.Node != nil {
						changes[docURI] = append(changes[docURI], protocol.TextEdit{
							Range:   tu.Loc.Range,
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

	// Update all $ref usages across workspace
	refPath := openapi.ComponentRefPath(kind, word)
	newRefPath := openapi.ComponentRefPath(kind, newName)
	for docURI, docIdx := range cache.All() {
		for _, usage := range docIdx.RefsTo(refPath) {
			changes[docURI] = append(changes[docURI], protocol.TextEdit{
				Range:   usage.Loc.Range,
				NewText: newRefPath,
			})
		}
	}

	// For security schemes, also rename keys in security arrays
	if kind == "securitySchemes" {
		renameSecurityUsages(cache, word, newName, changes)
	}

	return true
}

func componentDefinitionLoc(idx *openapi.Index, kind, name string) protocol.Range {
	switch kind {
	case "schemas":
		if s, ok := idx.Schemas[name]; ok {
			return s.NameLoc.Range
		}
	case "parameters":
		if p, ok := idx.Parameters[name]; ok {
			return p.NameLoc.Range
		}
	case "responses":
		if r, ok := idx.Responses[name]; ok {
			return r.Loc.Range
		}
	case "securitySchemes":
		if ss, ok := idx.SecuritySchemes[name]; ok {
			return ss.Loc.Range
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
		// Root-level security
		for _, req := range docIdx.Document.Security {
			if entry, ok := req.HasScheme(oldName); ok && entry.NameLoc.Node != nil {
				changes[docURI] = append(changes[docURI], protocol.TextEdit{
					Range:   entry.NameLoc.Range,
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
							Range:   entry.NameLoc.Range,
							NewText: newName,
						})
					}
				}
			}
		}
	}
}

func rangeForWord(pos protocol.Position, word string) protocol.Range {
	half := uint32(len(word) / 2)
	start := pos.Character
	if start > half {
		start -= half
	} else {
		start = 0
	}
	return protocol.Range{
		Start: protocol.Position{Line: pos.Line, Character: start},
		End:   protocol.Position{Line: pos.Line, Character: start + uint32(len(word))},
	}
}

func isRefToComponent(ref, kind, name string) bool {
	expected := "#/components/" + kind + "/" + name
	return strings.HasSuffix(ref, expected) || ref == expected
}
