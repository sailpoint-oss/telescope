package generation

import (
	"sync"
	"time"

	"github.com/sailpoint-oss/cartographer/sourcemap"
)

// Result is the last-good extraction result served to consumers via
// Loop.Current. It survives transient extraction failures so subsequent lint
// runs can keep working off the previous known-good spec.
type Result struct {
	Root        string
	SpecBytes   []byte
	SpecMap     map[string]interface{}
	SourceMap   *sourcemap.SourceMap
	OutputPath  string
	GeneratedAt time.Time
	Duration    time.Duration
	Operations  int
	Types       int
}

// cache holds the last successful result per workspace root.
type cache struct {
	mu      sync.RWMutex
	entries map[string]*Result
}

func newCache() *cache {
	return &cache{entries: make(map[string]*Result)}
}

func (c *cache) store(r *Result) {
	if r == nil || r.Root == "" {
		return
	}
	c.mu.Lock()
	c.entries[r.Root] = r
	c.mu.Unlock()
}

func (c *cache) get(root string) (*Result, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	r, ok := c.entries[root]
	return r, ok
}
