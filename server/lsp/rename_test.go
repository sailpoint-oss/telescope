package lsp

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestRangeForWord_ASCII(t *testing.T) {
	pos := protocol.Position{Line: 5, Character: 10}
	r := rangeForWord(pos, "hello")
	// half = 2, start = 10 - 2 = 8, end = 8 + 5 = 13
	if r.Start.Character != 8 {
		t.Errorf("Start.Character = %d, want 8", r.Start.Character)
	}
	if r.End.Character != 13 {
		t.Errorf("End.Character = %d, want 13", r.End.Character)
	}
}

func TestRangeForWord_NonASCII(t *testing.T) {
	// "café" = 4 runes, 5 UTF-8 bytes, 4 UTF-16 code units
	pos := protocol.Position{Line: 3, Character: 10}
	r := rangeForWord(pos, "caf\xc3\xa9")
	// UTF-16 length = 4, half = 2, start = 10 - 2 = 8, end = 8 + 4 = 12
	if r.Start.Character != 8 {
		t.Errorf("Start.Character = %d, want 8", r.Start.Character)
	}
	if r.End.Character != 12 {
		t.Errorf("End.Character = %d, want 12 (UTF-16 len=4)", r.End.Character)
	}
}

func TestRangeForWord_Emoji(t *testing.T) {
	// "🚀" = 1 rune, 4 UTF-8 bytes, 2 UTF-16 code units
	pos := protocol.Position{Line: 0, Character: 5}
	r := rangeForWord(pos, "\xf0\x9f\x9a\x80")
	// UTF-16 length = 2, half = 1, start = 5 - 1 = 4, end = 4 + 2 = 6
	if r.Start.Character != 4 {
		t.Errorf("Start.Character = %d, want 4", r.Start.Character)
	}
	if r.End.Character != 6 {
		t.Errorf("End.Character = %d, want 6 (UTF-16 len=2)", r.End.Character)
	}
}

func TestUTF16LenStr(t *testing.T) {
	tests := []struct {
		input string
		want  uint32
	}{
		{"hello", 5},
		{"café", 4},          // é = 1 UTF-16 unit
		{"🚀", 2},             // surrogate pair
		{"a🚀b", 4},           // 1 + 2 + 1
		{"", 0},
		{"日本語", 3},           // each CJK = 1 UTF-16 unit
	}
	for _, tt := range tests {
		got := utf16LenStr(tt.input)
		if got != tt.want {
			t.Errorf("utf16LenStr(%q) = %d, want %d", tt.input, got, tt.want)
		}
	}
}
