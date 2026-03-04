package lsp

import (
	"context"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/LukasParke/gossip/protocol"
)

func skipIfNoNode(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("Node.js not available; skipping child LSP test")
	}
}

func skipIfNoYAMLLS(t *testing.T) {
	t.Helper()
	skipIfNoNode(t)
	if _, err := exec.LookPath("yaml-language-server"); err != nil {
		t.Skip("yaml-language-server not available")
	}
}

func skipIfNoJSONLS(t *testing.T) {
	t.Helper()
	skipIfNoNode(t)
	if _, err := exec.LookPath("vscode-json-language-server"); err != nil {
		t.Skip("vscode-json-language-server not available")
	}
}

func TestChildLSPLinter_NewAndDefaults(t *testing.T) {
	l := NewChildLSPLinter(nil)
	if l == nil {
		t.Fatal("NewChildLSPLinter returned nil")
	}
	if l.handlers == nil {
		t.Error("handlers map not initialized")
	}
}

func TestChildLSPLinter_LintFileNoClient(t *testing.T) {
	l := NewChildLSPLinter(nil)
	diags := l.LintFile(context.Background(), "file:///test.yaml", "yaml", []byte("foo: bar"))
	if diags != nil {
		t.Errorf("expected nil diagnostics when no clients started, got %d", len(diags))
	}
}

func TestChildLSPLinter_LintFileUnknownLang(t *testing.T) {
	l := NewChildLSPLinter(nil)
	diags := l.LintFile(context.Background(), "file:///test.txt", "text", []byte("hello"))
	if diags != nil {
		t.Errorf("expected nil diagnostics for unknown language, got %d", len(diags))
	}
}

func TestChildLSPLinter_ClientForLang(t *testing.T) {
	l := NewChildLSPLinter(nil)
	if l.clientForLang("yaml") != nil {
		t.Error("expected nil yaml client before Start")
	}
	if l.clientForLang("json") != nil {
		t.Error("expected nil json client before Start")
	}
	if l.clientForLang("unknown") != nil {
		t.Error("expected nil for unknown language")
	}
}

func TestChildLSPLinter_YAMLSyntaxError(t *testing.T) {
	skipIfNoYAMLLS(t)

	l := NewChildLSPLinter(nil)
	ctx := context.Background()
	if err := l.Start(ctx, "file:///tmp"); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer l.Stop(ctx)

	content := []byte("foo:\n  bar: baz\n bad_indent: oops\n")
	diags := l.LintFile(ctx, "file:///tmp/test.yaml", "yaml", content)

	if len(diags) == 0 {
		t.Error("expected at least one diagnostic for YAML syntax error")
	}
}

func TestChildLSPLinter_YAMLValidDocument(t *testing.T) {
	skipIfNoYAMLLS(t)

	l := NewChildLSPLinter(nil)
	ctx := context.Background()
	if err := l.Start(ctx, "file:///tmp"); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer l.Stop(ctx)

	content := []byte("openapi: \"3.0.0\"\ninfo:\n  title: Test\n  version: \"1.0\"\npaths: {}\n")
	diags := l.LintFile(ctx, "file:///tmp/valid.yaml", "yaml", content)

	for _, d := range diags {
		if d.Severity == protocol.SeverityError {
			t.Errorf("unexpected error diagnostic on valid YAML: %s", d.Message)
		}
	}
}

func TestChildLSPLinter_JSONSyntaxError(t *testing.T) {
	skipIfNoJSONLS(t)

	l := NewChildLSPLinter(nil)
	ctx := context.Background()
	if err := l.Start(ctx, "file:///tmp"); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer l.Stop(ctx)

	content := []byte(`{"openapi": "3.0.0", "info": {"title": "T", "version": "1"},}`)
	diags := l.LintFile(ctx, "file:///tmp/test.json", "json", content)

	if len(diags) == 0 {
		t.Error("expected at least one diagnostic for JSON trailing comma")
	}
}

func TestChildLSPLinter_JSONValidDocument(t *testing.T) {
	skipIfNoJSONLS(t)

	l := NewChildLSPLinter(nil)
	ctx := context.Background()
	if err := l.Start(ctx, "file:///tmp"); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer l.Stop(ctx)

	content := []byte(`{"openapi": "3.0.0", "info": {"title": "Test", "version": "1"}, "paths": {}}`)
	diags := l.LintFile(ctx, "file:///tmp/valid.json", "json", content)

	for _, d := range diags {
		if d.Severity == protocol.SeverityError {
			t.Errorf("unexpected error diagnostic on valid JSON: %s", d.Message)
		}
	}
}

