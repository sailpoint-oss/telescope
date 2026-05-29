package rulesets_test

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/rulesets"
)

func TestRuleDefinitionUnmarshalShorthand(t *testing.T) {
	tests := []struct {
		name     string
		yaml     string
		wantSev  string
		wantDesc string
	}{
		{
			name:    "string severity",
			yaml:    "rules:\n  info-contact: error",
			wantSev: "error",
		},
		{
			name:    "off severity",
			yaml:    "rules:\n  info-contact: \"off\"",
			wantSev: "off",
		},
		{
			name:    "boolean false",
			yaml:    "rules:\n  info-contact: false",
			wantSev: "off",
		},
		{
			name:     "full object",
			yaml:     "rules:\n  info-contact:\n    severity: warn\n    description: Must have contact",
			wantSev:  "warn",
			wantDesc: "Must have contact",
		},
		{
			name:    "integer severity 0",
			yaml:    "rules:\n  info-contact: 0",
			wantSev: "off",
		},
		{
			name:    "integer severity 1",
			yaml:    "rules:\n  info-contact: 1",
			wantSev: "error",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rs, err := rulesets.LoadBytes([]byte(tt.yaml))
			if err != nil {
				t.Fatalf("LoadBytes: %v", err)
			}
			def, ok := rs.Rules["info-contact"]
			if !ok {
				t.Fatal("expected info-contact rule")
			}
			if def.Severity != tt.wantSev {
				t.Errorf("Severity = %q, want %q", def.Severity, tt.wantSev)
			}
			if tt.wantDesc != "" && def.Description != tt.wantDesc {
				t.Errorf("Description = %q, want %q", def.Description, tt.wantDesc)
			}
		})
	}
}

func TestRuleDefinitionUnmarshalArray(t *testing.T) {
	input := "rules:\n  info-contact:\n    - error\n    - description: \"Must have contact\"\n"
	rs, err := rulesets.LoadBytes([]byte(input))
	if err != nil {
		t.Fatalf("LoadBytes: %v", err)
	}
	def, ok := rs.Rules["info-contact"]
	if !ok {
		t.Fatal("expected info-contact rule")
	}
	if def.Severity != "error" {
		t.Errorf("Severity = %q, want %q", def.Severity, "error")
	}
	if def.Description != "Must have contact" {
		t.Errorf("Description = %q, want %q", def.Description, "Must have contact")
	}
}

func TestLoadBytes_PreservesUnmappedRuleIDs(t *testing.T) {
	rs, err := rulesets.LoadBytes([]byte("rules:\n  operation-tags: error\n"))
	if err != nil {
		t.Fatalf("LoadBytes: %v", err)
	}
	if def, ok := rs.Rules["operation-tags"]; !ok {
		t.Fatalf("expected operation-tags rule, got %+v", rs.Rules)
	} else if def.Severity != "error" {
		t.Fatalf("Severity = %q, want error", def.Severity)
	}
}
