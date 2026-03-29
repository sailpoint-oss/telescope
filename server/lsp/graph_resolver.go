package lsp

import (
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// GraphResolver adapts the graph-backed workspace model to the resolver
// interface expected by Barrelman analyzers and legacy call sites.
type GraphResolver struct {
	bridge *GraphBridge
	cache  *openapi.IndexCache
}

var _ rules.CrossRefResolver = (*GraphResolver)(nil)

// NewGraphResolver returns a resolver backed by GraphBridge edges plus the
// graph-projected openapi.Index cache.
func NewGraphResolver(bridge *GraphBridge, cache *openapi.IndexCache) *GraphResolver {
	return &GraphResolver{
		bridge: bridge,
		cache:  cache,
	}
}

// CanResolve reports whether the given ref can be resolved from the source URI.
func (r *GraphResolver) CanResolve(fromURI, ref string) bool {
	if r == nil || r.bridge == nil || r.cache == nil {
		return false
	}
	_, _, err := r.bridge.ResolveRef(r.cache, fromURI, ref)
	return err == nil
}

// Resolve returns the resolved target URI and value for callers that need more
// than the boolean CrossRefResolver interface exposes.
func (r *GraphResolver) Resolve(fromURI, ref string) (protocol.DocumentURI, interface{}, error) {
	if r == nil || r.bridge == nil || r.cache == nil {
		return "", nil, nil
	}
	return r.bridge.ResolveRef(r.cache, fromURI, ref)
}
