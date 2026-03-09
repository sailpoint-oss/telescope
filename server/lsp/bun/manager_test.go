package bun

import (
	"context"
	"log/slog"
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
	// Start checks for bun on PATH but only fully connects
	// when the runner process is available. This test verifies no panic.
	_ = m.Start(ctx)
	_ = m.Available()
	m.Stop()
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
	err := m.LoadRules(context.Background(), &LoadRulesRequest{})
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}
