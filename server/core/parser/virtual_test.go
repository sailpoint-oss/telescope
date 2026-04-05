package parser

import (
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

func vvpos(line, char uint32) ctypes.Position {
	return ctypes.Position{Line: line, Character: char}
}

func TestLiteralBlockMapper_RoundTrip(t *testing.T) {
	m := &LiteralBlockMapper{
		StartLine:  5,
		IndentCols: 2,
	}

	tests := []struct {
		virtual ctypes.Position
		source  ctypes.Position
	}{
		{vvpos(0, 0), vvpos(5, 2)},
		{vvpos(0, 10), vvpos(5, 12)},
		{vvpos(1, 0), vvpos(6, 2)},
		{vvpos(2, 7), vvpos(7, 9)},
	}
	for _, tt := range tests {
		gotSource := m.ToSource(tt.virtual)
		if gotSource != tt.source {
			t.Errorf("ToSource(%v) = %v, want %v", tt.virtual, gotSource, tt.source)
		}
		gotVirtual := m.ToVirtual(tt.source)
		if gotVirtual != tt.virtual {
			t.Errorf("ToVirtual(%v) = %v, want %v", tt.source, gotVirtual, tt.virtual)
		}
	}
}

func TestLiteralBlockMapper_ToVirtual_BeforeStart(t *testing.T) {
	m := &LiteralBlockMapper{StartLine: 5, IndentCols: 2}
	got := m.ToVirtual(vvpos(3, 0))
	if got.Line != 0 || got.Character != 0 {
		t.Errorf("ToVirtual(source before start) = %v, want (0,0)", got)
	}
}

func TestIdentityMapper_OffsetTranslation(t *testing.T) {
	m := &IdentityMapper{
		Offset: vvpos(10, 5),
	}

	tests := []struct {
		virtual ctypes.Position
		source  ctypes.Position
	}{
		{vvpos(0, 0), vvpos(10, 5)},
		{vvpos(0, 3), vvpos(10, 8)},
		{vvpos(1, 0), vvpos(11, 0)},
		{vvpos(2, 7), vvpos(12, 7)},
	}
	for _, tt := range tests {
		gotSource := m.ToSource(tt.virtual)
		if gotSource != tt.source {
			t.Errorf("ToSource(%v) = %v, want %v", tt.virtual, gotSource, tt.source)
		}
		gotVirtual := m.ToVirtual(tt.source)
		if gotVirtual != tt.virtual {
			t.Errorf("ToVirtual(%v) = %v, want %v", tt.source, gotVirtual, tt.virtual)
		}
	}
}

func TestIdentityMapper_ToVirtual_BeforeOffset(t *testing.T) {
	m := &IdentityMapper{Offset: vvpos(10, 5)}
	got := m.ToVirtual(vvpos(8, 0))
	if got.Line != 0 || got.Character != 0 {
		t.Errorf("ToVirtual(source before offset) = %v, want (0,0)", got)
	}
}
