package cli

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestBaselineSaveLoadCompare(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	dir := t.TempDir()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("Chdir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(wd)
	})

	current := []fileDiagnostics{{
		Path: "spec.yaml",
		Diagnostics: []protocol.Diagnostic{{
			Code:    "sp-123",
			Message: "missing tags",
			Range: protocol.Range{
				Start: protocol.Position{Line: 4},
				End:   protocol.Position{Line: 4, Character: 10},
			},
		}},
	}}

	if err := SaveBaseline(current); err != nil {
		t.Fatalf("SaveBaseline: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, baselinePath)); err != nil {
		t.Fatalf("expected baseline file: %v", err)
	}

	baseline, err := LoadBaseline()
	if err != nil {
		t.Fatalf("LoadBaseline: %v", err)
	}
	comp := CompareBaseline(baseline, []fileDiagnostics{{
		Path: "spec.yaml",
		Diagnostics: []protocol.Diagnostic{{
			Code:    "sp-123",
			Message: "missing tags",
			Range: protocol.Range{
				Start: protocol.Position{Line: 4},
				End:   protocol.Position{Line: 4, Character: 10},
			},
		}, {
			Code:    "sp-404",
			Message: "missing error response",
			Range: protocol.Range{
				Start: protocol.Position{Line: 8},
				End:   protocol.Position{Line: 8, Character: 12},
			},
		}},
	}})
	if comp.BaselineCount != 1 || comp.CurrentCount != 2 || comp.NewCount != 1 || comp.FixedCount != 0 {
		t.Fatalf("unexpected baseline comparison: %+v", comp)
	}
	if len(comp.NewDiags) != 1 || len(comp.NewDiags[0].Diagnostics) != 1 {
		t.Fatalf("expected one new diagnostic group, got %+v", comp.NewDiags)
	}
}

func TestMergeComponents_PreservesExistingEntries(t *testing.T) {
	dst := map[string]any{
		"components": map[string]any{
			"schemas": map[string]any{
				"Pet": map[string]any{"type": "object"},
			},
		},
	}
	src := map[string]any{
		"components": map[string]any{
			"schemas": map[string]any{
				"Pet":   map[string]any{"type": "string"},
				"Owner": map[string]any{"type": "object"},
			},
			"responses": map[string]any{
				"Ok": map[string]any{"description": "ok"},
			},
		},
	}

	mergeComponents(dst, src)
	comps := dst["components"].(map[string]any)
	schemas := comps["schemas"].(map[string]any)
	if len(schemas) != 2 {
		t.Fatalf("expected merged schemas, got %+v", schemas)
	}
	if schemas["Pet"].(map[string]any)["type"] != "object" {
		t.Fatal("existing schema should not be overwritten")
	}
	if _, ok := comps["responses"].(map[string]any)["Ok"]; !ok {
		t.Fatal("expected response component to be merged")
	}
}

func TestNewRootCmd_WiresSubcommands(t *testing.T) {
	cmd := newRootCmd()
	names := map[string]bool{}
	for _, c := range cmd.Commands() {
		names[c.Name()] = true
	}
	for _, want := range []string{"lint", "validate", "ci", "serve", "bundle", "contract"} {
		if !names[want] {
			t.Fatalf("missing subcommand %q", want)
		}
	}
}

func TestNewBundleCmd_Metadata(t *testing.T) {
	cmd := newBundleCmd()
	if cmd.Use != "bundle [root-file]" {
		t.Fatalf("unexpected use line: %q", cmd.Use)
	}
	if cmd.Flag("output") == nil || cmd.Flag("format") == nil {
		t.Fatal("expected output and format flags")
	}
}