func TestChildLSPLinter_MultipleFiles(t *testing.T) {
	skipIfNoYAMLLS(t)

	l := NewChildLSPLinter(nil)
	ctx := context.Background()
	if err := l.Start(ctx, "file:///tmp"); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer l.Stop(ctx)

	good := []byte("openapi: \"3.0.0\"\ninfo:\n  title: Test\n  version: \"1.0\"\npaths: {}\n")
	bad := []byte("foo:\n  bar: baz\n bad_indent: oops\n")

	diags1 := l.LintFile(ctx, "file:///tmp/good.yaml", "yaml", good)
	diags2 := l.LintFile(ctx, "file:///tmp/bad.yaml", "yaml", bad)

	for _, d := range diags1 {
		if d.Severity == protocol.SeverityError {
			t.Errorf("unexpected error in good.yaml: %s", d.Message)
		}
	}
	if len(diags2) == 0 {
		t.Error("expected diagnostics for bad.yaml")
	}
}

func TestChildLSPLinter_ContextCancellation(t *testing.T) {
	l := NewChildLSPLinter(nil)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	start := time.Now()
	diags := l.LintFile(ctx, "file:///tmp/test.yaml", "yaml", []byte("foo: bar"))
	elapsed := time.Since(start)

	if diags != nil {
		t.Error("expected nil diagnostics with cancelled context")
	}
	if elapsed > 2*time.Second {
		t.Errorf("LintFile should return quickly on cancelled context, took %v", elapsed)
	}
}

func TestChildLSPLinter_BrokenYAMLProducesDiags(t *testing.T) {
	skipIfNoYAMLLS(t)

	l := NewChildLSPLinter(nil)
	ctx := context.Background()
	if err := l.Start(ctx, "file:///tmp"); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer l.Stop(ctx)

	content := []byte(":\n  - {\n  invalid\n")
	diags := l.LintFile(ctx, "file:///tmp/broken.yaml", "yaml", content)

	found := false
	for _, d := range diags {
		if d.Severity == protocol.SeverityError {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected error-severity diagnostic for severely broken YAML")
	}
}

func TestChildLSPLinter_BrokenJSONProducesDiags(t *testing.T) {
	skipIfNoJSONLS(t)

	l := NewChildLSPLinter(nil)
	ctx := context.Background()
	if err := l.Start(ctx, "file:///tmp"); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer l.Stop(ctx)

	content := []byte(`{invalid json`)
	diags := l.LintFile(ctx, "file:///tmp/broken.json", "json", content)

	found := false
	for _, d := range diags {
		if d.Severity == protocol.SeverityError {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected error-severity diagnostic for severely broken JSON")
	}
}

func TestChildLSPLinter_StopIdempotent(t *testing.T) {
	l := NewChildLSPLinter(nil)
	ctx := context.Background()
	l.Stop(ctx)
	l.Stop(ctx)
}

func TestLintFile_ChildLSPNil(t *testing.T) {
	l := NewChildLSPLinter(nil)
	if got := l.clientForLang("yaml"); got != nil {
		t.Error("expected nil client")
	}
	if got := l.clientForLang("json"); got != nil {
		t.Error("expected nil client")
	}
	if got := l.clientForLang("YAML"); got != nil {
		t.Error("expected nil for upper-case with no clients")
	}
}

func TestChildLSPLinter_DiagSourcePresent(t *testing.T) {
	skipIfNoYAMLLS(t)

	l := NewChildLSPLinter(nil)
	ctx := context.Background()
	if err := l.Start(ctx, "file:///tmp"); err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer l.Stop(ctx)

	content := []byte("foo:\n  bar: baz\n bad_indent: oops\n")
	diags := l.LintFile(ctx, "file:///tmp/src.yaml", "yaml", content)

	if len(diags) == 0 {
		t.Fatal("expected diagnostics")
	}

	for _, d := range diags {
		if d.Source == "" {
			t.Errorf("diagnostic with empty Source: %q", d.Message)
		}
		lower := strings.ToLower(d.Source)
		if !strings.Contains(lower, "yaml") && d.Source != "" {
			t.Logf("diagnostic source: %q message: %q", d.Source, d.Message)
		}
	}
}
