package openapi

import (
	"sort"
	"sync"
)

// SortedRefEntry is an ordered snapshot of a $ref usage for range-scoped walks.
// Index is the position inside idx.AllRefs; keeping it as an index (rather than
// a pointer) avoids aliasing concerns if AllRefs is ever reallocated and keeps
// the snapshot copyable.
type SortedRefEntry struct {
	Line  uint32
	Char  uint32
	Index int
}

// SortedPathEntry is an ordered snapshot of a path template location. Item
// points into the underlying Document.Paths map, which is immutable once
// BuildIndex returns, so sharing pointers is safe.
type SortedPathEntry struct {
	Line uint32
	Char uint32
	Path string
	Item *PathItem
}

// ComponentKind identifies which Components.* bucket a SortedComponentEntry
// came from so the semantic-tokens emitter can dispatch without re-reading
// the underlying map.
type ComponentKind int

const (
	ComponentKindSchema ComponentKind = iota
	ComponentKindSecurityScheme
)

// SortedComponentEntry is an ordered snapshot of a Components.* declaration
// location. Exactly one of Schema or SecurityScheme is non-nil, determined by
// Kind.
type SortedComponentEntry struct {
	Line           uint32
	Char           uint32
	Kind           ComponentKind
	Name           string
	Schema         *Schema
	SecurityScheme *SecurityScheme
}

// sortedViews is the lazy container for per-Index sorted slices. It lives on
// the heap (reached from Index.sorted via pointer) so that copies of Index
// share the same once-computed views and the sort cost is paid at most once
// per Index identity. sync.Once inside the container guarantees initialization
// runs exactly once even under contention.
type sortedViews struct {
	once sync.Once

	refs       []SortedRefEntry
	paths      []SortedPathEntry
	components []SortedComponentEntry
}

// sortedMu serializes the one-time allocation of Index.sorted. It's held only
// for the check-and-set window; the actual build cost is amortized by
// sortedViews.once inside the container.
var sortedMu sync.Mutex

// SortedRefs returns AllRefs ordered by (Loc.Range.Start.Line, Start.Character).
// Lazy: the sort happens on first call. Subsequent calls return the same
// backing slice; callers must not mutate it.
func (idx *Index) SortedRefs() []SortedRefEntry {
	v := idx.sortedViewsLazy()
	if v == nil {
		return nil
	}
	return v.refs
}

// SortedPaths returns Document.Paths ordered by the path item's key location.
// Paths without a resolved PathLoc are skipped (they have no sensible sort
// position). Callers must not mutate the returned slice.
func (idx *Index) SortedPaths() []SortedPathEntry {
	v := idx.sortedViewsLazy()
	if v == nil {
		return nil
	}
	return v.paths
}

// SortedComponents returns Document.Components.{Schemas,SecuritySchemes}
// ordered by NameLoc start position. Entries without a valid NameLoc are
// skipped. Callers must not mutate the returned slice.
func (idx *Index) SortedComponents() []SortedComponentEntry {
	v := idx.sortedViewsLazy()
	if v == nil {
		return nil
	}
	return v.components
}

// sortedViewsLazy returns the Index's lazy view container, creating and
// populating it on first access. Returns nil when called on a nil Index.
func (idx *Index) sortedViewsLazy() *sortedViews {
	if idx == nil {
		return nil
	}
	v := idx.sorted
	if v == nil {
		// Allocate-and-install under a package mutex so two goroutines racing
		// on the bare field can't both end up with different *sortedViews.
		// This lock is held only for the pointer swap, not the build itself.
		sortedMu.Lock()
		if idx.sorted == nil {
			idx.sorted = &sortedViews{}
		}
		v = idx.sorted
		sortedMu.Unlock()
	}
	v.once.Do(func() { v.build(idx) })
	return v
}

func (v *sortedViews) build(idx *Index) {
	v.refs = buildSortedRefs(idx.AllRefs)
	if idx.Document != nil {
		v.paths = buildSortedPaths(idx.Document.Paths)
		if idx.Document.Components != nil {
			v.components = buildSortedComponents(
				idx.Document.Components.Schemas,
				idx.Document.Components.SecuritySchemes,
			)
		}
	}
}

