package lsp

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/project"
)

func writeSpecFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%q): %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%q): %v", path, err)
	}
}

func TestGraphBridgeWorkspaceLifecycle(t *testing.T) {
	dir := t.TempDir()
	rootPath := filepath.Join(dir, "root.yaml")
	compPath := filepath.Join(dir, "components.yaml")
	rootURI := project.PathToURI(rootPath)
	compURI := project.PathToURI(compPath)

	writeSpecFile(t, rootPath, `openapi: "3.1.0"
info:
  title: Example
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: ./components.yaml#/components/schemas/User
`)
	writeSpecFile(t, compPath, `components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
`)

	bridge, err := NewGraphBridge(slog.Default())
	if err != nil {
		t.Fatalf("NewGraphBridge: %v", err)
	}
	cache := openapi.NewIndexCache()

	snap, err := bridge.LoadWorkspaceFiles(context.Background(), cache, []*project.DiscoveredFile{
		{Path: rootPath},
		{Path: compPath},
	})
	if err != nil {
		t.Fatalf("LoadWorkspaceFiles: %v", err)
	}
	if snap == nil {
		t.Fatal("expected snapshot from LoadWorkspaceFiles")
	}
	if cache.Get(protocol.DocumentURI(rootURI)) == nil || cache.Get(protocol.DocumentURI(compURI)) == nil {
		t.Fatal("expected both workspace files to be projected into cache")
	}
	if bridge.SnapshotNode(rootURI) == nil {
		t.Fatal("expected snapshot node for root document")
	}
	if bridge.SnapshotPointerIndex(rootURI) == nil {
		t.Fatal("expected pointer index for root document")
	}
	if len(bridge.EdgesFrom(rootURI)) == 0 {
		t.Fatal("expected outbound ref edge from root document")
	}
	if len(bridge.FindReferences(compURI)) != 1 {
		t.Fatalf("expected one reference to component document, got %d", len(bridge.FindReferences(compURI)))
	}

	targetURI, target, err := bridge.ResolveRef(cache, rootURI, "./components.yaml#/components/schemas/User")
	if err != nil {
		t.Fatalf("ResolveRef: %v", err)
	}
	if string(targetURI) != compURI {
		t.Fatalf("ResolveRef target URI = %q, want %q", targetURI, compURI)
	}
	if target == nil {
		t.Fatal("expected resolved target value")
	}

	enriched := bridge.EnrichDiagnosticsWithRefContext(compURI, []ctypes.Diagnostic{{Message: "bad schema"}})
	if len(enriched) != 1 || len(enriched[0].Related) != 1 {
		t.Fatalf("expected ref-context related info, got %+v", enriched)
	}

	writeSpecFile(t, compPath, `components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        email:
          type: string
`)
	changedSnap, err := bridge.OnFileChanged(context.Background(), cache, compURI)
	if err != nil {
		t.Fatalf("OnFileChanged: %v", err)
	}
	if changedSnap == nil {
		t.Fatal("expected snapshot after file change")
	}

	if _, err := os.Stat(compPath); err != nil {
		t.Fatalf("expected component file to exist before delete: %v", err)
	}
	if err := os.Remove(compPath); err != nil {
		t.Fatalf("Remove(%q): %v", compPath, err)
	}
	deletedSnap, err := bridge.OnFileDeleted(context.Background(), cache, compPath)
	if err != nil {
		t.Fatalf("OnFileDeleted: %v", err)
	}
	if deletedSnap == nil {
		t.Fatal("expected snapshot after delete")
	}
	if cache.Get(protocol.DocumentURI(compURI)) != nil {
		t.Fatal("expected deleted component index to be evicted")
	}

	writeSpecFile(t, compPath, `components:
  schemas:
    User:
      type: object
`)
	createdSnap, err := bridge.OnFileCreated(context.Background(), cache, compPath)
	if err != nil {
		t.Fatalf("OnFileCreated: %v", err)
	}
	if createdSnap == nil {
		t.Fatal("expected snapshot after recreate")
	}
	if cache.Get(protocol.DocumentURI(compURI)) == nil {
		t.Fatal("expected recreated component index to be restored")
	}
}

func TestGraphBridgeSyntheticDocumentLifecycle(t *testing.T) {
	bridge, err := NewGraphBridge(slog.Default())
	if err != nil {
		t.Fatalf("NewGraphBridge: %v", err)
	}
	cache := openapi.NewIndexCache()
	uri := "file:///virtual/spec.yaml"
	content := []byte(`openapi: "3.1.0"
info:
  title: Virtual
  version: "1.0.0"
paths: {}
`)

	bridge.OnDocumentChange(uri, content)
	if bridge.Graph().Node(uri) == nil {
		t.Fatal("expected OnDocumentChange to open missing synthetic document")
	}
	if _, err := bridge.RunPipeline(context.Background(), cache, uri); err != nil {
		t.Fatalf("RunPipeline: %v", err)
	}
	current := bridge.CurrentSnapshot()
	if current == nil {
		t.Fatal("expected current snapshot after pipeline run")
	}

	snap, err := bridge.OnFileChanged(context.Background(), cache, uri)
	if err != nil {
		t.Fatalf("OnFileChanged synthetic: %v", err)
	}
	if snap != current {
		t.Fatal("expected synthetic file changes to keep current snapshot")
	}

	bridge.OnDocumentClose(uri)
	if bridge.Graph().Node(uri) != nil {
		t.Fatal("expected synthetic node to be removed on close without filesystem fallback")
	}
}

