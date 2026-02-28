package lint_test

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lint"
)

func TestFilterIgnored_IgnoreAll(t *testing.T) {
	text := `openapi: "3.0.0"
# x-telescope-ignore
info:
  title: Test
`
	diags := []protocol.Diagnostic{
		{Range: protocol.Range{Start: protocol.Position{Line: 2}}, Code: "info-required", Message: "test"},
	}

	filtered := lint.FilterIgnored(diags, text)
	if len(filtered) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(filtered))
	}
}

func TestFilterIgnored_IgnoreSpecific(t *testing.T) {
	text := `openapi: "3.0.0"
# x-telescope-ignore: info-required
info:
  title: Test
`
	diags := []protocol.Diagnostic{
		{Range: protocol.Range{Start: protocol.Position{Line: 2}}, Code: "info-required", Message: "test"},
		{Range: protocol.Range{Start: protocol.Position{Line: 2}}, Code: "other-rule", Message: "test"},
	}

	filtered := lint.FilterIgnored(diags, text)
	if len(filtered) != 1 {
		t.Errorf("expected 1 diagnostic, got %d", len(filtered))
	}
	if filtered[0].Code != "other-rule" {
		t.Errorf("expected 'other-rule', got %v", filtered[0].Code)
	}
}

func TestFilterIgnored_NoDirectives(t *testing.T) {
	text := `openapi: "3.0.0"
info:
  title: Test
`
	diags := []protocol.Diagnostic{
		{Range: protocol.Range{Start: protocol.Position{Line: 1}}, Code: "test", Message: "test"},
	}

	filtered := lint.FilterIgnored(diags, text)
	if len(filtered) != 1 {
		t.Errorf("expected 1 diagnostic, got %d", len(filtered))
	}
}
