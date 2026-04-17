package lsp

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

// TestRangeHandler_FullRangeEqualsFullHandler asserts that a Range request
// covering [0, last-line] returns the same set of tokens (same delta stream)
// as the Full handler. Regression guard: if the sorted + cache path ever
// starts emitting a different subset, full-doc highlighting breaks.
func TestRangeHandler_FullRangeEqualsFullHandler(t *testing.T) {
	env := newCoverageEnv(t)
	full := NewSemanticTokensHandler(env.cache, nil, nil)
	rng := NewSemanticTokensRangeHandler(env.cache, nil, nil)

	fullTokens, err := full(env.ctx, &protocol.SemanticTokensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("full: %v", err)
	}
	rangeTokens, err := rng(env.ctx, &protocol.SemanticTokensRangeParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 1_000_000, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("range: %v", err)
	}
	if !uint32SlicesEqual(fullTokens.Data, rangeTokens.Data) {
		t.Fatalf("full and range payloads differ\n full=%v\n rng=%v", fullTokens.Data, rangeTokens.Data)
	}
}

// TestRangeHandler_EmptyRangeReturnsEmpty confirms a viewport entirely past
// the end of the document produces an empty token stream.
func TestRangeHandler_EmptyRangeReturnsEmpty(t *testing.T) {
	env := newCoverageEnv(t)
	rng := NewSemanticTokensRangeHandler(env.cache, nil, nil)
	out, err := rng(env.ctx, &protocol.SemanticTokensRangeParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 10_000, Character: 0},
			End:   protocol.Position{Line: 10_100, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("range: %v", err)
	}
	if len(out.Data) != 0 {
		t.Fatalf("expected empty payload, got %v", out.Data)
	}
}

// TestRangeHandler_CacheHitReusesBuild confirms that a second Range call for
// the same document version does NOT allocate a fresh sorted token slice;
// the LRU entry is reused. We assert this by pointer-identity on the
// cache-entry tokens slice (safe because Put stores the slice as-is).
func TestRangeHandler_CacheHitReusesBuild(t *testing.T) {
	env := newCoverageEnv(t)
	cache := NewSemanticTokenCache(2)
	rng := NewSemanticTokensRangeHandler(env.cache, nil, cache)

	params := &protocol.SemanticTokensRangeParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 100, Character: 0},
		},
	}
	if _, err := rng(env.ctx, params); err != nil {
		t.Fatalf("first range: %v", err)
	}
	entry1 := cache.Get(env.uri, 1)
	if entry1 == nil {
		t.Fatal("cache miss after first range request")
	}
	firstBackingPtr := &entry1.tokens[0]

	// Second call on same version must reuse the cached slice verbatim.
	if _, err := rng(env.ctx, params); err != nil {
		t.Fatalf("second range: %v", err)
	}
	entry2 := cache.Get(env.uri, 1)
	if entry2 == nil {
		t.Fatal("cache miss after second range request")
	}
	secondBackingPtr := &entry2.tokens[0]
	if firstBackingPtr != secondBackingPtr {
		t.Fatal("second range request should reuse cached slice, not rebuild")
	}
}

// TestRangeHandler_CacheInvalidatesOnVersionBump makes sure that when the
// edit version of the document changes, the cache does NOT serve stale
// tokens. Invalidation happens inside SemanticTokenCache.Get on a version
// mismatch; this test simulates a didChange by bumping the store version.
func TestRangeHandler_CacheInvalidatesOnVersionBump(t *testing.T) {
	env := newCoverageEnv(t)
	cache := NewSemanticTokenCache(2)
	rng := NewSemanticTokensRangeHandler(env.cache, nil, cache)

	params := &protocol.SemanticTokensRangeParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 100, Character: 0},
		},
	}
	if _, err := rng(env.ctx, params); err != nil {
		t.Fatalf("first: %v", err)
	}
	if cache.Len() != 1 {
		t.Fatalf("expected cache entry after first call; Len=%d", cache.Len())
	}

	// Simulate didChange: bump version and rebuild the index in the cache.
	env.store.Change(&protocol.DidChangeTextDocumentParams{
		TextDocument: protocol.VersionedTextDocumentIdentifier{
			TextDocumentIdentifier: protocol.TextDocumentIdentifier{URI: env.uri},
			Version:                2,
		},
		ContentChanges: []protocol.TextDocumentContentChangeEvent{{Text: coverageSpec + "\n"}},
	})

	if _, err := rng(env.ctx, params); err != nil {
		t.Fatalf("second: %v", err)
	}
	// Version-mismatch miss evicts the stale entry then installs a fresh
	// one; net Len stays at 1 but the entry version changes.
	entry := cache.Get(env.uri, 2)
	if entry == nil {
		t.Fatal("cache should hold a v2 entry after the bump")
	}
	if entry.version != 2 {
		t.Fatalf("cache entry version = %d, want 2", entry.version)
	}
}

// TestRangeHandler_NilCacheStillWorks confirms the nil-cache wiring the
// tests and the handler-factory default exercises still produces correct
// output; the production path is always cache-enabled, but handler
// construction must not depend on a cache to be correct.
func TestRangeHandler_NilCacheStillWorks(t *testing.T) {
	env := newCoverageEnv(t)
	rng := NewSemanticTokensRangeHandler(env.cache, nil, nil)
	out, err := rng(env.ctx, &protocol.SemanticTokensRangeParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 100, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("range with nil cache: %v", err)
	}
	if out == nil {
		t.Fatal("expected non-nil result with nil cache")
	}
}

func uint32SlicesEqual(a, b []uint32) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
