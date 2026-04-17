package openapi

import (
	"sync/atomic"

	"github.com/LukasParke/gossip/protocol"

	navigator "github.com/sailpoint-oss/navigator"
)

// ParseAndIndex parses raw YAML/JSON content into an OpenAPI Index without
// requiring tree-sitter. Delegates to navigator's standalone parser.
// Returns a minimal Index with DocTypeUnknown for unparseable content.
func ParseAndIndex(content []byte) *Index {
	navIdx := navigator.ParseAndIndex(content)
	if navIdx == nil {
		return &Index{
			Document:         &Document{DocType: DocTypeUnknown},
			Operations:       make(map[string]*OperationRef),
			OperationsByPath: make(map[string][]OperationRef),
			Schemas:          make(map[string]*Schema),
			Parameters:       make(map[string]*Parameter),
			Responses:        make(map[string]*Response),
			SecuritySchemes:  make(map[string]*SecurityScheme),
			Refs:             make(map[string][]RefUsage),
			Tags:             make(map[string]*Tag),
			Kind:             DocumentKindUnknown,
			sorted:           &atomic.Pointer[sortedViews]{},
		}
	}
	return IndexFromNavigator(navIdx, "")
}

// IndexFromNavigator converts a navigator.Index to telescope's openapi.Index.
// The model types (Document, Schema, etc.) are shared via aliases so no deep
// copy is needed. Only the index-level bookkeeping fields are mapped.
func IndexFromNavigator(navIdx *navigator.Index, uri protocol.DocumentURI) *Index {
	if navIdx == nil {
		return nil
	}
	idx := &Index{
		Document:         navIdx.Document,
		Arazzo:           navIdx.Arazzo,
		Operations:       make(map[string]*OperationRef, len(navIdx.Operations)),
		OperationsByPath: make(map[string][]OperationRef, len(navIdx.OperationsByPath)),
		Schemas:          navIdx.Schemas,
		Parameters:       navIdx.Parameters,
		Responses:        navIdx.Responses,
		SecuritySchemes:  navIdx.SecuritySchemes,
		Refs:             make(map[string][]RefUsage, len(navIdx.Refs)),
		Tags:             navIdx.Tags,
		Version:          navIdx.Version,
		Format:           FileFormat(navIdx.Format),
		Kind:             navIdx.Kind,
		nav:              navIdx,
		sorted:           &atomic.Pointer[sortedViews]{},
	}
	if idx.Kind == DocumentKindArazzo && idx.Arazzo != nil {
		idx.Version = Version(idx.Arazzo.Version)
	}

	for id, ref := range navIdx.Operations {
		idx.Operations[id] = &OperationRef{
			Path:      ref.Path,
			Method:    ref.Method,
			Operation: ref.Operation,
		}
	}

	for path, ops := range navIdx.OperationsByPath {
		converted := make([]OperationRef, len(ops))
		for i, op := range ops {
			converted[i] = OperationRef{
				Path:      op.Path,
				Method:    op.Method,
				Operation: op.Operation,
			}
		}
		idx.OperationsByPath[path] = converted
	}

	for target, usages := range navIdx.Refs {
		converted := make([]RefUsage, len(usages))
		for i, u := range usages {
			converted[i] = RefUsage{
				URI:    protocol.DocumentURI(u.URI),
				Loc:    u.Loc,
				Target: u.Target,
				From:   u.From,
			}
		}
		idx.Refs[target] = converted
	}

	for _, u := range navIdx.AllRefs {
		ru := RefUsage{
			URI:    protocol.DocumentURI(u.URI),
			Loc:    u.Loc,
			Target: u.Target,
			From:   u.From,
		}
		if uri != "" {
			ru.URI = uri
		}
		idx.AllRefs = append(idx.AllRefs, ru)
	}

	return idx
}
