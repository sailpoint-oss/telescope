package bun

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

func TestNewManager(t *testing.T) {
	m := NewManager(slog.Default())
	if m == nil {
		t.Fatal("NewManager returned nil")
	}
	if m.logger == nil {
		t.Error("logger should not be nil")
	}
	if m.pending == nil {
		t.Error("pending map should be initialized")
	}
}

func TestAvailableReturnsFalseBeforeStart(t *testing.T) {
	m := NewManager(slog.Default())
	if m.Available() {
		t.Error("Available should be false before Start")
	}
}

func TestConvertDiagnostics(t *testing.T) {
	tests := []struct {
		name     string
		input    []SidecarDiagnostic
		expected []ctypes.Diagnostic
	}{
		{
			name:     "empty",
			input:    nil,
			expected: nil,
		},
		{
			name:     "empty slice",
			input:    []SidecarDiagnostic{},
			expected: nil,
		},
		{
			name: "single diagnostic",
			input: []SidecarDiagnostic{
				{
					StartLine: 1,
					StartChar: 2,
					EndLine:   3,
					EndChar:   4,
					Severity:  1,
					Code:      "test-code",
					Message:   "test message",
					Source:    "bun",
				},
			},
			expected: []ctypes.Diagnostic{
				{
					Range: ctypes.Range{
						Start: ctypes.Position{Line: 1, Character: 2},
						End:   ctypes.Position{Line: 3, Character: 4},
					},
					Severity: ctypes.SeverityError,
					Code:     "test-code",
					Message:  "test message",
					Source:   "bun",
				},
			},
		},
		{
			name: "multiple severities",
			input: []SidecarDiagnostic{
				{StartLine: 0, StartChar: 0, EndLine: 0, EndChar: 1, Severity: 2, Code: "warn", Message: "w", Source: "bun"},
				{StartLine: 1, StartChar: 0, EndLine: 1, EndChar: 1, Severity: 3, Code: "info", Message: "i", Source: "bun"},
			},
			expected: []ctypes.Diagnostic{
				{
					Range:    ctypes.Range{Start: ctypes.Position{Line: 0, Character: 0}, End: ctypes.Position{Line: 0, Character: 1}},
					Severity: ctypes.SeverityWarning,
					Code:     "warn",
					Message:  "w",
					Source:   "bun",
				},
				{
					Range:    ctypes.Range{Start: ctypes.Position{Line: 1, Character: 0}, End: ctypes.Position{Line: 1, Character: 1}},
					Severity: ctypes.SeverityInfo,
					Code:     "info",
					Message:  "i",
					Source:   "bun",
				},
			},
		},
		{
			name: "invalid severity defaults to warning",
			input: []SidecarDiagnostic{
				{StartLine: 0, StartChar: 0, EndLine: 0, EndChar: 1, Severity: 99, Code: "x", Message: "x", Source: "bun"},
			},
			expected: []ctypes.Diagnostic{
				{
					Range:    ctypes.Range{Start: ctypes.Position{Line: 0, Character: 0}, End: ctypes.Position{Line: 0, Character: 1}},
					Severity: ctypes.SeverityWarning,
					Code:     "x",
					Message:  "x",
					Source:   "bun",
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := convertDiagnostics(tt.input)
			if len(got) != len(tt.expected) {
				t.Fatalf("got %d diagnostics, want %d", len(got), len(tt.expected))
			}
			for i := range got {
				g, e := got[i], tt.expected[i]
				if g.Range.Start.Line != e.Range.Start.Line || g.Range.Start.Character != e.Range.Start.Character {
					t.Errorf("diag[%d].Range.Start: got %+v, want %+v", i, g.Range.Start, e.Range.Start)
				}
				if g.Range.End.Line != e.Range.End.Line || g.Range.End.Character != e.Range.End.Character {
					t.Errorf("diag[%d].Range.End: got %+v, want %+v", i, g.Range.End, e.Range.End)
				}
				if g.Severity != e.Severity {
					t.Errorf("diag[%d].Severity: got %v, want %v", i, g.Severity, e.Severity)
				}
				if g.Code != e.Code {
					t.Errorf("diag[%d].Code: got %q, want %q", i, g.Code, e.Code)
				}
				if g.Message != e.Message {
					t.Errorf("diag[%d].Message: got %q, want %q", i, g.Message, e.Message)
				}
				if g.Source != e.Source {
					t.Errorf("diag[%d].Source: got %q, want %q", i, g.Source, e.Source)
				}
			}
		})
	}
}

func TestStartSetsAvailableWhenBunOnPath(t *testing.T) {
	m := NewManager(slog.Default())
	ctx := context.Background()
	// Start only marks available when Bun is installed and the bundled runner can
	// be located. This test verifies the unavailable path is still well-behaved.
	_ = m.Start(ctx)
	_ = m.Available()
	m.Stop()
}

func TestFindBundledRunnerScriptUsesOverride(t *testing.T) {
	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "runner.js")
	if err := os.WriteFile(scriptPath, []byte("console.log('ok')\n"), 0o600); err != nil {
		t.Fatalf("write runner script: %v", err)
	}

	t.Setenv("TELESCOPE_BUN_RUNNER_PATH", scriptPath)

	got, err := findBundledRunnerScript()
	if err != nil {
		t.Fatalf("findBundledRunnerScript: %v", err)
	}
	if got != scriptPath {
		t.Fatalf("got %q, want %q", got, scriptPath)
	}
}

