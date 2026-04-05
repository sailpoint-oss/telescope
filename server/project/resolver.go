package project

import (
	"fmt"
	"strings"

	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func normURI(uri string) string { return openapi.NormalizeURI(uri) }

// CrossFileResolver resolves $ref values that span across files within a
// project. It uses the project's merged set of indexes to locate the target
// document and then delegates to its local resolver.
type CrossFileResolver struct {
	docs map[string]*openapi.Index
}

// NewCrossFileResolver creates a resolver over the given set of document indexes.
func NewCrossFileResolver(docs map[string]*openapi.Index) *CrossFileResolver {
	return &CrossFileResolver{docs: docs}
}

// ResolveResult holds the outcome of a cross-file $ref resolution.
type ResolveResult struct {
	TargetURI   string
	TargetIndex *openapi.Index
	Value       interface{}
}

// Resolve follows a $ref value from the given source document. For local refs
// (#/...) it uses the source document's index. For external refs
// (./file.yaml#/...) it resolves the file path relative to the source and
// then resolves the fragment within the target index.
func (r *CrossFileResolver) Resolve(fromURI, ref string) (*ResolveResult, error) {
	if ref == "" {
		return nil, fmt.Errorf("empty $ref")
	}

	from := normURI(fromURI)

	if strings.HasPrefix(ref, "#") {
		idx, ok := r.docs[from]
		if !ok {
			return nil, fmt.Errorf("source document %s not in project", from)
		}
		val, err := idx.ResolveRef(ref)
		if err != nil {
			return nil, err
		}
		return &ResolveResult{TargetURI: from, TargetIndex: idx, Value: val}, nil
	}

	parts := strings.SplitN(ref, "#", 2)
	filePart := parts[0]
	fragment := ""
	if len(parts) == 2 {
		fragment = "#" + parts[1]
	}

	targetURI := normURI(navigator.ResolveRelativeURI(from, filePart))
	if targetURI == "" {
		return nil, fmt.Errorf("cannot resolve file path %q relative to %s", filePart, from)
	}

	idx, ok := r.docs[targetURI]
	if !ok {
		return nil, fmt.Errorf("referenced file %s not found in project (resolved from %s)", targetURI, ref)
	}

	if fragment == "" || fragment == "#" {
		return &ResolveResult{TargetURI: targetURI, TargetIndex: idx, Value: idx.PrimaryValue()}, nil
	}

	val, err := idx.ResolveRef(fragment)
	if err != nil {
		return nil, fmt.Errorf("resolve %s in %s: %w", fragment, targetURI, err)
	}
	return &ResolveResult{TargetURI: targetURI, TargetIndex: idx, Value: val}, nil
}

// CanResolve checks whether a $ref from the given source can be resolved.
func (r *CrossFileResolver) CanResolve(fromURI, ref string) bool {
	_, err := r.Resolve(fromURI, ref)
	return err == nil
}
