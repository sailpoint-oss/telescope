package sdk

import (
	"testing"

	goplugin "github.com/sailpoint-oss/telescope/server/plugin"
)

const validSpec = `openapi: "3.1.0"
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    get:
      operationId: listUsers
      summary: List users
      responses:
        "200":
          description: OK
`

const invalidSpec = `openapi: "3.1.0"
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    get:
      summary: List users
      responses:
        "200":
          description: OK
`

func makeServer(p *PluginInstance) *pluginServer {
	return &pluginServer{instance: p}
}

func TestNewPlugin(t *testing.T) {
	p := NewPlugin("test-plugin", "1.0.0")
	if p == nil {
		t.Fatal("expected non-nil plugin")
	}
	if p.name != "test-plugin" {
		t.Fatalf("expected name 'test-plugin', got %q", p.name)
	}
	if p.version != "1.0.0" {
		t.Fatalf("expected version '1.0.0', got %q", p.version)
	}
}

func TestRule_Register(t *testing.T) {
	p := NewPlugin("test-plugin", "1.0.0")

	Rule("require-operation-id", Meta{
		Description: "Operations must have operationId",
		Severity:    Error,
		Category:    Naming,
		Recommended: true,
	}).Operations(func(path, method string, op *Operation, r *Reporter) {
		if op.OperationID == "" {
			r.At(op.Loc, "%s %s missing operationId", method, path)
		}
	}).Register(p)

	server := makeServer(p)
	meta, err := server.GetMeta()
	if err != nil {
		t.Fatalf("GetMeta error: %v", err)
	}
	if len(meta.Rules) != 1 {
		t.Fatalf("expected 1 rule, got %d", len(meta.Rules))
	}
	if meta.Rules[0].ID != "require-operation-id" {
		t.Fatalf("expected rule ID 'require-operation-id', got %q", meta.Rules[0].ID)
	}
	if meta.Rules[0].Description != "Operations must have operationId" {
		t.Fatalf("unexpected description: %q", meta.Rules[0].Description)
	}
	if meta.Rules[0].Severity != "error" {
		t.Fatalf("expected severity 'error', got %q", meta.Rules[0].Severity)
	}
}

func TestRule_Analyze_NoViolations(t *testing.T) {
	p := NewPlugin("test-plugin", "1.0.0")

	Rule("require-operation-id", Meta{
		Description: "Operations must have operationId",
		Severity:    Error,
		Category:    Naming,
		Recommended: true,
	}).Operations(func(path, method string, op *Operation, r *Reporter) {
		if op.OperationID == "" {
			r.At(op.Loc, "%s %s missing operationId", method, path)
		}
	}).Register(p)

	server := makeServer(p)
	resp, err := server.Analyze(&goplugin.AnalyzeRequest{
		URI:     "file:///test.yaml",
		Content: []byte(validSpec),
	})
	if err != nil {
		t.Fatalf("Analyze error: %v", err)
	}
	if len(resp.Diagnostics) != 0 {
		t.Fatalf("expected 0 diagnostics for valid spec, got %d", len(resp.Diagnostics))
	}
}

func TestRule_Analyze_WithViolations(t *testing.T) {
	p := NewPlugin("test-plugin", "1.0.0")

	Rule("require-operation-id", Meta{
		Description: "Operations must have operationId",
		Severity:    Error,
		Category:    Naming,
		Recommended: true,
	}).Operations(func(path, method string, op *Operation, r *Reporter) {
		if op.OperationID == "" {
			r.At(op.Loc, "%s %s missing operationId", method, path)
		}
	}).Register(p)

	server := makeServer(p)
	resp, err := server.Analyze(&goplugin.AnalyzeRequest{
		URI:     "file:///test.yaml",
		Content: []byte(invalidSpec),
	})
	if err != nil {
		t.Fatalf("Analyze error: %v", err)
	}
	if len(resp.Diagnostics) == 0 {
		t.Fatal("expected diagnostics for missing operationId, got 0")
	}
	d := resp.Diagnostics[0]
	if d.Severity != "error" {
		t.Fatalf("expected 'error' severity, got %q", d.Severity)
	}
	if d.Source == "" {
		t.Fatal("expected non-empty source")
	}
}

func TestMultipleRules_GetMeta(t *testing.T) {
	p := NewPlugin("multi-rules", "1.0.0")

	Rule("require-operation-id", Meta{
		Description: "Require operationId",
		Severity:    Error,
		Category:    Naming,
	}).Operations(func(path, method string, op *Operation, r *Reporter) {
		if op.OperationID == "" {
			r.At(op.Loc, "missing operationId")
		}
	}).Register(p)

	Rule("require-summary", Meta{
		Description: "Require summary",
		Severity:    Warn,
		Category:    Documentation,
	}).Operations(func(path, method string, op *Operation, r *Reporter) {
		if op.Summary == "" {
			r.At(op.Loc, "missing summary")
		}
	}).Register(p)

	server := makeServer(p)
	meta, err := server.GetMeta()
	if err != nil {
		t.Fatalf("GetMeta error: %v", err)
	}
	if len(meta.Rules) != 2 {
		t.Fatalf("expected 2 rules, got %d", len(meta.Rules))
	}

	ids := make(map[string]bool)
	for _, r := range meta.Rules {
		ids[r.ID] = true
	}
	if !ids["require-operation-id"] || !ids["require-summary"] {
		t.Fatalf("expected both rule IDs, got %v", ids)
	}
}

