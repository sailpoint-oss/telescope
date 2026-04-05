package spectral_test

import (
	"log/slog"
	"os"
	"strings"
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
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
			Severity: ctypes.SeverityWarning,
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
			Severity: ctypes.SeverityError,
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
			Severity: ctypes.SeverityWarning,
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
			Severity: ctypes.SeverityError,
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
			Severity: ctypes.SeverityWarning,
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
			Severity: ctypes.SeverityWarning,
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

func TestEngine_Execute_UnknownFunction(t *testing.T) {
	rules := []spectral.Rule{
		{
			ID:       "unknown-fn",
			Severity: ctypes.SeverityWarning,
			Given:    []string{"$.info"},
			Then: []spectral.FunctionCall{
				{Function: "doesNotExist"},
			},
		},
	}

	engine := spectral.NewEngine(rules, testLogger())

	doc := []byte(`
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0"
`)
	diags := engine.Execute(doc)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for unknown function, got %d", len(diags))
	}
}

func TestEngine_Execute_MalformedJSONPath(t *testing.T) {
	rules := []spectral.Rule{
		{
			ID:       "bad-path",
			Severity: ctypes.SeverityWarning,
			Given:    []string{"$[[[invalid"},
			Then: []spectral.FunctionCall{
				{Function: "truthy"},
			},
		},
	}

	engine := spectral.NewEngine(rules, testLogger())

	doc := []byte(`
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0"
`)
	diags := engine.Execute(doc)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for malformed JSONPath, got %d", len(diags))
	}
}

func TestEngine_Execute_Casing(t *testing.T) {
	rules := []spectral.Rule{
		{
			ID:       "kebab-paths",
			Message:  "Path keys must be kebab-case",
			Severity: ctypes.SeverityWarning,
			Given:    []string{"$.info.title"},
			Then: []spectral.FunctionCall{
				{Function: "casing", FunctionOptions: map[string]interface{}{
					"type": "kebab",
				}},
			},
		},
	}

	engine := spectral.NewEngine(rules, testLogger())

	t.Run("camelCase triggers diagnostic", func(t *testing.T) {
		doc := []byte(`
info:
  title: myApiName
`)
		diags := engine.Execute(doc)
		if len(diags) != 1 {
			t.Errorf("expected 1 diagnostic for camelCase, got %d", len(diags))
		}
	})

	t.Run("kebab-case passes", func(t *testing.T) {
		doc := []byte(`
info:
  title: my-api-name
`)
		diags := engine.Execute(doc)
		if len(diags) != 0 {
			t.Errorf("expected 0 diagnostics for kebab-case, got %d", len(diags))
		}
	})
}

func TestEngine_Execute_Defined(t *testing.T) {
	rules := []spectral.Rule{
		{
			ID:       "info-description-defined",
			Message:  "Info must have a description",
			Severity: ctypes.SeverityWarning,
			Given:    []string{"$.info"},
			Then: []spectral.FunctionCall{
				{Field: "description", Function: "defined"},
			},
		},
	}

	engine := spectral.NewEngine(rules, testLogger())

	t.Run("missing field triggers diagnostic", func(t *testing.T) {
		doc := []byte(`
info:
  title: Test API
`)
		diags := engine.Execute(doc)
		if len(diags) != 1 {
			t.Errorf("expected 1 diagnostic for missing description, got %d", len(diags))
		}
		if len(diags) > 0 && diags[0].Code != "info-description-defined" {
			t.Errorf("code = %v, want info-description-defined", diags[0].Code)
		}
	})

	t.Run("present field passes", func(t *testing.T) {
		doc := []byte(`
info:
  title: Test API
  description: A test API
`)
		diags := engine.Execute(doc)
		if len(diags) != 0 {
			t.Errorf("expected 0 diagnostics when description exists, got %d", len(diags))
		}
	})
}

func TestEngine_Execute_EmptyDocument(t *testing.T) {
	rules := []spectral.Rule{
		{
			ID:       "any-rule",
			Severity: ctypes.SeverityWarning,
			Given:    []string{"$.info"},
			Then: []spectral.FunctionCall{
				{Function: "truthy"},
			},
		},
	}

	engine := spectral.NewEngine(rules, testLogger())

	t.Run("empty bytes", func(t *testing.T) {
		diags := engine.Execute([]byte{})
		if diags != nil && len(diags) != 0 {
			t.Errorf("expected no diagnostics on empty input, got %d", len(diags))
		}
	})

	t.Run("whitespace only", func(t *testing.T) {
		diags := engine.Execute([]byte("   \n\n  "))
		if diags != nil && len(diags) != 0 {
			t.Errorf("expected no diagnostics on whitespace input, got %d", len(diags))
		}
	})
}

func TestEngine_Execute_MessageTemplate(t *testing.T) {
	rules := []spectral.Rule{
		{
			ID:       "version-format",
			Message:  "{{property}} has invalid value {{value}}",
			Severity: ctypes.SeverityError,
			Given:    []string{"$.info"},
			Then: []spectral.FunctionCall{
				{Field: "version", Function: "pattern", FunctionOptions: map[string]interface{}{
					"match": `^[0-9]+\.[0-9]+\.[0-9]+$`,
				}},
			},
		},
	}

	engine := spectral.NewEngine(rules, testLogger())

	doc := []byte(`
info:
  title: Test
  version: latest
`)
	diags := engine.Execute(doc)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(diags))
	}
	msg := diags[0].Message
	if !strings.Contains(msg, "version") {
		t.Errorf("expected message to contain 'version', got %q", msg)
	}
	if !strings.Contains(msg, "latest") {
		t.Errorf("expected message to contain 'latest', got %q", msg)
	}
}
