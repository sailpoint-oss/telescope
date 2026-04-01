package lsp_test

import (
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/LukasParke/gossip/gossiptest"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/lsp"
)

func newTestServer(t *testing.T) *gossiptest.Client {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	cfg := config.DefaultConfig()
	s, cleanup := lsp.NewServer(cfg, logger)
	t.Cleanup(cleanup)
	return gossiptest.NewClient(t, s)
}

func TestServer_Initialize(t *testing.T) {
	client := newTestServer(t)

	client.OpenWithLanguage("file:///test.yaml", "yaml", `openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths: {}
`)

	diags := client.WaitForDiagnostics("file:///test.yaml", 5*time.Second)
	if diags == nil {
		t.Error("expected non-nil diagnostics")
	}

	_, err := client.Hover("file:///test.yaml", protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Errorf("hover should not error on valid spec: %v", err)
	}
}

func TestServer_DiagnosticsOnInvalidSpec(t *testing.T) {
	client := newTestServer(t)

	client.OpenWithLanguage("file:///bad.yaml", "yaml", `openapi: "3.0.0"
info:
  title: Bad API
  version: "1.0"
paths:
  /pets:
    get:
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/NonExistent"
`)

	diags := client.WaitForDiagnostics("file:///bad.yaml", 5*time.Second)
	if len(diags) == 0 {
		t.Error("expected diagnostics for invalid spec")
	}
	if !hasDiagWithCode(diags, "unresolved-ref") {
		t.Error("expected unresolved-ref diagnostic for #/components/schemas/NonExistent")
	}
}

func TestServer_Completion(t *testing.T) {
	client := newTestServer(t)

	client.OpenWithLanguage("file:///api.yaml", "yaml", `openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths:
  /pets:
    get:
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: ""
components:
  schemas:
    Pet:
      type: object
`)

	// Wait for indexing
	_ = client.WaitForDiagnostics("file:///api.yaml", 5*time.Second)

	completions, err := client.Completion("file:///api.yaml", protocol.Position{Line: 14, Character: 22})
	if err != nil {
		t.Errorf("completion should not error: %v", err)
	}
	if completions == nil {
		t.Error("expected non-nil completion response")
	}
}

func TestServer_DocumentSymbol(t *testing.T) {
	client := newTestServer(t)

	client.OpenWithLanguage("file:///sym.yaml", "yaml", `openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths:
  /pets:
    get:
      operationId: listPets
      responses:
        "200":
          description: OK
components:
  schemas:
    Pet:
      type: object
`)

	_ = client.WaitForDiagnostics("file:///sym.yaml", 5*time.Second)
}

// Cross-file integration tests using the full server are in handler_test.go
// (TestDefinitionHandler_CrossFile_*, TestHoverHandler_CrossFile_*) which use
// a direct handler setup with pre-built indexes for deterministic testing.
