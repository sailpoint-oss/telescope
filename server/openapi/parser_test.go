package openapi_test

import (
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_json "github.com/tree-sitter/tree-sitter-json/bindings/go"
	ts_yaml "github.com/tree-sitter-grammars/tree-sitter-yaml/bindings/go"

	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func yamlLang() *tree_sitter.Language {
	return tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
}

func jsonLang() *tree_sitter.Language {
	return tree_sitter.NewLanguage(unsafe.Pointer(ts_json.Language()))
}

func openYAML(t *testing.T, store *document.Store, uri protocol.DocumentURI, content string) {
	t.Helper()
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: "yaml",
			Version:    1,
			Text:       content,
		},
	})
}

func setupManager(t *testing.T) (*treesitter.Manager, *document.Store) {
	t.Helper()
	store := document.NewStore()
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: yamlLang(), Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
			{Language: jsonLang(), Extensions: []string{".json"}, LanguageID: "json"},
		},
	}, store)
	t.Cleanup(mgr.Close)
	return mgr, store
}

func TestParseYAML_BasicDocument(t *testing.T) {
	mgr, store := setupManager(t)
	content := `openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      summary: List users
      responses:
        "200":
          description: OK
`
	uri := protocol.DocumentURI("file:///test.yaml")
	openYAML(t, store, uri, content)

	tree := mgr.GetTree(uri)
	if tree == nil {
		t.Fatal("GetTree returned nil")
	}

	parser := openapi.NewParser(tree, openapi.FormatYAML)
	doc := parser.Parse()

	if doc.Version != "3.1.0" {
		t.Errorf("Version = %q, want %q", doc.Version, "3.1.0")
	}
	if doc.ParsedVersion != openapi.Version31 {
		t.Errorf("ParsedVersion = %v, want Version31", doc.ParsedVersion)
	}
	if doc.DocType != openapi.DocTypeRoot {
		t.Errorf("DocType = %v, want DocTypeRoot", doc.DocType)
	}
	if doc.Info == nil {
		t.Fatal("Info is nil")
	}
	if doc.Info.Title != "Test API" {
		t.Errorf("Info.Title = %q, want %q", doc.Info.Title, "Test API")
	}
	if doc.Info.Version != "1.0.0" {
		t.Errorf("Info.Version = %q, want %q", doc.Info.Version, "1.0.0")
	}
	if len(doc.Paths) != 1 {
		t.Fatalf("len(Paths) = %d, want 1", len(doc.Paths))
	}
	usersPath, ok := doc.Paths["/users"]
	if !ok {
		t.Fatal("path /users not found")
	}
	if usersPath.Get == nil {
		t.Fatal("GET /users is nil")
	}
	if usersPath.Get.OperationID != "listUsers" {
		t.Errorf("OperationID = %q, want %q", usersPath.Get.OperationID, "listUsers")
	}
}

func TestParseYAML_Components(t *testing.T) {
	mgr, store := setupManager(t)
	content := `openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths: {}
components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
        age:
          type: integer
      required:
        - name
    Error:
      type: object
      properties:
        message:
          type: string
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
`
	uri := protocol.DocumentURI("file:///test.yaml")
	openYAML(t, store, uri, content)
	tree := mgr.GetTree(uri)
	if tree == nil {
		t.Fatal("tree is nil")
	}

	parser := openapi.NewParser(tree, openapi.FormatYAML)
	doc := parser.Parse()

	if doc.Components == nil {
		t.Fatal("Components is nil")
	}
	if len(doc.Components.Schemas) != 2 {
		t.Fatalf("len(Schemas) = %d, want 2", len(doc.Components.Schemas))
	}
	pet, ok := doc.Components.Schemas["Pet"]
	if !ok {
		t.Fatal("schema Pet not found")
	}
	if pet.Type != "object" {
		t.Errorf("Pet.Type = %q, want %q", pet.Type, "object")
	}
	if len(pet.Properties) != 2 {
		t.Errorf("len(Pet.Properties) = %d, want 2", len(pet.Properties))
	}
	if len(pet.Required) != 1 || pet.Required[0] != "name" {
		t.Errorf("Pet.Required = %v, want [name]", pet.Required)
	}

	if len(doc.Components.SecuritySchemes) != 1 {
		t.Fatalf("len(SecuritySchemes) = %d, want 1", len(doc.Components.SecuritySchemes))
	}
	bearer, ok := doc.Components.SecuritySchemes["bearerAuth"]
	if !ok {
		t.Fatal("bearerAuth not found")
	}
	if bearer.Type != "http" || bearer.Scheme != "bearer" {
		t.Errorf("bearerAuth = type:%s scheme:%s", bearer.Type, bearer.Scheme)
	}
}

