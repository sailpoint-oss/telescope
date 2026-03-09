package parser

import ctypes "github.com/sailpoint-oss/telescope/server/core/types"

type PointerIndex struct {
	entries map[string]ctypes.Range
}

func NewPointerIndex() *PointerIndex {
	return &PointerIndex{
		entries: make(map[string]ctypes.Range),
	}
}

func (p *PointerIndex) Set(pointer string, r ctypes.Range) {
	if p.entries == nil {
		p.entries = make(map[string]ctypes.Range)
	}
	p.entries[pointer] = r
}

func (p *PointerIndex) Get(pointer string) (ctypes.Range, bool) {
	if p == nil || p.entries == nil {
		return ctypes.Range{}, false
	}
	r, ok := p.entries[pointer]
	return r, ok
}

func (p *PointerIndex) All() map[string]ctypes.Range {
	if p == nil || p.entries == nil {
		return nil
	}
	out := make(map[string]ctypes.Range, len(p.entries))
	for k, v := range p.entries {
		out[k] = v
	}
	return out
}

// BuildPointerIndex walks a SemanticNode tree and builds a PointerIndex.
func BuildPointerIndex(root *SemanticNode) *PointerIndex {
	idx := NewPointerIndex()
	if root == nil {
		return idx
	}
	root.Walk(func(pointer string, node *SemanticNode) {
		if node != nil {
			idx.Set(pointer, node.Range)
		}
	})
	return idx
}