func buildSortedRefs(all []RefUsage) []SortedRefEntry {
	if len(all) == 0 {
		return nil
	}
	out := make([]SortedRefEntry, 0, len(all))
	for i := range all {
		pos := all[i].Loc.Range.Start
		if pos.Line == 0 && pos.Character == 0 {
			// A freshly-constructed Loc with a zero range is typical for
			// refs that the parser couldn't locate in-source (e.g. standalone
			// fragments). Skip them — they have no viewport interpretation.
			if isZeroRangeLocal(all[i].Loc) {
				continue
			}
		}
		out = append(out, SortedRefEntry{
			Line:  pos.Line,
			Char:  pos.Character,
			Index: i,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Line != out[j].Line {
			return out[i].Line < out[j].Line
		}
		return out[i].Char < out[j].Char
	})
	return out
}

func buildSortedPaths(paths map[string]*PathItem) []SortedPathEntry {
	if len(paths) == 0 {
		return nil
	}
	out := make([]SortedPathEntry, 0, len(paths))
	for p, item := range paths {
		if item == nil {
			continue
		}
		if isZeroRangeLocal(item.PathLoc) {
			continue
		}
		pos := item.PathLoc.Range.Start
		out = append(out, SortedPathEntry{
			Line: pos.Line,
			Char: pos.Character,
			Path: p,
			Item: item,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Line != out[j].Line {
			return out[i].Line < out[j].Line
		}
		return out[i].Char < out[j].Char
	})
	return out
}

func buildSortedComponents(
	schemas map[string]*Schema,
	secSchemes map[string]*SecurityScheme,
) []SortedComponentEntry {
	if len(schemas) == 0 && len(secSchemes) == 0 {
		return nil
	}
	out := make([]SortedComponentEntry, 0, len(schemas)+len(secSchemes))
	for name, s := range schemas {
		if s == nil {
			continue
		}
		if isZeroRangeLocal(s.NameLoc) {
			continue
		}
		pos := s.NameLoc.Range.Start
		out = append(out, SortedComponentEntry{
			Line:   pos.Line,
			Char:   pos.Character,
			Kind:   ComponentKindSchema,
			Name:   name,
			Schema: s,
		})
	}
	for name, ss := range secSchemes {
		if ss == nil {
			continue
		}
		loc := ss.NameLoc
		if isZeroRangeLocal(loc) {
			loc = ss.Loc
		}
		if isZeroRangeLocal(loc) {
			continue
		}
		pos := loc.Range.Start
		out = append(out, SortedComponentEntry{
			Line:           pos.Line,
			Char:           pos.Character,
			Kind:           ComponentKindSecurityScheme,
			Name:           name,
			SecurityScheme: ss,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Line != out[j].Line {
			return out[i].Line < out[j].Line
		}
		return out[i].Char < out[j].Char
	})
	return out
}

// FirstIndexAtOrAfter returns the index of the first sorted entry whose start
// line is >= line, or len(entries) if none qualifies. Used by semantic-tokens
// range walks to skip past everything above the viewport in O(log N).
func FirstRefAtOrAfter(entries []SortedRefEntry, line uint32) int {
	return sort.Search(len(entries), func(i int) bool {
		return entries[i].Line >= line
	})
}

func FirstPathAtOrAfter(entries []SortedPathEntry, line uint32) int {
	return sort.Search(len(entries), func(i int) bool {
		return entries[i].Line >= line
	})
}

func FirstComponentAtOrAfter(entries []SortedComponentEntry, line uint32) int {
	return sort.Search(len(entries), func(i int) bool {
		return entries[i].Line >= line
	})
}

// isZeroRangeLocal is a private mirror of the package-private isZeroRange
// helper used in semantic tokens. We keep a local copy so sorted.go doesn't
// need to depend on the LSP package.
func isZeroRangeLocal(loc Loc) bool {
	r := loc.Range
	return r.Start.Line == 0 && r.Start.Character == 0 && r.End.Line == 0 && r.End.Character == 0
}