func TestParseYAML_Servers(t *testing.T) {
	mgr, store := setupManager(t)
	content := `openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
    description: Production
  - url: http://localhost:8080
    description: Dev
paths: {}
`
	uri := protocol.DocumentURI("file:///test.yaml")
	openYAML(t, store, uri, content)
	tree := mgr.GetTree(uri)

	parser := openapi.NewParser(tree, openapi.FormatYAML)
	doc := parser.Parse()

	if len(doc.Servers) != 2 {
		t.Fatalf("len(Servers) = %d, want 2", len(doc.Servers))
	}
	if doc.Servers[0].URL != "https://api.example.com" {
		t.Errorf("Server[0].URL = %q", doc.Servers[0].URL)
	}
	if doc.Servers[1].URL != "http://localhost:8080" {
		t.Errorf("Server[1].URL = %q", doc.Servers[1].URL)
	}
}

func TestClassify(t *testing.T) {
	mgr, store := setupManager(t)
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
`
	uri := protocol.DocumentURI("file:///test.yaml")
	openYAML(t, store, uri, content)
	tree := mgr.GetTree(uri)

	result := openapi.Classify(tree, "test.yaml")
	if result.DocType != openapi.DocTypeRoot {
		t.Errorf("DocType = %v, want DocTypeRoot", result.DocType)
	}
	if result.Version != openapi.Version31 {
		t.Errorf("Version = %v, want Version31", result.Version)
	}
}

func TestVersionFromString(t *testing.T) {
	tests := []struct {
		input string
		want  openapi.Version
	}{
		{"3.1.0", openapi.Version31},
		{"3.0.3", openapi.Version30},
		{"2.0", openapi.Version20},
		{"3.2.0", openapi.Version32},
		{"", openapi.VersionUnknown},
		{"4.0", openapi.VersionUnknown},
	}
	for _, tt := range tests {
		got := openapi.VersionFromString(tt.input)
		if got != tt.want {
			t.Errorf("VersionFromString(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestFormatFromURI(t *testing.T) {
	tests := []struct {
		uri  string
		want openapi.FileFormat
	}{
		{"test.yaml", openapi.FormatYAML},
		{"test.yml", openapi.FormatYAML},
		{"test.json", openapi.FormatJSON},
		{"test.txt", openapi.FormatUnknown},
		{"path/to/spec.yaml", openapi.FormatYAML},
	}
	for _, tt := range tests {
		got := openapi.FormatFromURI(tt.uri)
		if got != tt.want {
			t.Errorf("FormatFromURI(%q) = %v, want %v", tt.uri, got, tt.want)
		}
	}
}

func TestResolver_LocalRef(t *testing.T) {
	mgr, store := setupManager(t)
	content := `openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths: {}
components:
  schemas:
    Pet:
      type: object
`
	uri := protocol.DocumentURI("file:///test.yaml")
	openYAML(t, store, uri, content)
	tree := mgr.GetTree(uri)

	parser := openapi.NewParser(tree, openapi.FormatYAML)
	doc := parser.Parse()

	idx := &openapi.Index{
		Document: doc,
		Schemas:  make(map[string]*openapi.Schema),
	}
	for name, s := range doc.Components.Schemas {
		idx.Schemas[name] = s
	}

	result, err := idx.ResolveRef("#/components/schemas/Pet")
	if err != nil {
		t.Fatalf("ResolveRef failed: %v", err)
	}
	schema, ok := result.(*openapi.Schema)
	if !ok {
		t.Fatal("result is not *Schema")
	}
	if schema.Type != "object" {
		t.Errorf("resolved schema type = %q, want %q", schema.Type, "object")
	}

	_, err = idx.ResolveRef("#/components/schemas/Nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent ref")
	}
}

func TestBuildIndex(t *testing.T) {
	mgr, store := setupManager(t)
	content := `openapi: "3.0.0"
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
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
`
	uri := protocol.DocumentURI("file:///test.yaml")
	openYAML(t, store, uri, content)
	tree := mgr.GetTree(uri)

	doc := store.Get(uri)
	idx := openapi.BuildIndex(tree, doc)

	if !idx.IsOpenAPI() {
		t.Error("IsOpenAPI() = false, want true")
	}
	if _, ok := idx.Operations["listPets"]; !ok {
		t.Error("operationId listPets not indexed")
	}
	if _, ok := idx.Schemas["Pet"]; !ok {
		t.Error("schema Pet not indexed")
	}
}
