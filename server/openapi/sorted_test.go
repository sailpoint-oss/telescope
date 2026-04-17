package openapi

import (
	"sync"
	"sync/atomic"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	navigator "github.com/sailpoint-oss/navigator"
)

func makeRef(line, char uint32) RefUsage {
	return RefUsage{
		Loc: Loc{Range: navigator.Range{
			Start: navigator.Position{Line: line, Character: char},
			End:   navigator.Position{Line: line, Character: char + 1},
		}},
	}
}

func TestSortedRefs_OrdersByLineThenChar(t *testing.T) {
	idx := &Index{
		AllRefs: []RefUsage{
			makeRef(10, 4),
			makeRef(2, 0),
			makeRef(10, 2),
			makeRef(5, 0),
		},
	}
	sorted := idx.SortedRefs()
	if len(sorted) != 4 {
		t.Fatalf("len(sorted) = %d, want 4", len(sorted))
	}
	wantOrder := []struct {
		line, char uint32
	}{
		{2, 0}, {5, 0}, {10, 2}, {10, 4},
	}
	for i, w := range wantOrder {
		if sorted[i].Line != w.line || sorted[i].Char != w.char {
			t.Fatalf("sorted[%d] = {%d, %d}, want {%d, %d}", i, sorted[i].Line, sorted[i].Char, w.line, w.char)
		}
	}
}

func TestSortedRefs_SkipsZeroRange(t *testing.T) {
	idx := &Index{
		AllRefs: []RefUsage{
			{}, // zero-range, should be dropped
			makeRef(3, 0),
		},
	}
	sorted := idx.SortedRefs()
	if len(sorted) != 1 {
		t.Fatalf("zero-range ref should be skipped; got %+v", sorted)
	}
	if sorted[0].Line != 3 {
		t.Fatalf("surviving entry should be line 3, got %d", sorted[0].Line)
	}
}

func TestSortedRefs_EmptyIndex(t *testing.T) {
	idx := &Index{}
	if got := idx.SortedRefs(); got != nil {
		t.Fatalf("empty index should return nil, got %+v", got)
	}
}

// TestSortedViewsLazy_SingleBuildUnderConcurrency confirms that 64 goroutines
// racing to call SortedRefs only ever see one allocation of the views
// container, and that the build function runs exactly once (sync.Once inside
// the container plus a lock-free CAS install on Index.sorted).
func TestSortedViewsLazy_SingleBuildUnderConcurrency(t *testing.T) {
	// Pre-initialize idx.sorted to emulate BuildIndex output; hand-
	// constructed indexes with a nil idx.sorted intentionally fall back to
	// an uncached per-call build, which is correct but not the path we
	// want to exercise here.
	idx := &Index{
		AllRefs: []RefUsage{makeRef(1, 0), makeRef(2, 0)},
		sorted:  &atomic.Pointer[sortedViews]{},
	}

	var wg sync.WaitGroup
	const workers = 64
	results := make([]*sortedViews, workers)
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func(i int) {
			defer wg.Done()
			_ = idx.SortedRefs()
			results[i] = idx.sorted.Load()
		}(i)
	}
	wg.Wait()
	first := results[0]
	if first == nil {
		t.Fatal("expected sortedViews to be populated")
	}
	for i := 1; i < workers; i++ {
		if results[i] != first {
			t.Fatalf("workers observed different sortedViews pointers: result[0]=%p result[%d]=%p", first, i, results[i])
		}
	}
}

func TestSortedPaths_OrderedAndSkipsZeroLoc(t *testing.T) {
	idx := &Index{
		Document: &Document{
			Paths: map[string]*PathItem{
				"/b": {PathLoc: Loc{Range: navigator.Range{Start: navigator.Position{Line: 5, Character: 0}, End: navigator.Position{Line: 5, Character: 3}}}},
				"/a": {PathLoc: Loc{Range: navigator.Range{Start: navigator.Position{Line: 2, Character: 0}, End: navigator.Position{Line: 2, Character: 3}}}},
				"/z": {}, // zero-range, should be skipped
			},
		},
	}
	sorted := idx.SortedPaths()
	if len(sorted) != 2 {
		t.Fatalf("expected 2 paths (zero-range skipped), got %d", len(sorted))
	}
	if sorted[0].Path != "/a" || sorted[1].Path != "/b" {
		t.Fatalf("unexpected path order: %+v", sorted)
	}
}

func TestSortedComponents_MixesSchemasAndSecuritySchemes(t *testing.T) {
	schemaLoc := func(line, char uint32) Loc {
		return Loc{Range: navigator.Range{
			Start: navigator.Position{Line: line, Character: char},
			End:   navigator.Position{Line: line, Character: char + 3},
		}}
	}
	// Navigator types are aliases, so we build them from scratch here.
	schemas := map[string]*Schema{
		"Alpha": {NameLoc: schemaLoc(10, 2)},
		"Beta":  {NameLoc: schemaLoc(3, 2)},
	}
	secSchemes := map[string]*navigator.SecurityScheme{
		"BearerAuth": {NameLoc: schemaLoc(7, 2)},
	}
	idx := &Index{Document: &Document{Components: &Components{Schemas: schemas, SecuritySchemes: secSchemes}}}

	sorted := idx.SortedComponents()
	if len(sorted) != 3 {
		t.Fatalf("expected 3 components, got %d: %+v", len(sorted), sorted)
	}
	expectOrder := []string{"Beta", "BearerAuth", "Alpha"}
	for i, name := range expectOrder {
		if sorted[i].Name != name {
			t.Fatalf("sorted[%d].Name = %q, want %q", i, sorted[i].Name, name)
		}
	}
	// Kind dispatch: Alpha+Beta are schemas, BearerAuth is a security scheme.
	if sorted[0].Kind != ComponentKindSchema || sorted[1].Kind != ComponentKindSecurityScheme || sorted[2].Kind != ComponentKindSchema {
		t.Fatalf("unexpected kind dispatch: %+v", sorted)
	}
}

func TestFirstRefAtOrAfter(t *testing.T) {
	entries := []SortedRefEntry{
		{Line: 10}, {Line: 20}, {Line: 30}, {Line: 40},
	}
	if got := FirstRefAtOrAfter(entries, 5); got != 0 {
		t.Fatalf("line 5: got %d, want 0", got)
	}
	if got := FirstRefAtOrAfter(entries, 20); got != 1 {
		t.Fatalf("line 20: got %d, want 1", got)
	}
	if got := FirstRefAtOrAfter(entries, 25); got != 2 {
		t.Fatalf("line 25: got %d, want 2", got)
	}
	if got := FirstRefAtOrAfter(entries, 41); got != len(entries) {
		t.Fatalf("line past end: got %d, want %d", got, len(entries))
	}
}

// TestPositionProtocolCompat ensures navigator.Position and protocol.Position
// still line up at the field level. Prevents silent drift when navigator
// bumps a field name and this package keeps compiling but returns garbage.
func TestPositionProtocolCompat(t *testing.T) {
	p := navigator.Position{Line: 1, Character: 2}
	pp := protocol.Position{Line: p.Line, Character: p.Character}
	if pp.Line != 1 || pp.Character != 2 {
		t.Fatal("protocol.Position field names drifted")
	}
}
