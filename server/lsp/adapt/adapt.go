// Package adapt converts between protocol-independent core types and
// LSP protocol types. This is the single boundary between the core engine
// and the gossip LSP framework.
package adapt

import (
	"github.com/LukasParke/gossip/protocol"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// PositionToProtocol converts a core Position to a protocol Position.
func PositionToProtocol(p ctypes.Position) protocol.Position {
	return protocol.Position{Line: p.Line, Character: p.Character}
}

// PositionFromProtocol converts a protocol Position to a core Position.
func PositionFromProtocol(p protocol.Position) ctypes.Position {
	return ctypes.Position{Line: p.Line, Character: p.Character}
}

// RangeToProtocol converts a core Range to a protocol Range.
func RangeToProtocol(r ctypes.Range) protocol.Range {
	return protocol.Range{
		Start: PositionToProtocol(r.Start),
		End:   PositionToProtocol(r.End),
	}
}

// RangeFromProtocol converts a protocol Range to a core Range.
func RangeFromProtocol(r protocol.Range) ctypes.Range {
	return ctypes.Range{
		Start: PositionFromProtocol(r.Start),
		End:   PositionFromProtocol(r.End),
	}
}

// SeverityToProtocol converts a core Severity to a protocol DiagnosticSeverity.
func SeverityToProtocol(s ctypes.Severity) protocol.DiagnosticSeverity {
	return protocol.DiagnosticSeverity(s)
}

// SeverityFromProtocol converts a protocol DiagnosticSeverity to a core Severity.
func SeverityFromProtocol(s protocol.DiagnosticSeverity) ctypes.Severity {
	return ctypes.Severity(s)
}

// DiagnosticToProtocol converts a core Diagnostic to a protocol Diagnostic.
func DiagnosticToProtocol(d ctypes.Diagnostic) protocol.Diagnostic {
	pd := protocol.Diagnostic{
		Range:    RangeToProtocol(d.Range),
		Severity: SeverityToProtocol(d.Severity),
		Source:   d.Source,
		Message:  d.Message,
	}
	if d.Code != "" {
		pd.Code = d.Code
	}
	if d.CodeDescription != "" {
		pd.CodeDescription = &protocol.CodeDescription{Href: protocol.URI(d.CodeDescription)}
	}
	if len(d.Tags) > 0 {
		tags := make([]protocol.DiagnosticTag, len(d.Tags))
		for i, t := range d.Tags {
			tags[i] = protocol.DiagnosticTag(t)
		}
		pd.Tags = tags
	}
	if len(d.Related) > 0 {
		rel := make([]protocol.DiagnosticRelatedInformation, len(d.Related))
		for i, r := range d.Related {
			rel[i] = protocol.DiagnosticRelatedInformation{
				Location: protocol.Location{
					URI:   protocol.DocumentURI(r.URI),
					Range: RangeToProtocol(r.Range),
				},
				Message: r.Message,
			}
		}
		pd.RelatedInformation = rel
	}
	if d.Data != nil {
		pd.Data = d.Data
	}
	return pd
}

// DiagnosticFromProtocol converts a protocol Diagnostic to a core Diagnostic.
func DiagnosticFromProtocol(d protocol.Diagnostic) ctypes.Diagnostic {
	cd := ctypes.Diagnostic{
		Range:    RangeFromProtocol(d.Range),
		Severity: SeverityFromProtocol(d.Severity),
		Source:   d.Source,
		Message:  d.Message,
		Data:     d.Data,
	}
	if code, ok := d.Code.(string); ok {
		cd.Code = code
	}
	if d.CodeDescription != nil {
		cd.CodeDescription = string(d.CodeDescription.Href)
	}
	if len(d.Tags) > 0 {
		tags := make([]ctypes.DiagnosticTag, len(d.Tags))
		for i, t := range d.Tags {
			tags[i] = ctypes.DiagnosticTag(t)
		}
		cd.Tags = tags
	}
	if len(d.RelatedInformation) > 0 {
		rel := make([]ctypes.RelatedInformation, len(d.RelatedInformation))
		for i, r := range d.RelatedInformation {
			rel[i] = ctypes.RelatedInformation{
				URI:     string(r.Location.URI),
				Range:   RangeFromProtocol(r.Location.Range),
				Message: r.Message,
			}
		}
		cd.Related = rel
	}
	return cd
}

// DiagnosticsToProtocol converts a slice of core Diagnostics to protocol Diagnostics.
func DiagnosticsToProtocol(diags []ctypes.Diagnostic) []protocol.Diagnostic {
	if len(diags) == 0 {
		return nil
	}
	result := make([]protocol.Diagnostic, len(diags))
	for i, d := range diags {
		result[i] = DiagnosticToProtocol(d)
	}
	return result
}

// DiagnosticsFromProtocol converts a slice of protocol Diagnostics to core Diagnostics.
func DiagnosticsFromProtocol(diags []protocol.Diagnostic) []ctypes.Diagnostic {
	if len(diags) == 0 {
		return nil
	}
	result := make([]ctypes.Diagnostic, len(diags))
	for i, d := range diags {
		result[i] = DiagnosticFromProtocol(d)
	}
	return result
}

// TextEditToProtocol converts a core TextEdit to a protocol TextEdit.
func TextEditToProtocol(e ctypes.TextEdit) protocol.TextEdit {
	return protocol.TextEdit{
		Range:   RangeToProtocol(e.Range),
		NewText: e.NewText,
	}
}

// TextEditFromProtocol converts a protocol TextEdit to a core TextEdit.
func TextEditFromProtocol(e protocol.TextEdit) ctypes.TextEdit {
	return ctypes.TextEdit{
		Range:   RangeFromProtocol(e.Range),
		NewText: e.NewText,
	}
}

// TextEditsToProtocol converts a slice of core TextEdits to protocol TextEdits.
func TextEditsToProtocol(edits []ctypes.TextEdit) []protocol.TextEdit {
	if len(edits) == 0 {
		return nil
	}
	result := make([]protocol.TextEdit, len(edits))
	for i, e := range edits {
		result[i] = TextEditToProtocol(e)
	}
	return result
}