func TestFindBundledRunnerScriptRejectsMissingOverride(t *testing.T) {
	t.Setenv("TELESCOPE_BUN_RUNNER_PATH", filepath.Join(t.TempDir(), "missing-runner.js"))

	if _, err := findBundledRunnerScript(); err == nil {
		t.Fatal("expected missing override to fail")
	}
}

func TestStartLeavesManagerUnavailableWhenBunMissing(t *testing.T) {
	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "runner.js")
	if err := os.WriteFile(scriptPath, []byte("console.log('ok')\n"), 0o600); err != nil {
		t.Fatalf("write runner script: %v", err)
	}

	t.Setenv("TELESCOPE_BUN_RUNNER_PATH", scriptPath)
	t.Setenv("PATH", "")

	m := NewManager(slog.Default())
	if err := m.Start(context.Background()); err != nil {
		t.Fatalf("Start should degrade without returning an error, got %v", err)
	}
	if m.Available() {
		t.Fatal("manager should remain unavailable when Bun is missing")
	}
}

func TestStopClearsAvailable(t *testing.T) {
	m := NewManager(slog.Default())
	m.available.Store(true)
	m.Stop()
	if m.Available() {
		t.Error("Available should be false after Stop")
	}
}

func TestRunRulesReturnNilWhenNotAvailable(t *testing.T) {
	m := NewManager(slog.Default())
	resp, err := m.RunRules(context.Background(), &RunRulesRequest{DocumentURI: "test"})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if resp != nil {
		t.Error("expected nil response when not available")
	}
}

func TestLoadRulesReturnNilWhenNotAvailable(t *testing.T) {
	m := NewManager(slog.Default())
	err := m.LoadRules(context.Background(), &LoadRulesRequest{
		Rules: []RuleConfig{{
			ID:   "example-custom-openapi-rule",
			Path: "/tmp/example-custom-openapi-rule.ts",
			Kind: "openapi",
		}},
	})
	if err == nil {
		t.Fatal("expected error when sidecar is not available")
	}
}

func TestSendReturnsErrorWhenConnMissing(t *testing.T) {
	m := NewManager(slog.Default())
	err := m.send(&Envelope{ID: "1", Type: MsgPing})
	if err == nil {
		t.Fatal("expected send to fail when connection is missing")
	}
}

func TestLogWriterTrimsAndLogs(t *testing.T) {
	var buf strings.Builder
	logger := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))
	w := &logWriter{logger: logger, level: slog.LevelDebug}
	msg := []byte("  sidecar says hello  \n")
	n, err := w.Write(msg)
	if err != nil || n != len(msg) {
		t.Fatalf("Write: n=%d err=%v", n, err)
	}
	emptyish := []byte("   \t  ")
	n2, err2 := w.Write(emptyish)
	if err2 != nil || n2 != len(emptyish) {
		t.Fatalf("Write whitespace-only: n=%d err=%v", n2, err2)
	}
	if buf.Len() == 0 {
		t.Fatal("expected log output for non-empty trimmed message")
	}
}

func TestFindBundledRunnerScriptDiscoversBundledDist(t *testing.T) {
	// go test is normally invoked from server/ (e.g. CI: cd server && go test ./...).
	// findBundledRunnerScript joins candidates against os.Getwd().
	t.Setenv("TELESCOPE_BUN_RUNNER_PATH", "")
	got, err := findBundledRunnerScript()
	if err != nil {
		t.Skip("bundled runner dist not found from current working directory:", err)
	}
	wantSub := filepath.Join("lsp", "bun", "runner", "dist", "runner.js")
	if !strings.Contains(got, wantSub) {
		t.Fatalf("got %q, want path containing %q", got, wantSub)
	}
}
