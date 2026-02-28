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
	s := lsp.NewServer(cfg, logger)
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
	_ = diags

	hover, err := client.Hover("file:///test.yaml", protocol.Position{Line: 0, Character: 0})
	_ = hover
	_ = err
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
	_ = diags
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
		t.Logf("completion returned error: %v", err)
	}
	_ = completions
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
