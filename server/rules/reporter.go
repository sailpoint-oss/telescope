package rules

import (
	"fmt"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// Reporter collects diagnostics during rule evaluation. Visitor callbacks
// receive a *Reporter and call At/AtRange to report issues.
type Reporter struct {
	id       string
	severity ctypes.Severity
	diags    []ctypes.Diagnostic

	pendingTags    []ctypes.DiagnosticTag
	pendingRelated []ctypes.RelatedInformation
	pendingData    interface{}
}

// NewReporter creates a Reporter for the given rule ID and default severity.
func NewReporter(id string, severity ctypes.Severity) *Reporter {
	return &Reporter{id: id, severity: severity}
}

// WithTags sets diagnostic tags for the next reported diagnostic.
// Tags are consumed after the next At/AtRange/Error/Warn call.
func (r *Reporter) WithTags(tags ...ctypes.DiagnosticTag) *Reporter {
	r.pendingTags = tags
	return r
}

// WithRelated adds related information for the next reported diagnostic.
// Can be called multiple times to attach multiple related locations.
// Related info is consumed after the next At/AtRange/Error/Warn call.
func (r *Reporter) WithRelated(loc openapi.Loc, uri string, format string, args ...any) *Reporter {
	r.pendingRelated = append(r.pendingRelated, ctypes.RelatedInformation{
		URI:     uri,
		Range:   loc.Range,
		Message: fmt.Sprintf(format, args...),
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

// AtRange reports a diagnostic at an explicit range.
func (r *Reporter) AtRange(rng ctypes.Range, format string, args ...any) {
	r.report(rng, r.severity, fmt.Sprintf(format, args...))
}

// Error reports an error-severity diagnostic at the given location,
// overriding the rule's default severity.
func (r *Reporter) Error(loc openapi.Loc, format string, args ...any) {
	r.report(loc.Range, ctypes.SeverityError, fmt.Sprintf(format, args...))
}

// Warn reports a warning-severity diagnostic at the given location,
// overriding the rule's default severity.
func (r *Reporter) Warn(loc openapi.Loc, format string, args ...any) {
	r.report(loc.Range, ctypes.SeverityWarning, fmt.Sprintf(format, args...))
}

// ErrorAtRange reports an error-severity diagnostic at an explicit range.
func (r *Reporter) ErrorAtRange(rng ctypes.Range, format string, args ...any) {
	r.report(rng, ctypes.SeverityError, fmt.Sprintf(format, args...))
}

// WarnAtRange reports a warning-severity diagnostic at an explicit range.
func (r *Reporter) WarnAtRange(rng ctypes.Range, format string, args ...any) {
	r.report(rng, ctypes.SeverityWarning, fmt.Sprintf(format, args...))
}

// Diagnostics returns all reported diagnostics.
func (r *Reporter) Diagnostics() []ctypes.Diagnostic {
	return r.diags
}

func (r *Reporter) report(rng ctypes.Range, sev ctypes.Severity, msg string) {
	// Constrain multi-line ranges to a single line so diagnostics don't
	// highlight leading whitespace on subsequent lines.
	if rng.End.Line > rng.Start.Line {
		rng.End = ctypes.Position{Line: rng.Start.Line, Character: rng.Start.Character + 1000}
	}

	d := ctypes.Diagnostic{
		Range:    rng,
		Severity: sev,
		Source:   Source,
		Code:     r.id,
		Message:  msg,
	}
	meta, ok := DefaultRegistry.Get(r.id)
	if ok && meta.DocURL != "" {
		d.CodeDescription = meta.DocURL
	}
	if len(r.pendingTags) > 0 {
		d.Tags = r.pendingTags
		r.pendingTags = nil
	}
	if len(r.pendingRelated) > 0 {
		d.Related = r.pendingRelated
		r.pendingRelated = nil
	}
	if r.pendingData != nil {
		d.Data = r.pendingData
		r.pendingData = nil
	}
	r.diags = append(r.diags, d)
}
