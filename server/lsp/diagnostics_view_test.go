package lsp_test

import (
	"fmt"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/LukasParke/gossip/gossiptest"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/lsp"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

func severityString(s protocol.DiagnosticSeverity) string {
	switch s {
	case protocol.SeverityError:
		return "ERROR"
	case protocol.SeverityWarning:
		return "WARN"
	case protocol.SeverityInformation:
		return "INFO"
	case protocol.SeverityHint:
		return "HINT"
	default:
		return fmt.Sprintf("SEV(%d)", s)
	}
}

// TestViewDiagnostics opens each test spec in the full Telescope LSP and prints
// every diagnostic produced. Run with:
//
//	go test -v -run TestViewDiagnostics ./lsp/
//
// To see diagnostics for a specific spec:
//
//	go test -v -run 'TestViewDiagnostics/test-errors' ./lsp/
func TestViewDiagnostics(t *testing.T) {
	// Skip XLarge specs by default (slow). Use -run to include them explicitly.
	skipXLarge := os.Getenv("INCLUDE_XLARGE") == ""

	for _, spec := range specs.All() {
		if skipXLarge && spec.Size == specs.XLarge {
			continue
		}

		t.Run(spec.Name, func(t *testing.T) {
			logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
			cfg := config.DefaultConfig()
			s, cleanup := lsp.NewServer(cfg, logger)
			t.Cleanup(cleanup)
			client := gossiptest.NewClient(t, s)

			uri := spec.URI()
			client.OpenWithLanguage(uri, spec.LanguageID(), string(spec.Content))

			diags := client.WaitForDiagnostics(uri, 10*time.Second)

			t.Logf("=== %s (%s, %d lines, %s) ===", spec.Name, spec.Size, spec.Lines, spec.Version)
			if len(diags) == 0 {
				t.Logf("  (no diagnostics)")
			}
			for _, d := range diags {
				code := ""
				if d.Code != nil {
					code = fmt.Sprintf("[%v]", d.Code)
				}
				t.Logf("  %d:%d %s %s %s",
					d.Range.Start.Line+1,
					d.Range.Start.Character+1,
					severityString(d.Severity),
					code,
					d.Message,
				)
			}
			t.Logf("  Total: %d diagnostics", len(diags))

			// Regression: YAML specs tagged as having issues should produce diagnostics.
			// Syntax-only malformed docs are excluded because the editor's YAML/JSON
			// language services own that feedback.
			expectDiags := false
			if spec.Format != openapi.FormatJSON && spec.Name != "invalid-yaml-syntax" {
				for _, tag := range spec.Tags {
					if tag == "invalid" || tag == "warnings" || tag == "duplicates" || tag == "ascii" {
						expectDiags = true
						break
					}
				}
			}
			if expectDiags && len(diags) == 0 {
				t.Errorf("spec %q has tags %v — expected diagnostics but got none", spec.Name, spec.Tags)
			}
		})
	}
}

// TestViewDiagnosticsForSpec opens a single specific spec and prints diagnostics.
// Useful for targeted debugging. Change the specName constant to test different files.
func TestViewDiagnosticsForSpec(t *testing.T) {
	specNames := []string{
		"test-errors",
		"test-duplicate-operation-ids",
		"custom-openapi-invalid",
		"test-ascii-errors",
		"missing-path-parameters",
	}

	for _, specName := range specNames {
		t.Run(specName, func(t *testing.T) {
			spec := specs.ByName(specName)
			if len(spec.Content) == 0 {
				t.Skipf("spec %q not found", specName)
			}

			logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
			cfg := config.DefaultConfig()
			s, cleanup := lsp.NewServer(cfg, logger)
			t.Cleanup(cleanup)
			client := gossiptest.NewClient(t, s)

			uri := spec.URI()
			client.OpenWithLanguage(uri, spec.LanguageID(), string(spec.Content))

			diags := client.WaitForDiagnostics(uri, 10*time.Second)

			t.Logf("\n=== %s (%d lines) ===", spec.Name, spec.Lines)
			t.Logf("Version: %s | Format: %v | Tags: %v\n", spec.Version, spec.Format, spec.Tags)
			for i, d := range diags {
				code := ""
				if d.Code != nil {
					code = fmt.Sprintf("[%v] ", d.Code)
				}
				source := ""
				if d.Source != "" {
					source = fmt.Sprintf("(%s) ", d.Source)
				}
				t.Logf("  %3d. L%d:C%d  %s  %s%s%s",
					i+1,
					d.Range.Start.Line+1,
					d.Range.Start.Character+1,
					severityString(d.Severity),
					source,
					code,
					d.Message,
				)
			}
			t.Logf("\n  Total: %d diagnostics\n", len(diags))

			// Regression: all named specs here are known-bad and should produce diagnostics.
			if len(diags) == 0 {
				t.Errorf("spec %q should produce diagnostics but got none", specName)
			}
		})
	}
}
