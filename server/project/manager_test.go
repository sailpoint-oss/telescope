package project

import (
	"context"
	"log/slog"
	"os"
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