func TestRulesetManagerLoadAndReload(t *testing.T) {
	dir := t.TempDir()
	writeSpecFile(t, filepath.Join(dir, ".telescope.yaml"), `extends: telescope:oas
rules:
  operation-description: off
contractTests:
  envFiles:
    - .env
`)
	writeSpecFile(t, filepath.Join(dir, ".env"), "TOKEN=one\n")
	writeSpecFile(t, filepath.Join(dir, ".spectral.yaml"), `extends: spectral:oas
rules:
  info-contact: error
`)

	engine := &treesitter.DiagnosticEngine{}
	mgr := NewRulesetManager(engine, slog.Default())
	if mgr.SpectralEngine() == nil {
		t.Fatal("expected spectral engine accessor to initialize engine")
	}

	if err := mgr.Load(dir); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if mgr.workspaceRoot != dir {
		t.Fatalf("workspaceRoot = %q, want %q", mgr.workspaceRoot, dir)
	}
	if mgr.telescopeCfg == nil {
		t.Fatal("expected telescope config to be loaded")
	}
	if mgr.telescopeCfg.Rules["operation-description"] != "off" {
		t.Fatalf("expected config rule override to load, got %+v", mgr.telescopeCfg.Rules)
	}
	if mgr.workspaceEnv["TOKEN"] != "one" {
		t.Fatalf("expected dotenv to load TOKEN=one, got %v", mgr.workspaceEnv)
	}
	if mgr.spectralRS == nil {
		t.Fatal("expected spectral ruleset to load")
	}
	if mgr.resolved == nil || len(mgr.resolved.Rules) == 0 {
		t.Fatal("expected merged ruleset after load")
	}
	if mgr.buildTransformer() == nil {
		t.Fatal("expected non-nil transformer after load")
	}

	writeSpecFile(t, filepath.Join(dir, ".telescope.yaml"), `extends: telescope:oas
rules:
  operation-description: error
contractTests:
  envFiles:
    - .env
`)
	writeSpecFile(t, filepath.Join(dir, ".env"), "TOKEN=two\n")
	if err := mgr.Reload(); err != nil {
		t.Fatalf("Reload: %v", err)
	}
	if mgr.telescopeCfg.Rules["operation-description"] != "error" {
		t.Fatalf("expected reloaded rule severity, got %+v", mgr.telescopeCfg.Rules)
	}
	if mgr.workspaceEnv["TOKEN"] != "two" {
		t.Fatalf("expected updated dotenv value, got %v", mgr.workspaceEnv)
	}
}

func TestMaterializeContractTestDocumentAndConfig(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "workflow.yaml")
	uri := protocol.DocumentURI(project.PathToURI(path))
	writeSpecFile(t, path, "openapi: 3.1.0\n")

	store := document.NewStore()
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: "openapi-yaml",
			Version:    1,
			Text:       "openapi: 3.1.0\ninfo:\n  title: Open Doc\n",
		},
	})
	ctx := &gossip.Context{Documents: store}

	tempDocPath, cleanup, err := materializeContractTestDocument(ctx, uri)
	if err != nil {
		t.Fatalf("materializeContractTestDocument open doc: %v", err)
	}
	defer cleanup()
	data, err := os.ReadFile(tempDocPath)
	if err != nil {
		t.Fatalf("ReadFile(%q): %v", tempDocPath, err)
	}
	if !strings.Contains(string(data), "Open Doc") {
		t.Fatalf("expected temp document to contain open buffer contents, got %s", string(data))
	}

	fallbackPath, fallbackCleanup, err := materializeContractTestDocument(nil, uri)
	if err != nil {
		t.Fatalf("materializeContractTestDocument fallback: %v", err)
	}
	defer fallbackCleanup()
	if fallbackPath != path {
		t.Fatalf("fallback path = %q, want %q", fallbackPath, path)
	}

	openapiCfgPath, openapiCleanup, err := materializeContractTestConfig(openapi.DocumentKindOpenAPI, path, contractRunOptions{
		BaseURL:     "https://api.example.com",
		OperationID: "listUsers",
		Tags:        []string{"users", "beta"},
	})
	if err != nil {
		t.Fatalf("materializeContractTestConfig openapi: %v", err)
	}
	defer openapiCleanup()
	openapiCfgBytes, err := os.ReadFile(openapiCfgPath)
	if err != nil {
		t.Fatalf("ReadFile(%q): %v", openapiCfgPath, err)
	}
	openapiCfg := string(openapiCfgBytes)
	for _, want := range []string{`"baseUrl": "https://api.example.com"`, `"spec": `, `"tags": [`} {
		if !strings.Contains(openapiCfg, want) {
			t.Fatalf("expected OpenAPI config to contain %q, got %s", want, openapiCfg)
		}
	}

	arazzoCfgPath, arazzoCleanup, err := materializeContractTestConfig(openapi.DocumentKindArazzo, path, contractRunOptions{
		BaseURL: "https://workflow.example.com",
	})
	if err != nil {
		t.Fatalf("materializeContractTestConfig arazzo: %v", err)
	}
	defer arazzoCleanup()
	arazzoCfgBytes, err := os.ReadFile(arazzoCfgPath)
	if err != nil {
		t.Fatalf("ReadFile(%q): %v", arazzoCfgPath, err)
	}
	if !strings.Contains(string(arazzoCfgBytes), `"doc": `) {
		t.Fatalf("expected Arazzo config to contain doc path, got %s", string(arazzoCfgBytes))
	}
}
