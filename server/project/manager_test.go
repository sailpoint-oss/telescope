package project

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestWaitReady_TimesOutBeforeInit(t *testing.T) {
	cache := openapi.NewIndexCache()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	mgr := NewManager(cache, logger)

	ok := mgr.WaitReady(50 * time.Millisecond)
	if ok {
		t.Error("expected WaitReady to return false before Initialize runs")
	}
}

func TestWaitReady_ReturnsAfterInit(t *testing.T) {
	cache := openapi.NewIndexCache()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	mgr := NewManager(cache, logger)

	// Initialize in a goroutine with a non-existent directory so it returns quickly.
	go mgr.Initialize("/nonexistent/path/that/does/not/exist", nil)

	ok := mgr.WaitReady(5 * time.Second)
	if !ok {
		t.Error("expected WaitReady to return true after Initialize completes")
	}
}

func TestWaitReady_MultipleCallersResolve(t *testing.T) {
	cache := openapi.NewIndexCache()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	mgr := NewManager(cache, logger)

	results := make(chan bool, 3)
	for i := 0; i < 3; i++ {
		go func() {
			results <- mgr.WaitReady(5 * time.Second)
		}()
	}

	go mgr.Initialize("/nonexistent/path", nil)

	for i := 0; i < 3; i++ {
		ok := <-results
		if !ok {
			t.Errorf("caller %d: WaitReady returned false", i)
		}
	}
}

func TestRunProjectDiagnostics_RespectsShouldPublish(t *testing.T) {
	cache := openapi.NewIndexCache()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	mgr := NewManager(cache, logger)

	uri := "file:///spec.yaml"
	idx := &openapi.Index{
		Document: &openapi.Document{},
		Refs:     map[string][]openapi.RefUsage{},
	}
	pctx := &ProjectContext{
		RootURI:  uri,
		Docs:     map[string]*openapi.Index{uri: idx},
		Graph:    NewFileGraph(),
		Resolver: NewCrossFileResolver(map[string]*openapi.Index{uri: idx}),
	}

	published := 0
	mgr.SetPublish(func(_ context.Context, _ protocol.DocumentURI, _ []protocol.Diagnostic) error {
		published++
		return nil
	})
	mgr.SetShouldPublish(func(_ string) bool { return false })

	mgr.runProjectDiagnostics(pctx)

	if published != 0 {
		t.Fatalf("expected no publishes when shouldPublish=false, got %d", published)
	}
}

func newTestManager(t *testing.T) *Manager {
	t.Helper()
	cache := openapi.NewIndexCache()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	return NewManager(cache, logger)
}

const minimalRoot = `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /test:
    get:
      operationId: getTest
      responses:
        "200":
          description: OK
`

const minimalFragment = `type: object
properties:
  id:
    type: string
`

func TestManager_OnFileChanged_Publishes(t *testing.T) {
	dir := t.TempDir()
	rootPath := writeFile(t, dir, "api.yaml", minimalRoot)

	fragContent := `type: object
properties:
  id:
    type: string
  name:
    $ref: ./schemas/missing.yaml
`
	writeFile(t, dir, "schemas/user.yaml", fragContent)

	// Root that references the fragment.
	rootWithRef := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /test:
    get:
      operationId: getTest
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: ./schemas/user.yaml
`
	writeFile(t, dir, "api.yaml", rootWithRef)

	mgr := newTestManager(t)

	var mu sync.Mutex
	publishedURIs := map[string]bool{}
	mgr.SetPublish(func(_ context.Context, uri protocol.DocumentURI, _ []protocol.Diagnostic) error {
		mu.Lock()
		publishedURIs[string(uri)] = true
		mu.Unlock()
		return nil
	})

	mgr.Initialize(dir, nil)

	// Clear published state.
	mu.Lock()
	publishedURIs = map[string]bool{}
	mu.Unlock()

	// Rewrite fragment and trigger OnFileChanged.
	fragPath := filepath.Join(dir, "schemas", "user.yaml")
	fragURI := pathToURI(fragPath)
	writeFile(t, dir, "schemas/user.yaml", minimalFragment)

	mgr.OnFileChanged(fragURI)

	mu.Lock()
	got := len(publishedURIs)
	mu.Unlock()

	if got == 0 {
		t.Error("expected PublishFunc to be called after OnFileChanged")
	}

	_ = rootPath // used by writeFile
}

func TestManager_OnFileCreated_BuildsNewProject(t *testing.T) {
	dir := t.TempDir()

	mgr := newTestManager(t)
	mgr.Initialize(dir, nil)

	// Verify no projects initially.
	if len(mgr.Projects()) != 0 {
		t.Fatalf("expected 0 projects initially, got %d", len(mgr.Projects()))
	}

	// Write a new root spec.
	writeFile(t, dir, "api.yaml", minimalRoot)
	newPath := filepath.Join(dir, "api.yaml")
	mgr.OnFileCreated(newPath)

	projects := mgr.Projects()
	if len(projects) != 1 {
		t.Fatalf("expected 1 project after OnFileCreated, got %d", len(projects))
	}
}

func TestManager_OnFileDeleted_RemovesProject(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "api.yaml", minimalRoot)

	mgr := newTestManager(t)
	mgr.Initialize(dir, nil)

	projects := mgr.Projects()
	if len(projects) != 1 {
		t.Fatalf("expected 1 project after init, got %d", len(projects))
	}

	rootPath := filepath.Join(dir, "api.yaml")
	os.Remove(rootPath)
	mgr.OnFileDeleted(rootPath)

	projects = mgr.Projects()
	if len(projects) != 0 {
		t.Fatalf("expected 0 projects after OnFileDeleted, got %d", len(projects))
	}
}
