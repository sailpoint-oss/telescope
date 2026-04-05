package rulesets_test

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/rulesets"
)

func TestGetSpectralBuiltin(t *testing.T) {
	t.Run("spectral:oas returns valid ruleset", func(t *testing.T) {
		rs := rulesets.GetSpectralBuiltin("spectral:oas")
		if rs == nil {
			t.Fatal("GetSpectralBuiltin(spectral:oas) returned nil")
		}
		if rs.Name != "Spectral OAS" {
			t.Errorf("Name = %q, want %q", rs.Name, "Spectral OAS")
		}
		if len(rs.Rules) == 0 {
			t.Error("expected non-empty rule set")
		}
	})

	t.Run("unknown spectral builtin returns nil", func(t *testing.T) {
		rs := rulesets.GetSpectralBuiltin("spectral:unknown")
		if rs != nil {
			t.Error("expected nil for unknown builtin")
		}
	})

	t.Run("spectral:oas contains known rules", func(t *testing.T) {
		rs := rulesets.GetSpectralBuiltin("spectral:oas")
		expectedRules := []string{
			"info-contact",
			"info-description",
			"operation-description",
			"operation-operationId",
			"operation-operationId-unique",
			"path-keys-no-trailing-slash",
			"path-params",
			"oas3-api-servers",
			"oas3-schema",
			"tag-description",
		}
		for _, id := range expectedRules {
			if _, ok := rs.Rules[id]; !ok {
				t.Errorf("expected rule %q in spectral:oas", id)
			}
		}
	})
}

func TestSpectralToTelescopeID(t *testing.T) {
	tests := []struct {
		spectralID  string
		telescopeID string
	}{
		{"info-contact", "info-contact"},
		{"no-eval-in-markdown", "description-markdown"},
		{"no-script-tags-in-markdown", "description-html"},
		{"oas3-api-servers", "oas3-api-servers"},
		{"unknown-rule", "unknown-rule"},
	}

	for _, tt := range tests {
		t.Run(tt.spectralID, func(t *testing.T) {
			got := rulesets.SpectralToTelescopeID(tt.spectralID)
			if got != tt.telescopeID {
				t.Errorf("SpectralToTelescopeID(%q) = %q, want %q", tt.spectralID, got, tt.telescopeID)
			}
		})
	}
}

func TestIsNativeRule(t *testing.T) {
	if !rulesets.IsNativeRule("info-contact") {
		t.Error("info-contact should be a native rule")
	}
	if !rulesets.IsNativeRule("no-eval-in-markdown") {
		t.Error("no-eval-in-markdown should map to a native rule")
	}
	if rulesets.IsNativeRule("contact-properties") {
		t.Error("contact-properties should not be a native rule")
	}
}

func TestResolverSupportsSpectralOAS(t *testing.T) {
	rs := &rulesets.RuleSet{
		Extends: "spectral:oas",
		Rules: map[string]rulesets.RuleDefinition{
			"info-contact": {Severity: "error"},
		},
	}

	resolved, err := rulesets.Resolve(rs, ".")
	if err != nil {
		t.Fatalf("Resolve failed: %v", err)
	}

	// Should have spectral:oas rules plus the override
	if len(resolved.Rules) == 0 {
		t.Error("expected non-empty resolved rules")
	}

	def, ok := resolved.Rules["info-contact"]
	if !ok {
		t.Fatal("expected info-contact in resolved rules")
	}
	if def.Severity != "error" {
		t.Errorf("info-contact severity = %q, want %q", def.Severity, "error")
	}
}
