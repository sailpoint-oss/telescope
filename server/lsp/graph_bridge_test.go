package lsp_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	graphcore "github.com/sailpoint-oss/telescope/server/core/graph"
	"github.com/sailpoint-oss/telescope/server/lsp"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/project"
)

func TestGraphResolveRefTarget_LocalRef(t *testing.T) {
	base := "file:///project/api.yaml"
	result := lsp.GraphResolveRefTarget(base, "#/components/schemas/Pet")
	if result != base {
		t.Errorf("local ref should return base URI, got %q", result)
	}
}

func TestGraphResolveRefTarget_EmptyRef(t *testing.T) {
	base := "file:///project/api.yaml"
	result := lsp.GraphResolveRefTarget(base, "")
	if result != base {
		t.Errorf("empty ref should return base URI, got %q", result)
	}
}

func TestGraphResolveRefTarget_RelativeFile(t *testing.T) {
	base := "file:///project/api.yaml"
	result := lsp.GraphResolveRefTarget(base, "./schemas/pet.yaml#/components/schemas/Pet")
	if !strings.HasPrefix(result, "file://") {
		t.Fatalf("expected file:// URI, got %q", result)
	}
	if !strings.HasSuffix(result, "/project/schemas/pet.yaml") {
		t.Errorf("expected resolved path ending with /project/schemas/pet.yaml, got %q", result)
	}
}

func TestGraphResolveRefTarget_RelativeFileNoDotSlash(t *testing.T) {
	base := "file:///project/api.yaml"
	result := lsp.GraphResolveRefTarget(base, "schemas/pet.yaml#/components/schemas/Pet")
	if !strings.HasPrefix(result, "file://") {
		t.Fatalf("expected file:// URI, got %q", result)
	}
	if !strings.HasSuffix(result, "/project/schemas/pet.yaml") {
		t.Errorf("expected resolved path ending with /project/schemas/pet.yaml, got %q", result)
	}
}

func TestGraphResolveRefTarget_ParentDir(t *testing.T) {
	base := "file:///project/specs/api.yaml"
	result := lsp.GraphResolveRefTarget(base, "../common/error.yaml#/components/schemas/Error")
	if !strings.HasPrefix(result, "file://") {
		t.Fatalf("expected file:// URI, got %q", result)
	}
	if !strings.HasSuffix(result, "/project/common/error.yaml") {
		t.Errorf("expected resolved path ending with /project/common/error.yaml, got %q", result)
	}
}

func TestGraphResolveRefTarget_SiblingFile(t *testing.T) {
	base := "file:///project/ref-root.yaml"
	result := lsp.GraphResolveRefTarget(base, "./ref-components.yaml#/components/schemas/User")
	if !strings.HasPrefix(result, "file://") {
		t.Fatalf("expected file:// URI, got %q", result)
	}
	if !strings.HasSuffix(result, "/project/ref-components.yaml") {
		t.Errorf("expected resolved path ending with /project/ref-components.yaml, got %q", result)
	}
}

func TestGraphResolveRefTarget_NoFragment(t *testing.T) {
	base := "file:///project/api.yaml"
	result := lsp.GraphResolveRefTarget(base, "./schemas/pet.yaml")
	if !strings.HasPrefix(result, "file://") {
		t.Fatalf("expected file:// URI, got %q", result)
	}
	if !strings.HasSuffix(result, "/project/schemas/pet.yaml") {
		t.Errorf("expected resolved path ending with /project/schemas/pet.yaml, got %q", result)
	}
}

func TestGraphResolveRefTarget_NonFileScheme(t *testing.T) {
	base := "http://example.com/api.yaml"
	result := lsp.GraphResolveRefTarget(base, "./schemas/pet.yaml#/x")
	if result != "./schemas/pet.yaml" {
		t.Errorf("non-file scheme should return raw file part, got %q", result)
	}
}

func TestGraphExtractFragment(t *testing.T) {
	tests := []struct {
		ref  string
		want string
	}{
		{"./schemas/pet.yaml#/components/schemas/Pet", "/components/schemas/Pet"},
		{"#/components/schemas/Pet", "/components/schemas/Pet"},
		{"./schemas/pet.yaml", ""},
		{"", ""},
	}
	for _, tt := range tests {
		got := lsp.GraphExtractFragment(tt.ref)
		if got != tt.want {
			t.Errorf("GraphExtractFragment(%q) = %q, want %q", tt.ref, got, tt.want)
		}
	}
}

func TestGraphBridgeRunPipelineProjectsCrossFileIndex(t *testing.T) {
	const (
		rootURI = "file:///workspace/root.yaml"
		compURI = "file:///workspace/components.yaml"
	)

	const rootSpec = `openapi: "3.1.0"
info:
  title: Example
  version: "1.0"
paths:
  /users:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: ./components.yaml#/components/schemas/User
`

	const compSpec = `components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
`

	bridge := lsp.NewGraphBridge(nil)
	cache := openapi.NewIndexCache()
	bridge.OnDocumentOpen(rootURI, []byte(rootSpec))
	bridge.OnDocumentOpen(compURI, []byte(compSpec))

	snap, err := bridge.RunPipeline(context.Background(), cache, rootURI, compURI)
	if err != nil {
		t.Fatalf("RunPipeline: %v", err)
	}
	if snap == nil {
		t.Fatal("expected snapshot")
	}
	if snap.PointerIndices[rootURI] == nil {
		t.Fatal("expected pointer index for root document")
	}
	if cache.Get(protocol.DocumentURI(rootURI)) == nil {
		t.Fatal("expected projected cache index for root document")
	}
	if cache.Get(protocol.DocumentURI(compURI)) == nil {
		t.Fatal("expected projected cache index for component document")
	}

	targetURI, targetPtr, ok := bridge.LookupDefinition(rootURI, "./components.yaml#/components/schemas/User")
	if !ok {
		t.Fatal("expected graph definition lookup to succeed")
	}
	if targetURI != compURI {
		t.Fatalf("expected target URI %q, got %q", compURI, targetURI)
	}
	if targetPtr != "/components/schemas/User" {
		t.Fatalf("expected target pointer /components/schemas/User, got %q", targetPtr)
	}
}

func TestGraphBridgeOnDocumentCloseFallsBackToFilesystemSource(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "root.yaml")
	content := `openapi: "3.1.0"
info:
  title: Example
  version: "1.0"
paths: {}
`
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write temp file: %v", err)
	}

	uri := project.PathToURI(path)
	bridge := lsp.NewGraphBridge(nil)
	cache := openapi.NewIndexCache()

	bridge.OnDocumentOpen(uri, []byte(content))
	if _, err := bridge.RunPipeline(context.Background(), cache, uri); err != nil {
		t.Fatalf("initial RunPipeline: %v", err)
	}

	bridge.OnDocumentClose(uri)
	snap, err := bridge.RunPipeline(context.Background(), cache, uri)
	if err != nil {
		t.Fatalf("RunPipeline after close: %v", err)
	}
	if snap == nil || snap.Nodes[uri].Version == 0 {
		t.Fatal("expected snapshot node for closed file")
	}

	node := bridge.Graph().Node(uri)
	if node == nil {
		t.Fatal("expected graph node after close")
	}
	if _, ok := node.Source.(*graphcore.FilesystemSource); !ok {
		t.Fatalf("expected filesystem source after close, got %T", node.Source)
	}
	if cache.Get(protocol.DocumentURI(uri)) == nil {
		t.Fatal("expected projected cache index after close")
	}
}
