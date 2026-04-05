package checks

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

func TestSyntaxErrorMeta(t *testing.T) {
	if syntaxErrorMeta.ID != "syntax-error" {
		t.Errorf("ID = %q", syntaxErrorMeta.ID)
	}
	if syntaxErrorMeta.Severity != ctypes.SeverityError {
		t.Errorf("Severity = %d, want Error", syntaxErrorMeta.Severity)
	}
	if !syntaxErrorMeta.Recommended {
		t.Error("expected recommended=true")
	}
}

func TestSyntaxErrorMessage(t *testing.T) {
	check := treesitter.Check{
		Pattern:  "(ERROR) @error",
		Severity: protocol.DiagnosticSeverity(ctypes.SeverityError),
		Message: func(c treesitter.Capture) string {
			text := c.Text
			if len(text) > 40 {
				text = text[:40] + "..."
			}
			return "Syntax error near '" + text + "'"
		},
	}

	msg := check.Message(treesitter.Capture{Text: "short"})
	if msg != "Syntax error near 'short'" {
		t.Errorf("unexpected message: %s", msg)
	}

	long := "this is a really long syntax error that exceeds forty characters in total"
	msg = check.Message(treesitter.Capture{Text: long})
	if len(msg) > 80 {
		t.Errorf("message not truncated: len=%d", len(msg))
	}
}
