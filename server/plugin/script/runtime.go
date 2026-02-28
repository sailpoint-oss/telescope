// Package script provides an embedded JavaScript/TypeScript runtime for Telescope rules.
// Users drop .js or .ts files into .telescope/rules/ and they are automatically
// picked up, validated, and executed as diagnostic analyzers. TypeScript files are
// transpiled to JavaScript via esbuild before execution.
package script

import (
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// ScriptMeta holds metadata extracted from a rule file's exports.meta.
type ScriptMeta struct {
	ID          string
	Description string
	Severity    string // error, warn, info, hint
	Category    string
}

// ScriptDiagnostic is a diagnostic reported from JS/TS code via ctx.report().
type ScriptDiagnostic struct {
	StartLine uint32
	StartChar uint32
	EndLine   uint32
	EndChar   uint32
	Message   string
}

// ToProtocol converts a ScriptDiagnostic to a protocol.Diagnostic.
func (d ScriptDiagnostic) ToProtocol(meta ScriptMeta) protocol.Diagnostic {
	return protocol.Diagnostic{
		Range: protocol.Range{
			Start: protocol.Position{Line: d.StartLine, Character: d.StartChar},
			End:   protocol.Position{Line: d.EndLine, Character: d.EndChar},
		},
		Severity: parseSeverity(meta.Severity),
		Source:   "telescope",
		Code:     meta.ID,
		Message:  d.Message,
	}
}

// ScriptRule is a loaded and validated rule ready for execution.
type ScriptRule struct {
	Path   string
	Meta   ScriptMeta
	Source string // JS source (transpiled from TS if applicable)
}

// Execute runs this script rule against the given OpenAPI index and returns diagnostics.
func (r *ScriptRule) Execute(idx *openapi.Index) []protocol.Diagnostic {
	rt := newGojaRuntime(r.Source, r.Meta)
	scriptDiags := rt.execute(idx)

	diags := make([]protocol.Diagnostic, len(scriptDiags))
	for i, sd := range scriptDiags {
		diags[i] = sd.ToProtocol(r.Meta)
	}
	return diags
}

func parseSeverity(s string) protocol.DiagnosticSeverity {
	switch s {
	case "error":
		return protocol.SeverityError
	case "warn", "warning":
		return protocol.SeverityWarning
	case "info", "information":
		return protocol.SeverityInformation
	case "hint":
		return protocol.SeverityHint
	default:
		return protocol.SeverityWarning
	}
}
