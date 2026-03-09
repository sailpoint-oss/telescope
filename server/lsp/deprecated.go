package lsp

import (
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// DeprecatedRange describes a single deprecated element for client-side decoration.
type DeprecatedRange struct {
	Range protocol.Range `json:"range"`
	Name  string         `json:"name"`
	Kind  string         `json:"kind"` // "operation", "schema", "parameter", "header"
}

// DeprecatedRangesParams is the payload for the telescope/deprecatedRanges notification.
type DeprecatedRangesParams struct {
	URI    string            `json:"uri"`
	Ranges []DeprecatedRange `json:"ranges"`
}

// collectDeprecatedRanges gathers all deprecated elements from the index.
func collectDeprecatedRanges(idx *openapi.Index) []DeprecatedRange {
	if idx == nil || idx.Document == nil {
		return nil
	}

	var ranges []DeprecatedRange

	// Deprecated operations
	for _, item := range idx.Document.Paths {
		for _, mo := range item.Operations() {
			if !mo.Operation.Deprecated {
				continue
			}
			loc := mo.Operation.OperationIDLoc
			if isZeroRange(adapt.RangeToProtocol(loc.Range)) {
				loc = mo.Operation.MethodLoc
			}
			if isZeroRange(adapt.RangeToProtocol(loc.Range)) {
				continue
			}
			name := mo.Operation.OperationID
			if name == "" {
				name = mo.Method
			}
			ranges = append(ranges, DeprecatedRange{
				Range: adapt.RangeToProtocol(loc.Range),
				Name:  name,
				Kind:  "operation",
			})
		}
	}

	// Deprecated schemas
	if idx.Document.Components != nil {
		for name, schema := range idx.Document.Components.Schemas {
			if !schema.Deprecated || isZeroRange(adapt.RangeToProtocol(schema.NameLoc.Range)) {
				continue
			}
			ranges = append(ranges, DeprecatedRange{
				Range: adapt.RangeToProtocol(schema.NameLoc.Range),
				Name:  name,
				Kind:  "schema",
			})
		}

		// Deprecated parameters
		for name, param := range idx.Document.Components.Parameters {
			if !param.Deprecated || isZeroRange(adapt.RangeToProtocol(param.NameLoc.Range)) {
				continue
			}
			ranges = append(ranges, DeprecatedRange{
				Range: adapt.RangeToProtocol(param.NameLoc.Range),
				Name:  name,
				Kind:  "parameter",
			})
		}

		// Deprecated headers
		for name, header := range idx.Document.Components.Headers {
			if !header.Deprecated || isZeroRange(adapt.RangeToProtocol(header.NameLoc.Range)) {
				continue
			}
			ranges = append(ranges, DeprecatedRange{
				Range: adapt.RangeToProtocol(header.NameLoc.Range),
				Name:  name,
				Kind:  "header",
			})
		}
	}

	return ranges
}
