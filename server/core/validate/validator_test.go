package validate

import (
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

func TestNewSchemaValidator(t *testing.T) {
	v := NewSchemaValidator()
	if v == nil {
		t.Fatal("NewSchemaValidator returned nil")
	}
	if v.schemas == nil {
		t.Error("schemas map not initialized")
	}
}

func TestSchemaValidator_RegisterSchema(t *testing.T) {
	v := NewSchemaValidator()
	schema := []byte(`{"type": "object"}`)
	err := v.RegisterSchema("3.1.0", schema)
	if err != nil {
		t.Fatalf("RegisterSchema failed: %v", err)
	}
	if len(v.schemas) != 1 {
		t.Errorf("expected 1 schema, got %d", len(v.schemas))
	}
	if v.schemas["3.1.0"] == nil {
		t.Error("schema should not be nil after registration")
	}
}

func TestSchemaValidator_Validate_NoErrors(t *testing.T) {
	v := NewSchemaValidator()
	if err := v.RegisterSchema("3.1.0", []byte(`{}`)); err != nil {
		t.Fatalf("RegisterSchema failed: %v", err)
	}
	content := []byte(`{"openapi": "3.1.0"}`)
	pointerIndex := map[string]ctypes.Range{}
	errors := v.Validate(content, "3.1.0", pointerIndex)
	if errors != nil {
		t.Errorf("expected no errors for permissive schema, got %d errors", len(errors))
	}
}

func TestNewEnrichmentPipeline(t *testing.T) {
	p := NewEnrichmentPipeline()
	if p == nil {
		t.Fatal("NewEnrichmentPipeline returned nil")
	}
	if p.enrichers == nil {
		t.Error("enrichers slice not initialized")
	}
}

func TestEnrichmentPipeline_Enrich_Passthrough(t *testing.T) {
	p := NewEnrichmentPipeline()
	err := &ValidationError{
		Range:   ctypes.FileStartRange,
		Message: "test",
		Keyword: "required",
	}
	result := p.Enrich(err, []byte{})
	if result != err {
		t.Error("empty pipeline should return original error")
	}
}

func TestEnrichmentPipeline_Enrich_Chain(t *testing.T) {
	p := NewEnrichmentPipeline(&MissingRequiredEnricher{}, &TypeMismatchEnricher{})
	err := &ValidationError{
		Range:   ctypes.FileStartRange,
		Message: "test",
		Keyword: "required",
	}
	result := p.Enrich(err, []byte(`{}`))
	if result == nil {
		t.Fatal("Enrich returned nil")
	}
	if result.Message != "test" {
		t.Errorf("expected message 'test', got %q", result.Message)
	}
}

func TestTypoEnricher_Enrich(t *testing.T) {
	e := &TypoEnricher{}
	err := &ValidationError{Message: "unknown property", Keyword: "enum", ActualValue: "openaapi"}
	result := e.Enrich(err, []byte(`openaapi: "3.1.0"`))
	if result == nil {
		t.Fatal("TypoEnricher returned nil")
	}
	if result.Keyword != "enum" {
		t.Errorf("expected keyword 'enum', got %q", result.Keyword)
	}
}

func TestNewValidationPipeline(t *testing.T) {
	v := NewSchemaValidator()
	e := NewEnrichmentPipeline()
	p := NewValidationPipeline(v, e)
	if p == nil {
		t.Fatal("NewValidationPipeline returned nil")
	}
	if p.validator != v {
		t.Error("validator not set correctly")
	}
	if p.enrichment != e {
		t.Error("enrichment not set correctly")
	}
}

func TestValidationPipeline_Run_NoErrors(t *testing.T) {
	v := NewSchemaValidator()
	if err := v.RegisterSchema("3.1.0", []byte(`{}`)); err != nil {
		t.Fatalf("RegisterSchema failed: %v", err)
	}
	e := NewEnrichmentPipeline()
	p := NewValidationPipeline(v, e)
	diags := p.Run([]byte(`{"openapi": "3.1.0"}`), "3.1.0", nil)
	if diags != nil {
		t.Errorf("expected nil diagnostics when no errors, got %d", len(diags))
	}
}

func TestValidationErrorToDiagnostic(t *testing.T) {
	err := &ValidationError{
		Range:        ctypes.FileStartRange,
		Message:      "property 'info' is required",
		SchemaPath:   "#/required",
		InstancePath: "#",
		Keyword:      "required",
	}
	d := validationErrorToDiagnostic(err)
	if d.Severity != ctypes.SeverityError {
		t.Errorf("expected SeverityError, got %v", d.Severity)
	}
	if d.Code != "required" {
		t.Errorf("expected code 'required', got %q", d.Code)
	}
	if d.Source != "json-schema" {
		t.Errorf("expected source 'json-schema', got %q", d.Source)
	}
	if d.Message != err.Message {
		t.Errorf("message mismatch: got %q", d.Message)
	}
}
