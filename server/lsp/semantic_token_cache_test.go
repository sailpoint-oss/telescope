package lsp

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func makeEntry(version int32, tokens []semanticToken) *semanticTokenCacheEntry {
	return &semanticTokenCacheEntry{version: version, tokens: tokens}
}

func TestSemanticTokenCache_GetHitAndMiss(t *testing.T) {
	c := NewSemanticTokenCache(4)
	uri := protocol.DocumentURI("file:///a.yaml")
	if c.Get(uri, 1) != nil {
		t.Fatal("empty cache should miss")
	}
	c.Put(uri, makeEntry(1, []semanticToken{{line: 1}}))
	if got := c.Get(uri, 1); got == nil || got.version != 1 {
		t.Fatalf("expected hit for version 1, got %+v", got)
	}
}

func TestSemanticTokenCache_VersionMismatchEvicts(t *testing.T) {
	c := NewSemanticTokenCache(4)
	uri := protocol.DocumentURI("file:///b.yaml")
	c.Put(uri, makeEntry(3, nil))
	if got := c.Get(uri, 4); got != nil {
		t.Fatalf("version mismatch should miss; got %+v", got)
	}
	// Entry should also be evicted so a follow-up Get with the old version
	// doesn't accidentally succeed.
	if c.Len() != 0 {
		t.Fatalf("version-mismatch entry should be evicted; Len()=%d", c.Len())
	}
}

func TestSemanticTokenCache_PutReplacesExistingURI(t *testing.T) {
	c := NewSemanticTokenCache(4)
	uri := protocol.DocumentURI("file:///c.yaml")
	c.Put(uri, makeEntry(1, nil))
	c.Put(uri, makeEntry(2, nil))
	if got := c.Get(uri, 2); got == nil {
		t.Fatal("expected hit on newest version")
	}
	if got := c.Get(uri, 1); got != nil {
		t.Fatal("old version should no longer be reachable")
	}
	if c.Len() != 0 {
		t.Fatalf("after version-mismatch miss, cache should be empty; Len()=%d", c.Len())
	}
}

func TestSemanticTokenCache_LRUEviction(t *testing.T) {
	c := NewSemanticTokenCache(2)
	a := protocol.DocumentURI("file:///a.yaml")
	b := protocol.DocumentURI("file:///b.yaml")
	d := protocol.DocumentURI("file:///d.yaml")

	c.Put(a, makeEntry(1, nil))
	c.Put(b, makeEntry(1, nil))
	// Touch A to make it MRU, then inserting D must evict B.
	if c.Get(a, 1) == nil {
		t.Fatal("a should be present")
	}
	c.Put(d, makeEntry(1, nil))
	if c.Get(b, 1) != nil {
		t.Fatal("b should have been evicted as the oldest entry")
	}
	if c.Get(a, 1) == nil {
		t.Fatal("a should still be present")
	}
	if c.Get(d, 1) == nil {
		t.Fatal("d should be present")
	}
	if c.Len() != 2 {
		t.Fatalf("cache size should stay at 2; Len()=%d", c.Len())
	}
}

func TestSemanticTokenCache_Remove(t *testing.T) {
	c := NewSemanticTokenCache(4)
	uri := protocol.DocumentURI("file:///x.yaml")
	c.Put(uri, makeEntry(1, nil))
	c.Remove(uri)
	if c.Get(uri, 1) != nil {
		t.Fatal("Remove should evict")
	}
	// Remove on empty is a no-op.
	c.Remove(uri)
}

func TestSemanticTokenCache_DefaultCapacity(t *testing.T) {
	c := NewSemanticTokenCache(0)
	if c.capacity != SemanticTokenCacheCapacity {
		t.Fatalf("capacity fell back to %d, want %d", c.capacity, SemanticTokenCacheCapacity)
	}
}

func TestSliceTokensForRange(t *testing.T) {
	tokens := []semanticToken{
		{line: 1}, {line: 5}, {line: 10}, {line: 15}, {line: 20},
	}
	// Cases:
	cases := []struct {
		start, end uint32
		wantLines  []uint32
	}{
		{0, 3, []uint32{1}},
		{5, 10, []uint32{5, 10}},
		{11, 14, nil},
		{6, 9, nil},
		{15, 100, []uint32{15, 20}},
		{0, 100, []uint32{1, 5, 10, 15, 20}},
		{100, 200, nil},
	}
	for _, tc := range cases {
		got := sliceTokensForRange(tokens, tc.start, tc.end)
		if len(got) != len(tc.wantLines) {
			t.Fatalf("[%d..%d]: got %d tokens, want %d (%v)", tc.start, tc.end, len(got), len(tc.wantLines), tc.wantLines)
		}
		for i, want := range tc.wantLines {
			if got[i].line != want {
				t.Fatalf("[%d..%d][%d].line = %d, want %d", tc.start, tc.end, i, got[i].line, want)
			}
		}
	}
}

func TestSliceTokensForRange_Empty(t *testing.T) {
	if got := sliceTokensForRange(nil, 0, 100); got != nil {
		t.Fatalf("nil tokens should return nil, got %+v", got)
	}
}
