package parser

import ctypes "github.com/sailpoint-oss/telescope/server/core/types"

type VirtualDocument struct {
	URI         string       // synthetic URI (e.g., "vdoc://file.yaml#/paths/~1users/get/description")
	LanguageID  string       // e.g. "markdown"
	Content     string
	SourceURI   string       // parent document URI
	SourceRange ctypes.Range // range in parent document
	Mapper      OffsetMapper
}

// OffsetMapper translates positions between a virtual document and its source.
type OffsetMapper interface {
	ToSource(virtual ctypes.Position) ctypes.Position
	ToVirtual(source ctypes.Position) ctypes.Position
}

// LiteralBlockMapper handles YAML literal block scalars (|).
type LiteralBlockMapper struct {
	StartLine  uint32 // source line where content begins (after | indicator)
	IndentCols uint32 // columns of indentation stripped
}

func (m *LiteralBlockMapper) ToSource(virtual ctypes.Position) ctypes.Position {
	return ctypes.Position{
		Line:      m.StartLine + virtual.Line,
		Character: m.IndentCols + virtual.Character,
	}
}

func (m *LiteralBlockMapper) ToVirtual(source ctypes.Position) ctypes.Position {
	if source.Line < m.StartLine {
		return ctypes.Position{Line: 0, Character: 0}
	}
	var char uint32
	if source.Character >= m.IndentCols {
		char = source.Character - m.IndentCols
	}
	return ctypes.Position{
		Line:      source.Line - m.StartLine,
		Character: char,
	}
}

// FoldedBlockMapper handles YAML folded block scalars (>).
// Lines are folded (newlines become spaces except for blank-line-separated paragraphs).
type FoldedBlockMapper struct {
	StartLine  uint32 // source line where content begins (after > indicator)
	IndentCols uint32 // columns of indentation stripped
}

func (m *FoldedBlockMapper) ToSource(virtual ctypes.Position) ctypes.Position {
	return ctypes.Position{
		Line:      m.StartLine + virtual.Line,
		Character: m.IndentCols + virtual.Character,
	}
}

func (m *FoldedBlockMapper) ToVirtual(source ctypes.Position) ctypes.Position {
	if source.Line < m.StartLine {
		return ctypes.Position{Line: 0, Character: 0}
	}
	var char uint32
	if source.Character >= m.IndentCols {
		char = source.Character - m.IndentCols
	}
	return ctypes.Position{
		Line:      source.Line - m.StartLine,
		Character: char,
	}
}

// QuotedStringMapper handles quoted YAML strings with escape sequences.
type QuotedStringMapper struct {
	StartLine uint32 // source line of the opening quote
	StartCol  uint32 // source column after the opening quote character
}

func (m *QuotedStringMapper) ToSource(virtual ctypes.Position) ctypes.Position {
	if virtual.Line == 0 {
		return ctypes.Position{
			Line:      m.StartLine,
			Character: m.StartCol + virtual.Character,
		}
	}
	return ctypes.Position{
		Line:      m.StartLine + virtual.Line,
		Character: virtual.Character,
	}
}

func (m *QuotedStringMapper) ToVirtual(source ctypes.Position) ctypes.Position {
	if source.Line < m.StartLine {
		return ctypes.Position{Line: 0, Character: 0}
	}
	if source.Line == m.StartLine {
		var char uint32
		if source.Character >= m.StartCol {
			char = source.Character - m.StartCol
		}
		return ctypes.Position{Line: 0, Character: char}
	}
	return ctypes.Position{
		Line:      source.Line - m.StartLine,
		Character: source.Character,
	}
}

// IdentityMapper passes positions through unchanged (for quoted/flow scalars).
type IdentityMapper struct {
	Offset ctypes.Position // source position of the content start
}

func (m *IdentityMapper) ToSource(virtual ctypes.Position) ctypes.Position {
	if virtual.Line == 0 {
		return ctypes.Position{
			Line:      m.Offset.Line,
			Character: m.Offset.Character + virtual.Character,
		}
	}
	return ctypes.Position{
		Line:      m.Offset.Line + virtual.Line,
		Character: virtual.Character,
	}
}

func (m *IdentityMapper) ToVirtual(source ctypes.Position) ctypes.Position {
	if source.Line < m.Offset.Line {
		return ctypes.Position{Line: 0, Character: 0}
	}
	if source.Line == m.Offset.Line {
		var char uint32
		if source.Character >= m.Offset.Character {
			char = source.Character - m.Offset.Character
		}
		return ctypes.Position{Line: 0, Character: char}
	}
	return ctypes.Position{
		Line:      source.Line - m.Offset.Line,
		Character: source.Character,
	}
}
