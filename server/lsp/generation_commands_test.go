package lsp

import (
	"context"
	"log/slog"
	"testing"

	"github.com/sailpoint-oss/telescope/server/generation"
)

func TestGenerationCommandNames(t *testing.T) {
	names := GenerationCommandNames()
	if len(names) < 7 {
		t.Fatalf("expected command list, got %v", names)
	}
	seen := map[string]bool{}
	for _, n := range names {
		if seen[n] {
			t.Fatalf("duplicate %q", n)
		}
		seen[n] = true
	}
}

func TestExecuteGenerationCommandNilManager(t *testing.T) {
	_, err := ExecuteGenerationCommand(context.Background(), nil, "telescope.regenerate", nil)
	if err == nil {
		t.Fatal("expected error for nil manager")
	}
}

func TestExecuteGenerationCommandUnknownReturnsNil(t *testing.T) {
	mgr := generation.NewManager(slog.Default())
	got, err := ExecuteGenerationCommand(context.Background(), mgr, "telescope.notARealCommand", nil)
	if err != nil || got != nil {
		t.Fatalf("got %v err=%v", got, err)
	}
}

func TestExecuteGenerationCommandNoLoop(t *testing.T) {
	mgr := generation.NewManager(slog.Default())
	ctx := context.Background()
	_, err := ExecuteGenerationCommand(ctx, mgr, "telescope.regenerate", nil)
	if err == nil {
		t.Fatal("expected error without loops")
	}
	_, err = ExecuteGenerationCommand(ctx, mgr, "telescope.writeSpecNow", nil)
	if err == nil {
		t.Fatal("expected write error without loops")
	}
	_, err = ExecuteGenerationCommand(ctx, mgr, "telescope.openGeneratedSpec", nil)
	if err == nil {
		t.Fatal("expected open spec error without loops")
	}
	_, err = ExecuteGenerationCommand(ctx, mgr, "telescope.getGeneratedSpecBytes", nil)
	if err == nil {
		t.Fatal("expected get bytes error without loops")
	}
}

func TestExecuteGenerationCommandArgValidation(t *testing.T) {
	mgr := generation.NewManager(slog.Default())
	ctx := context.Background()
	_, err := ExecuteGenerationCommand(ctx, mgr, "telescope.openSourceForSpec", []interface{}{"only-one"})
	if err == nil {
		t.Fatal("expected arg count error for openSourceForSpec")
	}
	_, err = ExecuteGenerationCommand(ctx, mgr, "telescope.getSourceContributions", nil)
	if err == nil {
		t.Fatal("expected error for getSourceContributions without args")
	}
	got, err := ExecuteGenerationCommand(ctx, mgr, "telescope.getSourceContributions", []interface{}{"file:///somewhere/p.go"})
	if err != nil || got != nil {
		t.Fatalf("no roots: got %v err=%v", got, err)
	}
	got, err = ExecuteGenerationCommand(ctx, mgr, "telescope.getSourceMapForFile", []interface{}{"file:///somewhere/p.go"})
	if err != nil || got != nil {
		t.Fatalf("getSourceMapForFile alias: got %v err=%v", got, err)
	}
}

func TestSpecTreeFromMap(t *testing.T) {
	if tree := specTreeFromMap(nil); tree == nil {
		t.Fatal("nil spec should still return tree shell")
	}
	spec := map[string]interface{}{
		"paths": map[string]interface{}{
			"/pets": map[string]interface{}{
				"get": map[string]interface{}{},
			},
		},
		"components": map[string]interface{}{
			"schemas": map[string]interface{}{
				"Pet": map[string]interface{}{"type": "object"},
			},
		},
	}
	tree := specTreeFromMap(spec)
	paths, _ := tree["paths"].([]any)
	if len(paths) != 1 {
		t.Fatalf("paths: %v", tree["paths"])
	}
	schemas, _ := tree["schemas"].([]any)
	if len(schemas) != 1 {
		t.Fatalf("schemas: %v", tree["schemas"])
	}
}
