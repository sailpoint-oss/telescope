package validate

import (
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

func openAPIRootLikeSchema() []byte {
	return []byte(`{
  "type": "object",
  "required": ["openapi", "info", "paths"],
  "properties": {
    "openapi": { "type": "string" },
    "info": { "type": "object" },
    "paths": { "type": "object" }
  }
}`)
}

func TestValidationPipeline_Run_InvalidOpenAPI_MissingRequiredInfo(t *testing.T) {
	v := NewSchemaValidator()
	if err := v.RegisterSchema("3.1.0", openAPIRootLikeSchema()); err != nil {
		t.Fatalf("RegisterSchema failed: %v", err)
	}
	p := NewValidationPipeline(v, NewEnrichmentPipeline())

	content := []byte(`{"openapi":"3.1.0","paths":{}}`)
	diags := p.Run(content, "3.1.0", map[string]ctypes.Range{
		"/": ctypes.FileStartRange,
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostics for missing required info")
	}

	var found bool
	for _, d := range diags {
		if d.Code == "required" {
			found = true
			if d.Severity != ctypes.SeverityError {
				t.Errorf("expected SeverityError, got %v", d.Severity)
			}
			if d.Source != "json-schema" {
				t.Errorf("expected source json-schema, got %q", d.Source)
			}
		}
	}
	if !found {
		t.Fatalf("expected at least one 'required' diagnostic, got %+v", diags)
	}
}

func TestValidationPipeline_Run_InvalidOpenAPI_TypeMismatch(t *testing.T) {
	v := NewSchemaValidator()
	if err := v.RegisterSchema("3.1.0", openAPIRootLikeSchema()); err != nil {
		t.Fatalf("RegisterSchema failed: %v", err)
	}
	p := NewValidationPipeline(v, NewEnrichmentPipeline())

	content := []byte(`{"openapi":"3.1.0","info":"wrong","paths":{}}`)
	infoRange := ctypes.Range{
		Start: ctypes.Position{Line: 0, Character: 20},
		End:   ctypes.Position{Line: 0, Character: 27},
	}
	diags := p.Run(content, "3.1.0", map[string]ctypes.Range{
		"/info": infoRange,
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostics for info type mismatch")
	}

	var found bool
	for _, d := range diags {
		if d.Code == "type" {
			found = true
			if d.Severity != ctypes.SeverityError {
				t.Errorf("expected SeverityError, got %v", d.Severity)
			}
			if d.Source != "json-schema" {
				t.Errorf("expected source json-schema, got %q", d.Source)
			}
			if d.Range != infoRange {
				t.Errorf("expected range %+v, got %+v", infoRange, d.Range)
			}
		}
	}
	if !found {
		t.Fatalf("expected at least one 'type' diagnostic, got %+v", diags)
	}
}