func TestMultipleRules_Analyze_AggregatesDiagnostics(t *testing.T) {
	p := NewPlugin("multi-rules", "1.0.0")

	Rule("require-operation-id-agg", Meta{
		Description: "Require operationId",
		Severity:    Error,
		Category:    Naming,
	}).Operations(func(path, method string, op *Operation, r *Reporter) {
		if op.OperationID == "" {
			r.At(op.Loc, "missing operationId")
		}
	}).Register(p)

	noSummarySpec := `openapi: "3.1.0"
info:
  title: Test
  version: 1.0.0
paths:
  /users:
    get:
      responses:
        "200":
          description: OK
`

	server := makeServer(p)
	resp, err := server.Analyze(&goplugin.AnalyzeRequest{
		URI:     "file:///test.yaml",
		Content: []byte(noSummarySpec),
	})
	if err != nil {
		t.Fatalf("Analyze error: %v", err)
	}
	if len(resp.Diagnostics) < 1 {
		t.Fatal("expected at least 1 diagnostic")
	}
}

func TestRule_PathsVisitor(t *testing.T) {
	p := NewPlugin("test", "1.0.0")

	Rule("no-trailing-slash", Meta{
		Description: "No trailing slashes",
		Severity:    Warn,
		Category:    Paths,
	}).Paths(func(path string, item *PathItem, r *Reporter) {
		if len(path) > 1 && path[len(path)-1] == '/' {
			r.At(item.Loc, "path %s has trailing slash", path)
		}
	}).Register(p)

	trailingSlashSpec := `openapi: "3.1.0"
info:
  title: Test
  version: 1.0.0
paths:
  /users/:
    get:
      operationId: listUsers
      responses:
        "200":
          description: OK
`

	server := makeServer(p)
	resp, err := server.Analyze(&goplugin.AnalyzeRequest{
		URI:     "file:///test.yaml",
		Content: []byte(trailingSlashSpec),
	})
	if err != nil {
		t.Fatalf("Analyze error: %v", err)
	}
	if len(resp.Diagnostics) == 0 {
		t.Fatal("expected diagnostics for trailing slash")
	}
}

func TestRule_DocumentVisitor(t *testing.T) {
	p := NewPlugin("test", "1.0.0")

	Rule("require-info-title", Meta{
		Description: "Info must have title",
		Severity:    Error,
		Category:    Documentation,
	}).Document(func(doc *Document, r *Reporter) {
		if doc.Info == nil || doc.Info.Title == "" {
			r.At(doc.Loc, "missing info.title")
		}
	}).Register(p)

	noTitleSpec := `openapi: "3.1.0"
info:
  version: 1.0.0
paths: {}
`

	server := makeServer(p)
	resp, err := server.Analyze(&goplugin.AnalyzeRequest{
		URI:     "file:///test.yaml",
		Content: []byte(noTitleSpec),
	})
	if err != nil {
		t.Fatalf("Analyze error: %v", err)
	}
	if len(resp.Diagnostics) == 0 {
		t.Fatal("expected diagnostic for missing title")
	}
}

func TestSeverityConversions(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"error", "error"},
		{"warn", "warn"},
		{"warning", "warn"},
		{"info", "info"},
		{"information", "info"},
		{"hint", "hint"},
		{"unknown", "warn"},
	}

	for _, tt := range tests {
		sev := stringToSeverity(tt.input)
		result := severityFromInt(int(sev))
		if result != tt.expected {
			t.Errorf("stringToSeverity(%q) -> severityFromInt = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestPluginSource_FallsBackToPluginName(t *testing.T) {
	result := pluginSource("", "my-plugin", "my-rule")
	if result != "my-plugin" {
		t.Fatalf("expected 'my-plugin', got %q", result)
	}
}

func TestPluginSource_UsesExplicitSource(t *testing.T) {
	result := pluginSource("custom-source", "my-plugin", "my-rule")
	if result != "custom-source" {
		t.Fatalf("expected 'custom-source', got %q", result)
	}
}

func TestSeverityAliases(t *testing.T) {
	if Error != SeverityError {
		t.Fatal("Error != SeverityError")
	}
	if Warn != SeverityWarning {
		t.Fatal("Warn != SeverityWarning")
	}
	if Hint != SeverityHint {
		t.Fatal("Hint != SeverityHint")
	}
}
