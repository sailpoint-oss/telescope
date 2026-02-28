package spectral_test

import (
	"log/slog"
	"os"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/spectral"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
}

func TestEngine_Execute_Truthy(t *testing.T) {
	rules := []spectral.Rule{
		{
			ID:       "info-contact",
			Message:  "Info object should have a contact field",
			Severity: protocol.SeverityWarning,
			Given:    []string{"$.info"},
			Then: []spectral.FunctionCall{
				{Field: "contact", Function: "truthy"},
			},
		},
	}

	engine := spectral.NewEngine(rules, testLogger())

	t.Run("reports missing contact", func(t *testing.T) {
		doc := []byte(`
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0"
`)
		diags := engine.Execute(doc)
		if len(diags) == 0 {
			t.Error("expected diagnostic for missing contact")
		}
		if len(diags) > 0 && diags[0].Code != "info-contact" {
			t.Errorf("code = %v, want info-contact", diags[0].Code)
		}
	})

	t.Run("no diagnostic when contact exists", func(t *testing.T) {
		doc := []byte(`
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0"
  contact:
    name: Test
`)
		diags := engine.Execute(doc)
		if len(diags) != 0 {
			t.Errorf("expected no diagnostics, got %d", len(diags))
		}
	})
}

func TestEngine_Execute_Pattern(t *testing.T) {
	rules := []spectral.Rule{
		{
			ID:       "version-semver",
			Message:  "Version must be semantic versioning",
			Severity: protocol.SeverityError,
			Given:    []string{"$.info.version"},
			Then: []spectral.FunctionCall{
				{Function: "pattern", FunctionOptions: map[string]interface{}{
					"match": `^[0-9]+\.[0-9]+\.[0-9]+$`,
				}},
			},
		},
	}

	engine := spectral.NewEngine(rules, testLogger())

	t.Run("invalid version triggers diagnostic", func(t *testing.T) {
		doc := []byte(`
openapi: "3.0.0"
info:
  title: Test
  version: latest
`)
		diags := engine.Execute(doc)
		if len(diags) == 0 {
			t.Error("expected diagnostic for non-semver version")
		}
	})

	t.Run("valid semver passes", func(t *testing.T) {
		doc := []byte(`
openapi: "3.0.0"
info:
  title: Test
  version: "1.2.3"
`)
		diags := engine.Execute(doc)
		if len(diags) != 0 {
			t.Errorf("expected 0 diagnostics for valid semver, got %d", len(diags))
		}
	})
}

func TestEngine_Execute_Length(t *testing.T) {
	rules := []spectral.Rule{
		{
			ID:       "min-tags",
			Message:  "API should have at least 1 tag",
			Severity: protocol.SeverityWarning,
			Given:    []string{"$.tags"},
			Then: []spectral.FunctionCall{
				{Function: "length", FunctionOptions: map[string]interface{}{
					"min": 1,
				}},
			},
		},
	}

	engine := spectral.NewEngine(rules, testLogger())

	t.Run("empty tags triggers diagnostic", func(t *testing.T) {
		doc := []byte(`
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
tags: []
`)
		diags := engine.Execute(doc)
		if len(diags) == 0 {
			t.Error("expected diagnostic for empty tags")
		}
	})

	t.Run("non-empty tags passes", func(t *testing.T) {
		doc := []byte(`
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
tags:
  - name: pets
`)
		diags := engine.Execute(doc)
		if len(diags) != 0 {
			t.Errorf("expected 0 diagnostics, got %d", len(diags))
		}
	})
}

func TestEngine_Execute_Enumeration(t *testing.T) {
	rules := []spectral.Rule{
		{
			ID:       "api-scheme",
			Severity: protocol.SeverityError,
			Given:    []string{"$.schemes[*]"},
			Then: []spectral.FunctionCall{
				{Function: "enumeration", FunctionOptions: map[string]interface{}{
					"values": []interface{}{"http", "https"},
				}},
			},
		},
	}

	engine := spectral.NewEngine(rules, testLogger())

	t.Run("invalid scheme triggers diagnostic", func(t *testing.T) {
		doc := []byte(`
schemes:
  - ftp
  - https
`)
		diags := engine.Execute(doc)
		if len(diags) != 1 {
			t.Errorf("expected 1 diagnostic, got %d", len(diags))
		}
	})
}

func TestEngine_Execute_MultipleThen(t *testing.T) {
	rules := []spectral.Rule{
		{
			ID:       "info-check",
			Severity: protocol.SeverityWarning,
			Given:    []string{"$.info"},
			Then: []spectral.FunctionCall{
				{Field: "title", Function: "truthy"},
				{Field: "description", Function: "truthy"},
			},
		},
	}

	engine := spectral.NewEngine(rules, testLogger())

	doc := []byte(`
info:
  title: Test
`)
	diags := engine.Execute(doc)
	if len(diags) != 1 {
		t.Errorf("expected 1 diagnostic (missing description), got %d", len(diags))
	}
}

func TestEngine_SetRules(t *testing.T) {
	engine := spectral.NewEngine(nil, testLogger())

	doc := []byte(`info:
  title: Test
`)
	diags := engine.Execute(doc)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics with no rules, got %d", len(diags))
	}

	engine.SetRules([]spectral.Rule{
		{
			ID:       "info-description",
			Severity: protocol.SeverityWarning,
			Given:    []string{"$.info"},
			Then: []spectral.FunctionCall{
				{Field: "description", Function: "truthy"},
			},
		},
	})

	diags = engine.Execute(doc)
	if len(diags) != 1 {
		t.Errorf("expected 1 diagnostic after SetRules, got %d", len(diags))
	}
}
