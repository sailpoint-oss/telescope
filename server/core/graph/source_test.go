package graph

import (
	"context"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	navigator "github.com/sailpoint-oss/navigator"
)

func TestFilesystemSource(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.yaml")
	if err := os.WriteFile(path, []byte("openapi: 3.1.0"), 0644); err != nil {
		t.Fatal(err)
	}

	src := NewFilesystemSource(path, ClassificationHint{IsOpenAPI: true})

	if src.URI() == "" {
		t.Error("URI should not be empty")
	}
	if src.Path() != path {
		t.Errorf("Path = %q, want %q", src.Path(), path)
	}

	content, version, err := src.Read(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "openapi: 3.1.0" {
		t.Errorf("content = %q, want %q", string(content), "openapi: 3.1.0")
	}
	if version <= 0 {
		t.Errorf("version = %d, want positive (mtime-based)", version)
	}

	// Reading again should return the same mtime-based version (file not changed)
	_, v2, err := src.Read(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if v2 <= 0 {
		t.Errorf("version = %d, want positive", v2)
	}

	if !src.Hint().IsOpenAPI {
		t.Error("hint.IsOpenAPI should be true")
	}
}

func TestFilesystemSource_ReadError(t *testing.T) {
	src := NewFilesystemSource("/nonexistent/path.yaml", ClassificationHint{})
	_, _, err := src.Read(context.Background())
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

func TestSyntheticSource(t *testing.T) {
	content := []byte("openapi: 3.1.0\ninfo:\n  title: Test")
	src := NewSyntheticSource("synthetic://test.yaml", content, ClassificationHint{
		IsOpenAPI:      true,
		OpenAPIVersion: "3.1",
	})

	if src.URI() != "synthetic://test.yaml" {
		t.Errorf("URI = %q, want %q", src.URI(), "synthetic://test.yaml")
	}

	data, version, err := src.Read(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != string(content) {
		t.Errorf("content mismatch")
	}
	if version != 1 {
		t.Errorf("version = %d, want 1", version)
	}

	// Verify content is a copy (not aliased)
	data[0] = 'X'
	data2, _, _ := src.Read(context.Background())
	if data2[0] == 'X' {
		t.Error("Read should return a copy, not a reference")
	}

	// Test Update with watcher
	var called atomic.Int32
	cancel := src.Watch(context.Background(), func(string, navigator.WatchEvent) {
		called.Add(1)
	})

	src.Update([]byte("openapi: 3.2.0"))

	data3, v3, err := src.Read(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if string(data3) != "openapi: 3.2.0" {
		t.Errorf("updated content = %q", string(data3))
	}
	if v3 != 2 {
		t.Errorf("version = %d, want 2", v3)
	}
	if called.Load() != 1 {
		t.Errorf("watcher called %d times, want 1", called.Load())
	}

	// Cancel and update again
	cancel()
	src.Update([]byte("openapi: 3.3.0"))
	if called.Load() != 1 {
		t.Errorf("watcher called %d times after cancel, want still 1", called.Load())
	}
}

func TestSyntheticSource_NilWatch(t *testing.T) {
	src := NewSyntheticSource("test://nil", nil, ClassificationHint{})
	cancel := src.Watch(context.Background(), nil)
	cancel() // should not panic
}

type mockDocProvider struct {
	text    string
	version int32
	found   bool
}

func (m *mockDocProvider) Content(uri string) (string, int32, bool) {
	return m.text, m.version, m.found
}

func TestLSPSource(t *testing.T) {
	provider := &mockDocProvider{
		text:    "openapi: 3.1.0",
		version: 5,
		found:   true,
	}

	src := NewLSPSource("file:///workspace/api.yaml", provider, ClassificationHint{
		LanguageID: "yaml",
	})

	if src.URI() != "file:///workspace/api.yaml" {
		t.Errorf("URI = %q", src.URI())
	}

	content, version, err := src.Read(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if string(content) != "openapi: 3.1.0" {
		t.Errorf("content = %q", string(content))
	}
	if version != 5 {
		t.Errorf("version = %d, want 5", version)
	}
	if src.Hint().LanguageID != "yaml" {
		t.Errorf("hint.LanguageID = %q", src.Hint().LanguageID)
	}
}

func TestLSPSource_NotFound(t *testing.T) {
	provider := &mockDocProvider{found: false}
	src := NewLSPSource("file:///missing.yaml", provider, ClassificationHint{})

	_, _, err := src.Read(context.Background())
	if err == nil {
		t.Error("expected error for missing document")
	}
}
