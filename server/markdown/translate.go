package markdown

import (
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// TranslatePosition converts a goldmark 1-based line number into an absolute
// LSP range using the description's source location and geometry.
func TranslatePosition(desc openapi.DescriptionValue, goldmarkLine int) protocol.Range {
	absLine := desc.Loc.Range.Start.Line + uint32(desc.LineOffset) + uint32(goldmarkLine) - 1
	return protocol.Range{
		Start: protocol.Position{Line: absLine, Character: 0},
		End:   protocol.Position{Line: absLine, Character: 0},
	}
}

// TranslateRange converts a goldmark position with column and length into a
// precise absolute LSP range. IndentCols is added to the column to account
// for block scalar indentation in the source file.
func TranslateRange(desc openapi.DescriptionValue, line, col, length int) protocol.Range {
	absLine := desc.Loc.Range.Start.Line + uint32(desc.LineOffset) + uint32(line) - 1
	absCol := uint32(col) + uint32(desc.IndentCols)
	return protocol.Range{
		Start: protocol.Position{Line: absLine, Character: absCol},
		End:   protocol.Position{Line: absLine, Character: absCol + uint32(length)},
	}
}
