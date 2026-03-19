package bridge

import (
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/barrelman"
)

// DiagnosticsToProtocol converts barrelman diagnostics to gossip protocol format.
func DiagnosticsToProtocol(diags []barrelman.Diagnostic) []protocol.Diagnostic {
	if len(diags) == 0 {
		return nil
	}
	result := make([]protocol.Diagnostic, len(diags))
	for i, d := range diags {
		result[i] = DiagnosticToProtocol(d)
	}
	return result
}

// DiagnosticToProtocol converts a single barrelman Diagnostic to protocol format.
func DiagnosticToProtocol(d barrelman.Diagnostic) protocol.Diagnostic {
	pd := protocol.Diagnostic{
		Range: protocol.Range{
			Start: protocol.Position{Line: d.Range.Start.Line, Character: d.Range.Start.Character},
			End:   protocol.Position{Line: d.Range.End.Line, Character: d.Range.End.Character},
		},
		Severity: protocol.DiagnosticSeverity(d.Severity),
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
					URI: protocol.DocumentURI(r.URI),
					Range: protocol.Range{
						Start: protocol.Position{Line: r.Range.Start.Line, Character: r.Range.Start.Character},
						End:   protocol.Position{Line: r.Range.End.Line, Character: r.Range.End.Character},
					},
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

// DiagnosticsFromProtocol converts gossip protocol diagnostics to barrelman format.
func DiagnosticsFromProtocol(diags []protocol.Diagnostic) []barrelman.Diagnostic {
	if len(diags) == 0 {
		return nil
	}
	result := make([]barrelman.Diagnostic, len(diags))
	for i, d := range diags {
		result[i] = diagnosticFromProtocol(d)
	}
	return result
}

func diagnosticFromProtocol(d protocol.Diagnostic) barrelman.Diagnostic {
	bd := barrelman.Diagnostic{
		Range: barrelman.Range{
			Start: barrelman.Position{Line: d.Range.Start.Line, Character: d.Range.Start.Character},
			End:   barrelman.Position{Line: d.Range.End.Line, Character: d.Range.End.Character},
		},
		Severity: barrelman.Severity(d.Severity),
		Source:   d.Source,
		Message:  d.Message,
		Data:     d.Data,
	}
	if code, ok := d.Code.(string); ok {
		bd.Code = code
	}
	if d.CodeDescription != nil {
		bd.CodeDescription = string(d.CodeDescription.Href)
	}
	return bd
}
