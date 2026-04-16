package lsp

import (
	"context"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	telescopedocs "github.com/sailpoint-oss/telescope/server/docs"
)

type fakeDocsServer struct {
	url string
}

func (f *fakeDocsServer) URL() string { return f.url }
func (f *fakeDocsServer) Stop() error { return nil }

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
