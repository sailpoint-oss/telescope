package projection

import (
	"sync"

	"github.com/LukasParke/gossip/protocol"
)

// Tracker records the last-published set of URIs per workspace root so the
// projection layer can publish empty diagnostic arrays on URIs that dropped
// out between regenerations (zombie-squiggle fix documented in the plan).
type Tracker struct {
	mu        sync.Mutex
	published map[string]map[protocol.DocumentURI]struct{}
}

// NewTracker constructs an empty Tracker.
func NewTracker() *Tracker {
	return &Tracker{published: make(map[string]map[protocol.DocumentURI]struct{})}
}

// Update replaces the published-URI set for root with cur and returns the
// URIs that were in the previous set but are not in cur. Callers publish
// empty diagnostic arrays for those URIs.
func (t *Tracker) Update(root string, cur map[protocol.DocumentURI]struct{}) []protocol.DocumentURI {
	if t == nil {
		return nil
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	prev := t.published[root]
	t.published[root] = cur
	if prev == nil {
		return nil
	}
	var dropped []protocol.DocumentURI
	for uri := range prev {
		if _, stillPresent := cur[uri]; !stillPresent {
			dropped = append(dropped, uri)
		}
	}
	return dropped
}

// Reset clears tracked URIs for a root; used when a Loop is removed.
func (t *Tracker) Reset(root string) {
	if t == nil {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.published, root)
}
