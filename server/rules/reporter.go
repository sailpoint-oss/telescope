package rules

import (
	"fmt"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// Reporter collects diagnostics during rule evaluation. Visitor callbacks
// receive a *Reporter and call At/AtRange to report issues without
// constructing protocol.Diagnostic values manually.
type Reporter struct {
	id       string
	severity protocol.DiagnosticSeverity
	diags    []protocol.Diagnostic

	// Per-diagnostic state, reset after each report call.
	pendingTags    []protocol.DiagnosticTag
	pendingRelated []protocol.DiagnosticRelatedInformation
	pendingData    interface{}
}

// NewReporter creates a Reporter for the given rule ID and default severity.
func NewReporter(id string, severity protocol.DiagnosticSeverity) *Reporter {
	return &Reporter{id: id, severity: severity}
}

// WithTags sets diagnostic tags for the next reported diagnostic.
// Tags are consumed after the next At/AtRange/Error/Warn call.
func (r *Reporter) WithTags(tags ...protocol.DiagnosticTag) *Reporter {
	r.pendingTags = tags
	return r
}

// WithRelated adds related information for the next reported diagnostic.
// Can be called multiple times to attach multiple related locations.
// Related info is consumed after the next At/AtRange/Error/Warn call.
func (r *Reporter) WithRelated(loc openapi.Loc, uri protocol.DocumentURI, format string, args ...any) *Reporter {
	r.pendingRelated = append(r.pendingRelated, protocol.DiagnosticRelatedInformation{
		Location: protocol.Location{URI: uri, Range: loc.Range},
		Message:  fmt.Sprintf(format, args...),
	})
	return r
}

// WithData sets an arbitrary data payload for the next reported diagnostic.
// Data is consumed after the next At/AtRange/Error/Warn call.
func (r *Reporter) WithData(data interface{}) *Reporter {
	r.pendingData = data
	return r
}

// At reports a diagnostic at the location of an OpenAPI model element.
func (r *Reporter) At(loc openapi.Loc, format string, args ...any) {
	r.report(loc.Range, r.severity, fmt.Sprintf(format, args...))
}

// AtRange reports a diagnostic at an explicit LSP range.
func (r *Reporter) AtRange(rng protocol.Range, format string, args ...any) {
	r.report(rng, r.severity, fmt.Sprintf(format, args...))
}

// Error reports an error-severity diagnostic at the given location,
// overriding the rule's default severity.
func (r *Reporter) Error(loc openapi.Loc, format string, args ...any) {
	r.report(loc.Range, protocol.SeverityError, fmt.Sprintf(format, args...))
}

// Warn reports a warning-severity diagnostic at the given location,
// overriding the rule's default severity.
func (r *Reporter) Warn(loc openapi.Loc, format string, args ...any) {
	r.report(loc.Range, protocol.SeverityWarning, fmt.Sprintf(format, args...))
}

// ErrorAtRange reports an error-severity diagnostic at an explicit LSP range.
func (r *Reporter) ErrorAtRange(rng protocol.Range, format string, args ...any) {
	r.report(rng, protocol.SeverityError, fmt.Sprintf(format, args...))
}

// WarnAtRange reports a warning-severity diagnostic at an explicit LSP range.
func (r *Reporter) WarnAtRange(rng protocol.Range, format string, args ...any) {
	r.report(rng, protocol.SeverityWarning, fmt.Sprintf(format, args...))
}

// Diagnostics returns all reported diagnostics.
func (r *Reporter) Diagnostics() []protocol.Diagnostic {
	return r.diags
}

func (r *Reporter) report(rng protocol.Range, sev protocol.DiagnosticSeverity, msg string) {
	meta, ok := DefaultRegistry.Get(r.id)
	var codeDesc *protocol.CodeDescription
	if ok && meta.DocURL != "" {
		codeDesc = &protocol.CodeDescription{Href: protocol.URI(meta.DocURL)}
	}
	d := protocol.Diagnostic{
		Range:           rng,
		Severity:        sev,
		Source:          Source,
		Code:            r.id,
		CodeDescription: codeDesc,
		Message:         msg,
	}
	if len(r.pendingTags) > 0 {
		d.Tags = r.pendingTags
		r.pendingTags = nil
	}
	if len(r.pendingRelated) > 0 {
		d.RelatedInformation = r.pendingRelated
		r.pendingRelated = nil
	}
	if r.pendingData != nil {
		d.Data = r.pendingData
		r.pendingData = nil
	}
	r.diags = append(r.diags, d)
}
