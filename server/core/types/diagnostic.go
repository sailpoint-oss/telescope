package types

// Severity indicates the severity level of a diagnostic.
type Severity int

const (
	SeverityError   Severity = 1
	SeverityWarning Severity = 2
	SeverityInfo    Severity = 3
	SeverityHint    Severity = 4
)

// DiagnosticTag adds semantic metadata to a diagnostic.
type DiagnosticTag int

const (
	DiagnosticTagUnnecessary DiagnosticTag = 1
	DiagnosticTagDeprecated  DiagnosticTag = 2
)

// Diagnostic represents an issue found during analysis.
type Diagnostic struct {
	URI             string
	Range           Range
	Severity        Severity
	Code            string
	CodeDescription string // URL for documentation about this diagnostic code
	Source          string
	Message         string
	Tags            []DiagnosticTag
	Related         []RelatedInformation
	Fixes           []Fix
	Data            interface{}
}

// RelatedInformation represents a related message and source location.
type RelatedInformation struct {
	URI     string
	Range   Range
	Message string
}

// Fix describes a suggested code fix for a diagnostic.
type Fix struct {
	Description string
	Edits       []TextEdit
}

// TextEdit represents a text replacement in a document.
type TextEdit struct {
	Range   Range
	NewText string
}
