package validate

import ctypes "github.com/sailpoint-oss/telescope/server/core/types"

// ValidationPipeline orchestrates schema validation and error enrichment.
type ValidationPipeline struct {
	validator  *SchemaValidator
	enrichment *EnrichmentPipeline
}

// NewValidationPipeline creates a pipeline with the given validator and enrichment.
func NewValidationPipeline(v *SchemaValidator, e *EnrichmentPipeline) *ValidationPipeline {
	return &ValidationPipeline{
		validator:  v,
		enrichment: e,
	}
}

// Run validates content and returns enriched diagnostics.
func (p *ValidationPipeline) Run(content []byte, version string, pointerIndex map[string]ctypes.Range) []ctypes.Diagnostic {
	errors := p.validator.Validate(content, version, pointerIndex)
	if len(errors) == 0 {
		return nil
	}
	diagnostics := make([]ctypes.Diagnostic, 0, len(errors))
	for _, err := range errors {
		enriched := p.enrichment.Enrich(&err, content)
		diagnostics = append(diagnostics, validationErrorToDiagnostic(enriched))
	}
	return diagnostics
}

// validationErrorToDiagnostic converts a ValidationError to a Diagnostic.
func validationErrorToDiagnostic(err *ValidationError) ctypes.Diagnostic {
	return ctypes.Diagnostic{
		Range:    err.Range,
		Severity: ctypes.SeverityError,
		Code:     err.Keyword,
		Source:   "json-schema",
		Message:  err.Message,
	}
}
