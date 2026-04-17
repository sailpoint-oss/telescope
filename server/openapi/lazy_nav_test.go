package openapi_test

import (
	"sync"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// TestNavIndex_LazyInitPopulatesFields exercises the deferred
// navigator.ParseContent path: BuildIndex on an OpenAPI document does NOT
// parse navigator eagerly, so the first call to NavigatorIndex() must
// trigger the sync.Once body and populate idx.Kind/idx.Version/idx.nav
// under the RWMutex. Covers the main race-fix path we added on PR #14.
func TestNavIndex_LazyInitPopulatesFields(t *testing.T) {
	mgr, store := setupManager(t)
	const content = `openapi: "3.1.0"
info:
  title: lazy-nav
  version: "1.0"
paths:
  /x:
    get:
      responses:
        "200":
          description: ok
`
	uri := protocol.DocumentURI("file:///lazy-nav.yaml")
	openYAML(t, store, uri, content)
	tree := mgr.GetTree(uri)
	doc := store.Get(uri)

	idx := openapi.BuildIndex(tree, doc)
	if idx == nil {
		t.Fatal("BuildIndex returned nil")
	}
	// Kind was set eagerly by BuildIndex for OpenAPI docs via the DocType
	// fallback, but the navigator index itself is lazy — exercise it.
	if nav := idx.NavigatorIndex(); nav == nil {
		t.Fatal("NavigatorIndex() returned nil after BuildIndex; lazy init path is broken")
	}
	// Second call returns the same navigator index from the Once cache.
	if nav2 := idx.NavigatorIndex(); nav2 == nil {
		t.Fatal("second NavigatorIndex() returned nil")
	}
}

// TestNavIndex_ConcurrentReadersAfterLazyInit runs several goroutines
// calling DocumentKind() / NavigatorIndex() / IsOpenAPI() while lazy nav
// initialization is in flight. The race detector is the arbiter; the
// assertions just keep the workers honest.
func TestNavIndex_ConcurrentReadersAfterLazyInit(t *testing.T) {
	mgr, store := setupManager(t)
	const content = `openapi: "3.0.3"
info:
  title: concurrent
  version: "1.0"
paths: {}
`
	uri := protocol.DocumentURI("file:///concurrent.yaml")
	openYAML(t, store, uri, content)
	tree := mgr.GetTree(uri)
	doc := store.Get(uri)

	idx := openapi.BuildIndex(tree, doc)
	if idx == nil {
		t.Fatal("BuildIndex returned nil")
	}

	const workers = 32
	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			_ = idx.DocumentKind()
			_ = idx.NavigatorIndex()
			_ = idx.IsOpenAPI()
			_ = idx.PrimaryValue()
		}()
	}
	wg.Wait()

	if !idx.IsOpenAPI() {
		t.Fatal("final IsOpenAPI() == false on a parsed OpenAPI 3.0.3 doc")
	}
}

// TestDocumentKind_HandConstructedIndex covers the navMu-nil branch: an
// Index built without BuildIndex has no RWMutex, and DocumentKind must
// fall through the nil check without deadlocking.
func TestDocumentKind_HandConstructedIndex(t *testing.T) {
	// No BuildIndex -> no navMu. DocumentKind must still return Unknown
	// without crashing.
	var idx openapi.Index
	if got := idx.DocumentKind(); got != openapi.DocumentKindUnknown {
		t.Fatalf("hand-constructed Index DocumentKind() = %v, want DocumentKindUnknown", got)
	}
	if got := idx.NavigatorIndex(); got != nil {
		t.Fatalf("hand-constructed Index NavigatorIndex() = %v, want nil", got)
	}
}

// TestIsMalformed_LazyInitSnapshot covers IsMalformed against a
// freshly-built, never-accessed Index. This drives the navigator parse
// through the malformed-check path, which is the caller the broken-YAML
// integration test relies on in production.
func TestIsMalformed_LazyInitSnapshot(t *testing.T) {
	mgr, store := setupManager(t)
	const content = `openapi: "3.0.0"
info:
  title: malformed-lazy
  version: "1.0"
paths: {}
`
	uri := protocol.DocumentURI("file:///malformed-lazy.yaml")
	openYAML(t, store, uri, content)
	tree := mgr.GetTree(uri)
	doc := store.Get(uri)
	idx := openapi.BuildIndex(tree, doc)
	if idx == nil {
		t.Fatal("BuildIndex returned nil")
	}
	// First IsMalformed call triggers navIndex() lazy init; the result
	// should be false for a clean document.
	if idx.IsMalformed() {
		t.Fatal("clean OpenAPI 3.0 document reported malformed")
	}
	// Second call reuses the cached navigator index.
	if idx.IsMalformed() {
		t.Fatal("clean OpenAPI 3.0 document reported malformed on second call")
	}
}

// TestNavIndex_NilAndBareReceivers covers the short-circuit branches in
// navIndex() and the sibling accessors: a nil *Index should return nil,
// and a hand-constructed Index without navOnce should fall back to the
// raw nav field.
func TestNavIndex_NilAndBareReceivers(t *testing.T) {
	var nilIdx *openapi.Index
	if nilIdx.NavigatorIndex() != nil {
		t.Fatal("nil Index NavigatorIndex() must return nil")
	}
	if nilIdx.IsMalformed() {
		t.Fatal("nil Index IsMalformed() must return false")
	}
	if kind := nilIdx.DocumentKind(); kind != openapi.DocumentKindUnknown {
		t.Fatalf("nil Index DocumentKind() = %v, want Unknown", kind)
	}
	// A bare Index{} has navOnce == nil so NavigatorIndex falls through to
	// the idx.nav field directly without tripping the Once.
	bare := &openapi.Index{}
	if got := bare.NavigatorIndex(); got != nil {
		t.Fatalf("bare Index NavigatorIndex() = %v, want nil", got)
	}
}

// TestResolveRef_LazyInitNavigatorResolver confirms the navigator-backed
// ResolveRef path triggers the lazy Once and returns a stable snapshot
// under navMu.
func TestResolveRef_LazyInitNavigatorResolver(t *testing.T) {
	mgr, store := setupManager(t)
	const content = `openapi: "3.0.3"
info:
  title: resolve-lazy
  version: "1.0"
paths: {}
components:
  schemas:
    Widget:
      type: object
      properties:
        name:
          type: string
`
	uri := protocol.DocumentURI("file:///resolve-lazy.yaml")
	openYAML(t, store, uri, content)
	tree := mgr.GetTree(uri)
	doc := store.Get(uri)
	idx := openapi.BuildIndex(tree, doc)
	if idx == nil {
		t.Fatal("BuildIndex returned nil")
	}
	got, err := idx.ResolveRef("#/components/schemas/Widget")
	if err != nil {
		t.Fatalf("ResolveRef: %v", err)
	}
	if got == nil {
		t.Fatal("ResolveRef returned nil value")
	}
}
