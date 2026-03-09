package types

// Position in a text document expressed as zero-based line and character offset.
type Position struct {
	Line      uint32
	Character uint32
}

// Range in a text document expressed as start and end positions.
type Range struct {
	Start Position
	End   Position
}

// ContainsPosition reports whether r contains pos (inclusive of start, exclusive of end).
func ContainsPosition(r Range, pos Position) bool {
	if pos.Line < r.Start.Line || pos.Line > r.End.Line {
		return false
	}
	if pos.Line == r.Start.Line && pos.Character < r.Start.Character {
		return false
	}
	if pos.Line == r.End.Line && pos.Character >= r.End.Character {
		return false
	}
	return true
}

// IsEmpty reports whether the range has zero length.
func IsEmpty(r Range) bool {
	return r.Start.Line == r.End.Line && r.Start.Character == r.End.Character
}

// FileStartRange is a 1-character range at position {0,0}→{0,1}, suitable for
// document-level diagnostics when no specific location applies.
var FileStartRange = Range{
	Start: Position{Line: 0, Character: 0},
	End:   Position{Line: 0, Character: 1},
}
