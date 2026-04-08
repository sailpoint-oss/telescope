package plugin_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/plugin"
	"github.com/sailpoint-oss/telescope/server/rules"
)

func writeTemp(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	p := filepath.Join(dir, "rules.yaml")
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestLoadAll_NoPlugins(t *testing.T) {
	m := plugin.NewManager(testLogger())
	s := gossip.NewServer("test-server", "0.1.0")
	if err := m.LoadAll(s); err != nil {
		t.Fatalf("LoadAll with no plugins: %v", err)
	}
}

func TestLoadAll_RegistersMetadata(t *testing.T) {
	m := plugin.NewManager(testLogger())
	m.Register(&mockPlugin{
		name:    "meta-plugin",
		version: "1.0.0",
		metas: []rules.RuleMeta{
			{ID: "cov-test-meta-001", Description: "test rule for coverage"},
		},
	})

	s := gossip.NewServer("test-server", "0.1.0")
	if err := m.LoadAll(s); err != nil {
		t.Fatalf("LoadAll: %v", err)
	}

	got, ok := rules.DefaultRegistry.Get("cov-test-meta-001")
	if !ok {
		t.Fatal("expected metadata to be registered in DefaultRegistry")
	}
	if got.Description != "test rule for coverage" {
		t.Errorf("Description = %q, want %q", got.Description, "test rule for coverage")
	}
}

func TestLoadAll_RegistersChecksAndAnalyzers(t *testing.T) {
	m := plugin.NewManager(testLogger())
	m.Register(&mockPlugin{
		name:    "full-plugin",
		version: "2.0.0",
		checks: map[string]treesitter.Check{
			"cov-check": {Pattern: "(ERROR) @error"},
		},
		analyzers: map[string]treesitter.Analyzer{
			"cov-analyzer": {Scope: treesitter.ScopeFile},
		},
		metas: []rules.RuleMeta{
			{ID: "cov-test-check-002", Description: "check rule"},
			{ID: "cov-test-analyzer-002", Description: "analyzer rule"},
		},
	})

	s := gossip.NewServer("test-server", "0.1.0")
	if err := m.LoadAll(s); err != nil {
		t.Fatalf("LoadAll: %v", err)
	}

	for _, id := range []string{"cov-test-check-002", "cov-test-analyzer-002"} {
		if _, ok := rules.DefaultRegistry.Get(id); !ok {
			t.Errorf("expected meta %q to be registered", id)
		}
	}
}

func TestLoadYAMLPlugin_TreeSitterPattern(t *testing.T) {
	yml := `
name: ts-rules
rules:
  syntax-error:
    description: "Catches syntax errors"
    severity: error
    given: "(ERROR) @error"
    message: "Syntax error found"
`
	p, err := plugin.LoadYAMLPlugin(writeTemp(t, yml), testLogger())
	if err != nil {
		t.Fatalf("LoadYAMLPlugin: %v", err)
	}
	if p.Name() != "ts-rules" {
		t.Errorf("Name() = %q, want %q", p.Name(), "ts-rules")
	}
	if p.Version() != "1.0.0" {
		t.Errorf("Version() = %q, want %q", p.Version(), "1.0.0")
	}
	if len(p.Checks()) != 1 {
		t.Fatalf("expected 1 check, got %d", len(p.Checks()))
	}
	chk, ok := p.Checks()["syntax-error"]
	if !ok {
		t.Fatal("expected check with id 'syntax-error'")
	}
	if chk.Pattern != "(ERROR) @error" {
		t.Errorf("Pattern = %q, want %q", chk.Pattern, "(ERROR) @error")
	}
	if len(p.Meta()) != 1 {
		t.Errorf("expected 1 meta, got %d", len(p.Meta()))
	}
	if len(p.Analyzers()) != 0 {
		t.Errorf("expected 0 analyzers for tree-sitter rule, got %d", len(p.Analyzers()))
	}
}

func TestLoadYAMLPlugin_SpectralRule(t *testing.T) {
	yml := `
name: spectral-rules
rules:
  must-have-info:
    description: "API must have info"
    severity: warn
    given: "$.info"
    message: "Missing info object"
    then:
      - function: truthy
`
	p, err := plugin.LoadYAMLPlugin(writeTemp(t, yml), testLogger())
	if err != nil {
		t.Fatalf("LoadYAMLPlugin: %v", err)
	}
	if p.Name() != "spectral-rules" {
		t.Errorf("Name() = %q, want %q", p.Name(), "spectral-rules")
	}
	if len(p.Checks()) != 0 {
		t.Errorf("expected 0 checks for spectral rule, got %d", len(p.Checks()))
	}
	if len(p.Analyzers()) != 1 {
		t.Fatalf("expected 1 analyzer, got %d", len(p.Analyzers()))
	}
	if _, ok := p.Analyzers()["spectral-plugin-spectral-rules"]; !ok {
		keys := make([]string, 0, len(p.Analyzers()))
		for k := range p.Analyzers() {
			keys = append(keys, k)
		}
		t.Errorf("expected analyzer key 'spectral-plugin-spectral-rules', got %v", keys)
	}
}

// JSONPath given without then → isJSONPath returns true, so no check is created,
// and no then block means no spectral analyzer either.
func TestLoadYAMLPlugin_JSONPathWithoutThen(t *testing.T) {
	yml := `
name: jsonpath-no-then
rules:
  json-path-rule:
    description: "JSONPath without then"
    severity: warn
    given: "$.info.title"
    message: "Check title"
`
	p, err := plugin.LoadYAMLPlugin(writeTemp(t, yml), testLogger())
	if err != nil {
		t.Fatalf("LoadYAMLPlugin: %v", err)
	}
	if len(p.Checks()) != 0 {
		t.Errorf("expected 0 checks, got %d", len(p.Checks()))
	}
	if len(p.Analyzers()) != 0 {
		t.Errorf("expected 0 analyzers, got %d", len(p.Analyzers()))
	}
	if len(p.Meta()) != 1 {
		t.Errorf("expected 1 meta, got %d", len(p.Meta()))
	}
}

func TestLoadYAMLPlugin_MissingFile(t *testing.T) {
	_, err := plugin.LoadYAMLPlugin("/nonexistent/path/rules.yaml", testLogger())
	if err == nil {
		t.Fatal("expected error for missing file")
	}
	if !strings.Contains(err.Error(), "read yaml plugin") {
		t.Errorf("error = %q, want substring %q", err.Error(), "read yaml plugin")
	}
}

func TestLoadYAMLPlugin_InvalidYAML(t *testing.T) {
	p := writeTemp(t, "rules:\n  bad:\n    severity: [unterminated")
	_, err := plugin.LoadYAMLPlugin(p, testLogger())
	if err == nil {
		t.Fatal("expected error for invalid YAML")
	}
	if !strings.Contains(err.Error(), "parse yaml plugin") {
		t.Errorf("error = %q, want substring %q", err.Error(), "parse yaml plugin")
	}
}

func TestLoadYAMLPlugin_NameFallsBackToPath(t *testing.T) {
	yml := `
rules:
  some-rule:
    description: "A rule"
    severity: warn
    given: "(block_mapping) @bm"
    message: "Found block mapping"
`
	path := writeTemp(t, yml)
	p, err := plugin.LoadYAMLPlugin(path, testLogger())
	if err != nil {
		t.Fatalf("LoadYAMLPlugin: %v", err)
	}
	if p.Name() != path {
		t.Errorf("Name() = %q, want path %q", p.Name(), path)
	}
}
