package lsp

import (
	"container/list"
	"sort"
	"sync"

	"github.com/LukasParke/gossip/protocol"
)

// SemanticTokenCacheCapacity is the default number of URIs retained. For
// typical editor sessions (one or two open OpenAPI files at a time), 8
// entries covers multi-file editing without noticeable memory overhead.
// Exposed as a variable rather than a const so test harnesses can shrink
// it to exercise eviction quickly.
var SemanticTokenCacheCapacity = 8

// semanticTokenCacheEntry holds the pre-sorted full token slice plus the
// pre-delta-encoded payload for the Full handler hot path. Both are built
// at most once per (uri, version).
type semanticTokenCacheEntry struct {
	version int32
	// tokens are sorted by (line, char, length, tokenType, modifiers) so the
	// Range handler can binary-search the first token at or after the
	// viewport start and stop on the first token past the viewport end.
	tokens []semanticToken
	// fullPayload is the delta-encoded Full handler response. Lazily
	// populated on the first Full hit; Range misses populate tokens only.
	fullPayload []uint32
}

// SemanticTokenCache is an LRU cache of semantic token slices keyed by
// document URI, versioned by the document's edit version so changes
// automatically invalidate a prior build. Safe for concurrent use by
// multiple LSP request handlers.
type SemanticTokenCache struct {
	mu       sync.Mutex
	capacity int
	entries  map[protocol.DocumentURI]*list.Element // element.Value = *cacheSlot
	order    *list.List                             // front = MRU
}

type cacheSlot struct {
	uri   protocol.DocumentURI
	entry *semanticTokenCacheEntry
}

// NewSemanticTokenCache returns a new cache. capacity<=0 means "use the
// package default".
func NewSemanticTokenCache(capacity int) *SemanticTokenCache {
	if capacity <= 0 {
		capacity = SemanticTokenCacheCapacity
	}
	return &SemanticTokenCache{
		capacity: capacity,
		entries:  make(map[protocol.DocumentURI]*list.Element, capacity),
		order:    list.New(),
	}
}

// Get returns the cached entry for (uri, version) if one is present and its
// version matches. A version mismatch is treated as a miss AND evicts the
// stale entry so subsequent Get calls don't keep paying the version check.
// Returns nil on miss.
func (c *SemanticTokenCache) Get(uri protocol.DocumentURI, version int32) *semanticTokenCacheEntry {
	c.mu.Lock()
	defer c.mu.Unlock()
	elem, ok := c.entries[uri]
	if !ok {
		return nil
	}
	slot := elem.Value.(*cacheSlot)
	if slot.entry.version != version {
		c.order.Remove(elem)
		delete(c.entries, uri)
		return nil
	}
	c.order.MoveToFront(elem)
	return slot.entry
}

// Put installs a new entry, evicting the oldest if needed. If a stale entry
// for the same URI exists (any version), it is replaced in place and moved
// to the MRU position.
func (c *SemanticTokenCache) Put(uri protocol.DocumentURI, entry *semanticTokenCacheEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if elem, ok := c.entries[uri]; ok {
		elem.Value.(*cacheSlot).entry = entry
		c.order.MoveToFront(elem)
		return
	}
	slot := &cacheSlot{uri: uri, entry: entry}
	elem := c.order.PushFront(slot)
	c.entries[uri] = elem
	for c.order.Len() > c.capacity {
		oldest := c.order.Back()
		if oldest == nil {
			return
		}
		oldSlot := oldest.Value.(*cacheSlot)
		c.order.Remove(oldest)
		delete(c.entries, oldSlot.uri)
	}
}

// Remove drops the entry for uri, if any. Called on didClose.
func (c *SemanticTokenCache) Remove(uri protocol.DocumentURI) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if elem, ok := c.entries[uri]; ok {
		c.order.Remove(elem)
		delete(c.entries, uri)
	}
}

// Len returns the number of entries currently in the cache (test helper).
func (c *SemanticTokenCache) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.order.Len()
}

// sliceTokensForRange returns the sub-slice of entry.tokens whose line is
// within [rStart, rEnd]. Uses sort.Search for O(log N) entry, which is the
// whole point of caching a sorted slice.
func sliceTokensForRange(tokens []semanticToken, rStart, rEnd uint32) []semanticToken {
	if len(tokens) == 0 {
		return nil
	}
	start := sort.Search(len(tokens), func(i int) bool {
		return tokens[i].line >= rStart
	})
	if start >= len(tokens) {
		return nil
	}
	end := sort.Search(len(tokens), func(i int) bool {
		return tokens[i].line > rEnd
	})
	if end <= start {
		return nil
	}
	return tokens[start:end]
}
