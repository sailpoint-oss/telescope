package docs

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDocsHelperProcess(t *testing.T) {
	if os.Getenv("TELESCOPE_DOCS_HELPER") != "1" {
		return
	}
	time.Sleep(30 * time.Second)
	os.Exit(0)
}

func TestBuildArgs(t *testing.T) {
	args := buildArgs(GenerateOpts{
		SpecPath:  "/tmp/spec.yaml",
		OutputDir: "/tmp/out",
		Title:     "Docs",
		Theme:     "roger",
		Publish:   true,
		Serve:     true,
		ServePort: 9090,
		NoLLM:     true,
		NoJSON:    true,
		NoHTML:    true,
	})
	text := strings.Join(args, " ")
	for _, want := range []string{
		"/tmp/spec.yaml",
		"--output /tmp/out",
		"--title Docs",
		"--theme roger",
		"--publish",
		"--serve --port 9090",
		"--no-llm",
		"--no-json",
		"--no-html",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("expected args to contain %q, got %q", want, text)
		}
	}
}

func TestServeReturnsURLAndStops(t *testing.T) {
	originalCommandContext := commandContext
	originalAwaitPreviewReady := awaitPreviewReady
	commandContext = func(ctx context.Context, name string, args ...string) *exec.Cmd {
		cmdArgs := []string{"-test.run=TestDocsHelperProcess"}
		cmd := exec.CommandContext(ctx, os.Args[0], cmdArgs...)
		cmd.Env = append(os.Environ(), "TELESCOPE_DOCS_HELPER=1")
		return cmd
	}
	awaitPreviewReady = func(ctx context.Context, previewURL string) error { return nil }
	t.Cleanup(func() {
		commandContext = originalCommandContext
		awaitPreviewReady = originalAwaitPreviewReady
	})

	dir := t.TempDir()
	specPath := filepath.Join(dir, "spec.yaml")
	if err := os.WriteFile(specPath, []byte("openapi: 3.0.0\ninfo:\n  title: Test\n  version: 1.0.0\npaths: {}\n"), 0o644); err != nil {
		t.Fatalf("write spec: %v", err)
	}
	fakeBinary := filepath.Join(dir, "printing-press")
	if err := os.WriteFile(fakeBinary, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatalf("write fake binary: %v", err)
	}

	server, err := Serve(context.Background(), GenerateOpts{
		BinaryPath: fakeBinary,
		SpecPath:   specPath,
		OutputDir:  filepath.Join(dir, "docs"),
		Serve:      true,
		ServePort:  9123,
	})
	if err != nil {
		t.Fatalf("Serve: %v", err)
	}
	if got := server.URL(); got != "http://127.0.0.1:9123" {
		t.Fatalf("URL() = %q", got)
	}
	if err := server.Stop(); err != nil {
		t.Fatalf("Stop: %v", err)
	}
}
