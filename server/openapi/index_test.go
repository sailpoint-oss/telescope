package openapi

import (
	"sync"
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestNormalizeURI(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"plain file URI", "file:///home/user/file.yaml", "file:///home/user/file.yaml"},
		{"trailing dot segment", "file:///home/user/./file.yaml", "file:///home/user/file.yaml"},
		{"parent segment", "file:///home/user/sub/../file.yaml", "file:///home/user/file.yaml"},
		{"localhost host", "file://localhost/home/user/file.yaml", "file:///home/user/file.yaml"},
		{"query stripped", "file:///home/user/file.yaml?q=1", "file:///home/user/file.yaml"},
		{"fragment stripped", "file:///home/user/file.yaml#frag", "file:///home/user/file.yaml"},
		{"non-file URI unchanged", "https://example.com/api", "https://example.com/api"},
		{"garbage string passthrough", "not a uri at all", "not a uri at all"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NormalizeURI(tt.input)
			if got != tt.expected {
				t.Errorf("NormalizeURI(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestNormalizeURI_Consistent(t *testing.T) {
	// Two representations of the same path should normalize to the same key.
	a := NormalizeURI("file:///home/user/project/./spec.yaml")
	b := NormalizeURI("file:///home/user/project/spec.yaml")
	if a != b {
		t.Errorf("expected same result: %q vs %q", a, b)
	}
}

func TestIndexCache_SetBuilder_OnDemand(t *testing.T) {
	cache := NewIndexCache()
	uri := protocol.DocumentURI("file:///test.yaml")

	built := &Index{Document: &Document{Version: "3.1.0"}}
	builderCalled := false
	cache.SetBuilder(func(u protocol.DocumentURI) *Index {
		builderCalled = true
		if u != uri {
			t.Errorf("builder called with %q, want %q", u, uri)
		}
		return built
	})

	got := cache.Get(uri)
	if !builderCalled {
		t.Error("expected builder to be called")
	}
	if got != built {
		t.Error("expected Get to return builder result")
	}

	// Second call should return from cache, not builder.
	builderCalled = false
	got2 := cache.Get(uri)
	if builderCalled {
		t.Error("builder should not be called for cached index")
	}
	if got2 != built {
		t.Error("expected cached result")
	}
}

func TestIndexCache_Rebuild_RefreshesCachedEntry(t *testing.T) {
	cache := NewIndexCache()
	uri := protocol.DocumentURI("file:///test.yaml")

	stale := &Index{Document: &Document{Version: "3.0.0"}}
	fresh := &Index{Document: &Document{Version: "3.1.0"}}
	cache.Set(uri, stale)

	builderCalled := false
	cache.SetBuilder(func(u protocol.DocumentURI) *Index {
		builderCalled = true
		if u != uri {
			t.Errorf("builder called with %q, want %q", u, uri)
		}
		return fresh
	})

	got := cache.Rebuild(uri)
	if !builderCalled {
		t.Error("expected rebuild to call builder")
	}
	if got != fresh {
		t.Error("expected Rebuild to return fresh result")
	}
	if cache.Get(uri) != fresh {
		t.Error("expected Rebuild to replace cached entry")
	}
}

func TestIndexCache_Rebuild_PassesOriginalURIToBuilder(t *testing.T) {
	cache := NewIndexCache()
	// Use a URI with a query/fragment that NormalizeURI would strip.
	original := protocol.DocumentURI("file:///path/to/spec.yaml?v=2#section")
	norm := protocol.NormalizeURI(original)
	if original == norm {
		t.Skip("NormalizeURI did not change the URI; cannot test original vs norm")
	}

	fresh := &Index{Document: &Document{Version: "3.1.0"}}
	var receivedURI protocol.DocumentURI
	cache.SetBuilder(func(u protocol.DocumentURI) *Index {
		receivedURI = u
		return fresh
	})

	got := cache.Rebuild(original)
	if receivedURI != original {
		t.Errorf("builder received %q, want original URI %q", receivedURI, original)
	}
	if got != fresh {
		t.Error("expected Rebuild to return fresh result")
	}
	if cache.Get(norm) != fresh {
		t.Error("expected Rebuild to store under normalized key")
	}
}

func TestIndexCache_NormalizedKeys(t *testing.T) {
	cache := NewIndexCache()
	idx := &Index{Document: &Document{Version: "3.1.0"}}

	cache.Set("file:///home/user/./test.yaml", idx)

	// Lookup via the clean form should find it.
	got := cache.Get("file:///home/user/test.yaml")
	if got != idx {
		t.Error("expected normalized Get to find index stored with un-normalized key")
	}

	// Delete via a different but equivalent form.
	cache.Delete("file:///home/user/sub/../test.yaml")
	if cache.Get("file:///home/user/test.yaml") != nil {
		t.Error("expected Delete to remove index via normalized key")
	}
}

func TestIndexCache_ConcurrentAccess(t *testing.T) {
	cache := NewIndexCache()
	idx := &Index{Document: &Document{Version: "3.1.0"}}

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			uri := protocol.DocumentURI("file:///test.yaml")
			cache.Set(uri, idx)
			_ = cache.Get(uri)
			cache.Delete(uri)
		}(i)
	}
	wg.Wait()
}
