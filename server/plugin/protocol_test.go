package plugin_test

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/plugin"
)

func TestPluginRuleMeta(t *testing.T) {
	meta := plugin.PluginRuleMeta{
		ID:          "test-rule",
		Description: "Test description",
		Severity:    "warn",
		Category:    "testing",
		Recommended: true,
	}

	if meta.ID != "test-rule" {
		t.Errorf("ID = %q, want %q", meta.ID, "test-rule")
	}
}

func TestAnalyzeRequest(t *testing.T) {
	req := &plugin.AnalyzeRequest{
		URI:        "file:///test.yaml",
		Content:    []byte("openapi: 3.1.0"),
		LanguageID: "yaml",
	}

	if req.URI != "file:///test.yaml" {
		t.Errorf("URI mismatch")
	}
	if string(req.Content) != "openapi: 3.1.0" {
		t.Errorf("Content mismatch")
	}
}

func TestPluginDiagnostic(t *testing.T) {
	d := plugin.PluginDiagnostic{
		StartLine: 1,
		StartChar: 0,
		EndLine:   1,
		EndChar:   10,
		Severity:  "error",
		Code:      "test-code",
		Message:   "test message",
		Source:    "test-plugin",
	}

	if d.StartLine != 1 {
		t.Errorf("StartLine = %d, want 1", d.StartLine)
	}
	if d.Severity != "error" {
		t.Errorf("Severity = %q, want %q", d.Severity, "error")
	}
}
