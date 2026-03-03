package project

import (
	"fmt"
	"strings"

	"github.com/sailpoint-oss/telescope/server/openapi"
)

// CrossFileResolver resolves $ref values that span across files within a
// project. It uses the project's merged set of indexes to locate the target
// document and then delegates to its local resolver.
type CrossFileResolver struct {
	docs map[string]*openapi.Index // URI -> index
}

// NewCrossFileResolver creates a resolver over the given set of document indexes.
func NewCrossFileResolver(docs map[string]*openapi.Index) *CrossFileResolver {
	return &CrossFileResolver{docs: docs}
}

// ResolveResult holds the outcome of a cross-file $ref resolution.
type ResolveResult struct {
	TargetURI   string      // the file URI that was resolved to
	TargetIndex *openapi.Index
	Value       interface{} // the resolved model element
}

// Resolve follows a $ref value from the given source document. For local refs
// (#/...) it uses the source document's index. For external refs
// (./file.yaml#/...) it resolves the file path relative to the source and
// then resolves the fragment within the target index.
func (r *CrossFileResolver) Resolve(fromURI, ref string) (*ResolveResult, error) {
	if ref == "" {
		return nil, fmt.Errorf("empty $ref")
	}

	if strings.HasPrefix(ref, "#") {
		idx, ok := r.docs[fromURI]
		if !ok {
			return nil, fmt.Errorf("source document %s not in project", fromURI)
		}
		val, err := idx.ResolveRef(ref)
		if err != nil {
			return nil, err
		}
		return &ResolveResult{TargetURI: fromURI, TargetIndex: idx, Value: val}, nil
	}

	parts := strings.SplitN(ref, "#", 2)
	filePart := parts[0]
	fragment := ""
	if len(parts) == 2 {
		fragment = "#" + parts[1]
	}

	targetURI := resolveRelativeURI(fromURI, filePart)
	if targetURI == "" {
		return nil, fmt.Errorf("cannot resolve file path %q relative to %s", filePart, fromURI)
	}

	idx, ok := r.docs[targetURI]
	if !ok {
		return nil, fmt.Errorf("referenced file %s not found in project (resolved from %s)", targetURI, ref)
	}

	if fragment == "" || fragment == "#" {
		return &ResolveResult{TargetURI: targetURI, TargetIndex: idx, Value: idx.Document}, nil
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
