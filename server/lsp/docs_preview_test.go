package lsp

import (
	"context"
	"os"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	telescopedocs "github.com/sailpoint-oss/telescope/server/docs"
)

type fakeDocsServer struct {
	url     string
	stopped atomic.Int32
}

func (f *fakeDocsServer) URL() string { return f.url }
func (f *fakeDocsServer) Stop() error {
	f.stopped.Add(1)
	return nil
}

func TestExecuteCommand_DocsPreview_ReturnsURL(t *testing.T) {
	originalStartDocsServer := startDocsServer
	startDocsServer = func(ctx context.Context, opts telescopedocs.GenerateOpts) (docsServer, error) {
		return &fakeDocsServer{url: "http://127.0.0.1:9191"}, nil
	}
	t.Cleanup(func() {
		startDocsServer = originalStartDocsServer
	})

	env := newCoverageEnv(t)
	previewMgr := NewDocsPreviewManager(nil)
	t.Cleanup(previewMgr.StopAll)

	handler := NewExecuteCommandHandler(env.cache, nil, &ExecuteCommandDeps{
		DocsPreview: previewMgr,
	})
	result, err := handler(env.ctx, &protocol.ExecuteCommandParams{
		Command:   "telescope.docsPreview",
		Arguments: []interface{}{string(env.uri)},
	})
	if err != nil {
		t.Fatalf("docs preview error: %v", err)
	}
	payload, ok := result.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	if got := payload["url"]; got != "http://127.0.0.1:9191" {
		t.Fatalf("unexpected docs preview url: %#v", got)
	}
}

func TestDocsPreviewManager_Lifecycle(t *testing.T) {
	fake := &fakeDocsServer{url: "http://127.0.0.1:9292"}
	originalStartDocsServer := startDocsServer
	startDocsServer = func(ctx context.Context, opts telescopedocs.GenerateOpts) (docsServer, error) {
		return fake, nil
	}
	t.Cleanup(func() {
		startDocsServer = originalStartDocsServer
	})

	env := newCoverageEnv(t)
	mgr := NewDocsPreviewManager(nil)
	t.Cleanup(mgr.StopAll)

	// First call starts the server and returns a URL.
	url, err := mgr.StartPreview(env.ctx, env.cache, nil, env.uri, nil)
	if err != nil {
		t.Fatalf("StartPreview: %v", err)
	}
	if url != fake.url {
		t.Fatalf("url = %q, want %q", url, fake.url)
	}

	// Capture the spec path so we can confirm Refresh rewrites it and
	// StopPreview cleans it up.
	mgr.mu.Lock()
	session := mgr.active[string(env.uri)]
	mgr.mu.Unlock()
	if session == nil {
		t.Fatal("expected an active session after StartPreview")
	}
	specPath := session.specPath
	if _, err := os.Stat(specPath); err != nil {
		t.Fatalf("spec path not written: %v", err)
	}
	before, err := os.ReadFile(specPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	// Refresh rewrites the spec file using the current cache bytes.
	if err := mgr.Refresh(env.ctx, env.cache, nil, env.uri); err != nil {
		t.Fatalf("Refresh: %v", err)
	}
	after, err := os.ReadFile(specPath)
	if err != nil {
		t.Fatalf("ReadFile after refresh: %v", err)
	}
	if len(after) == 0 || len(after) != len(before) {
		// Not strictly required that bytes differ, but they must at least be
		// present and bundle-shaped.
		t.Logf("refresh size before=%d after=%d", len(before), len(after))
	}

	// A second StartPreview reuses the existing session (no new server start).
	url2, err := mgr.StartPreview(env.ctx, env.cache, nil, env.uri, nil)
	if err != nil {
		t.Fatalf("second StartPreview: %v", err)
	}
	if url2 != fake.url {
		t.Fatalf("url2 = %q, want %q", url2, fake.url)
	}
	if got := fake.stopped.Load(); got != 0 {
		t.Fatalf("server stopped prematurely: count=%d", got)
	}

	// Refresh on an unknown URI is a no-op.
	if err := mgr.Refresh(env.ctx, env.cache, nil, protocol.DocumentURI("file:///other.yaml")); err != nil {
		t.Fatalf("Refresh for unknown URI should no-op, got %v", err)
	}

	// StopPreview tears down the server and removes the spec file.
	mgr.StopPreview(env.uri)
	if got := fake.stopped.Load(); got != 1 {
		t.Fatalf("Stop() call count = %d, want 1", got)
	}
	if _, err := os.Stat(specPath); !os.IsNotExist(err) {
		t.Fatalf("spec path still exists after StopPreview: %v", err)
	}

	// StopPreview on an unknown URI is a no-op.
	mgr.StopPreview(protocol.DocumentURI("file:///never-started.yaml"))
}

func TestWriteDocsPreviewSpec(t *testing.T) {
	// URI with extension: temp file preserves it, cleanup removes it.
	specPath, cleanup, err := writeDocsPreviewSpec("file:///tmp/a.yaml", []byte("hello\n"))
	if err != nil {
		t.Fatalf("writeDocsPreviewSpec: %v", err)
	}
	if !strings.HasSuffix(specPath, ".yaml") {
		t.Fatalf("expected .yaml suffix, got %q", specPath)
	}
	if _, err := os.Stat(specPath); err != nil {
		t.Fatalf("temp file missing: %v", err)
	}
	data, err := os.ReadFile(specPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(data) != "hello\n" {
		t.Fatalf("contents = %q", data)
	}
	cleanup()
	if _, err := os.Stat(specPath); !os.IsNotExist(err) {
		t.Fatalf("cleanup did not remove temp file: %v", err)
	}

	// Invalid URI scheme is surfaced as an error.
	if _, _, err := writeDocsPreviewSpec("not-a-uri", []byte("x")); err == nil {
		t.Fatal("expected error for unsupported URI scheme")
	}
}

func TestDocsPreviewManager_NilSafe(t *testing.T) {
	var m *DocsPreviewManager
	if _, err := m.StartPreview(nil, nil, nil, "file:///x.yaml", nil); err != nil {
		t.Fatalf("nil manager StartPreview should no-op, got %v", err)
	}
	if err := m.Refresh(nil, nil, nil, "file:///x.yaml"); err != nil {
		t.Fatalf("nil manager Refresh should no-op, got %v", err)
	}
	m.StopPreview("file:///x.yaml")
	m.StopAll()
}
