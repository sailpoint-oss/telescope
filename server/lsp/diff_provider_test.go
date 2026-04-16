package lsp

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/diff"
)

func TestBreakingChangeDiagnostics_nil(t *testing.T) {
	if d := breakingChangeDiagnostics(nil); len(d) != 0 {
		t.Fatalf("got %v", d)
	}
	if d := breakingChangeDiagnostics(&diff.Result{}); len(d) != 0 {
		t.Fatalf("got %v", d)
	}
}
