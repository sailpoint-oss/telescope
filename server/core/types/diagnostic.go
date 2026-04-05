package types

import "github.com/sailpoint-oss/barrelman"

type Severity = barrelman.Severity
type DiagnosticTag = barrelman.DiagnosticTag
type Diagnostic = barrelman.Diagnostic
type RelatedInformation = barrelman.RelatedInformation
type Fix = barrelman.Fix
type TextEdit = barrelman.TextEdit

const (
	SeverityError   = barrelman.SeverityError
	SeverityWarning = barrelman.SeverityWarning
	SeverityInfo    = barrelman.SeverityInfo
	SeverityHint    = barrelman.SeverityHint
)

const (
	DiagnosticTagUnnecessary = barrelman.DiagnosticTagUnnecessary
	DiagnosticTagDeprecated  = barrelman.DiagnosticTagDeprecated
)
