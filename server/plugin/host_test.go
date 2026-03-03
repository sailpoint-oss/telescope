package plugin_test

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/sailpoint-oss/telescope/server/plugin"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

func TestNewHost(t *testing.T) {
	h := plugin.NewHost(testLogger())
	if h == nil {
		t.Fatal("expected non-nil host")
	}
	if h.PluginCount() != 0 {
		t.Fatalf("expected 0 plugins, got %d", h.PluginCount())
	}
}

func TestDiscover_NonExistentDir(t *testing.T) {
	h := plugin.NewHost(testLogger())
	err := h.Discover("/nonexistent/path/plugins")
	if err != nil {
		t.Fatalf("Discover should not error for non-existent dir, got: %v", err)
	}
	if h.PluginCount() != 0 {
		t.Fatalf("expected 0 plugins, got %d", h.PluginCount())
	}
}

func TestDiscover_EmptyDir(t *testing.T) {
	dir := t.TempDir()
	h := plugin.NewHost(testLogger())
	err := h.Discover(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if h.PluginCount() != 0 {
		t.Fatalf("expected 0 plugins, got %d", h.PluginCount())
	}
}

func TestDiscover_SkipsDirectories(t *testing.T) {
	dir := t.TempDir()
	subdir := filepath.Join(dir, "subdir")
	if err := os.Mkdir(subdir, 0o755); err != nil {
		t.Fatal(err)
	}

	h := plugin.NewHost(testLogger())
	err := h.Discover(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if h.PluginCount() != 0 {
		t.Fatalf("expected 0 plugins, got %d", h.PluginCount())
	}
}

func TestDiscover_SkipsNonExecutable(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "not-executable")
	if err := os.WriteFile(path, []byte("not a binary"), 0o644); err != nil {
		t.Fatal(err)
	}

	h := plugin.NewHost(testLogger())
	err := h.Discover(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if h.PluginCount() != 0 {
		t.Fatalf("expected 0 plugins, got %d", h.PluginCount())
	}
}

func TestDiscover_SkipsGitignore(t *testing.T) {
	dir := t.TempDir()
	gitignore := filepath.Join(dir, ".gitignore")
	if err := os.WriteFile(gitignore, []byte("*\n!.gitignore\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	h := plugin.NewHost(testLogger())
	err := h.Discover(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if h.PluginCount() != 0 {
		t.Fatalf("expected 0 plugins, got %d", h.PluginCount())
	}
}

func TestLoadPlugin_InvalidBinary(t *testing.T) {
	dir := t.TempDir()
	fakeBin := filepath.Join(dir, "fake-plugin")
	if err := os.WriteFile(fakeBin, []byte("#!/bin/sh\nexit 1"), 0o755); err != nil {
		t.Fatal(err)
	}

	h := plugin.NewHost(testLogger())
	err := h.LoadPlugin(fakeBin)
	if err == nil {
		t.Fatal("expected error when loading non-plugin binary")
		h.Shutdown()
	}
}

func TestShutdown_Empty(t *testing.T) {
	h := plugin.NewHost(testLogger())
	h.Shutdown()
	if h.PluginCount() != 0 {
		t.Fatalf("expected 0 plugins after shutdown, got %d", h.PluginCount())
	}
}

func TestAnalyzer_ReturnsValidAnalyzer(t *testing.T) {
	h := plugin.NewHost(testLogger())
	analyzer := h.Analyzer()
	if analyzer.Run == nil {
		t.Fatal("expected non-nil Run function")
	}
}

func TestAnalyzeDirect_NoPlugins(t *testing.T) {
	h := plugin.NewHost(testLogger())
	diags := h.AnalyzeDirect("file:///test.yaml", []byte("openapi: 3.1.0"))
	if len(diags) != 0 {
		t.Fatalf("expected 0 diagnostics with no plugins, got %d", len(diags))
	}
}
