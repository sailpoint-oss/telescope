package openapi_test

import (
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_json "github.com/sailpoint-oss/tree-sitter-openapi/bindings/go/openapi_json"
	ts_yaml "github.com/sailpoint-oss/tree-sitter-openapi/bindings/go/openapi"

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

func TestParseYAML_DeeplyNestedSchema(t *testing.T) {
	// Verify that deeply nested schemas (exceeding maxSchemaDepth=64) don't
	// cause a stack overflow — the parser should return partial results.
	mgr, store := setupManager(t)

	// Build a spec with 70 levels of allOf nesting, exceeding the depth limit.
	var content string
	content = "openapi: \"3.1.0\"\ninfo:\n  title: Deep\n  version: \"1.0\"\npaths: {}\ncomponents:\n  schemas:\n    Root:\n"
	indent := "      "
	for i := 0; i < 70; i++ {
		content += indent + "allOf:\n"
		content += indent + "  - type: object\n"
		indent += "    "
	}

	uri := protocol.DocumentURI("file:///deep.yaml")
	openYAML(t, store, uri, content)

	tree := mgr.GetTree(uri)
	if tree == nil {
		t.Fatal("GetTree returned nil")
	}

	// Must not panic.
	parser := openapi.NewParser(tree, openapi.FormatYAML)
	doc := parser.Parse()

	if doc.Components == nil {
		t.Fatal("Components is nil")
	}
	if _, ok := doc.Components.Schemas["Root"]; !ok {
		t.Fatal("Root schema not parsed")
	}
}

func TestParseYAML_NilValueMapping(t *testing.T) {
	// A YAML key with no value (trailing key) must not cause a nil panic.
	mgr, store := setupManager(t)
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /test:
    get:
      summary:
      responses:
        "200":
          description: OK
`
	uri := protocol.DocumentURI("file:///nil-value.yaml")
	openYAML(t, store, uri, content)

	tree := mgr.GetTree(uri)
	if tree == nil {
		t.Fatal("GetTree returned nil")
	}

	// Must not panic — summary has no value node.
	parser := openapi.NewParser(tree, openapi.FormatYAML)
	doc := parser.Parse()

	if doc.Version != "3.1.0" {
		t.Errorf("Version = %q, want %q", doc.Version, "3.1.0")
	}
}

func TestParseYAML_Callbacks(t *testing.T) {
	mgr, store := setupManager(t)
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths: {}
components:
  callbacks:
    myWebhook:
      "{$request.body#/callbackUrl}":
        post:
          summary: Webhook notification
          responses:
            "200":
              description: OK
`
	uri := protocol.DocumentURI("file:///callbacks.yaml")
	openYAML(t, store, uri, content)

	tree := mgr.GetTree(uri)
	if tree == nil {
		t.Fatal("GetTree returned nil")
	}

	parser := openapi.NewParser(tree, openapi.FormatYAML)
	doc := parser.Parse()

	if doc.Components == nil {
		t.Fatal("Components is nil")
	}
	if len(doc.Components.Callbacks) != 1 {
		t.Fatalf("len(Callbacks) = %d, want 1", len(doc.Components.Callbacks))
	}
	cb, ok := doc.Components.Callbacks["myWebhook"]
	if !ok {
		t.Fatal("myWebhook callback not found")
	}
	if len(*cb) != 1 {
		t.Fatalf("len(myWebhook) = %d, want 1", len(*cb))
	}
}

func TestParseYAML_ParameterExamples(t *testing.T) {
	mgr, store := setupManager(t)
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /items:
    get:
      parameters:
        - name: status
          in: query
          examples:
            active:
              value: active
              summary: Active items
            archived:
              value: archived
      responses:
        "200":
          description: OK
`
	uri := protocol.DocumentURI("file:///param-examples.yaml")
	openYAML(t, store, uri, content)

	tree := mgr.GetTree(uri)
	if tree == nil {
		t.Fatal("GetTree returned nil")
	}

	parser := openapi.NewParser(tree, openapi.FormatYAML)
	doc := parser.Parse()

	item, ok := doc.Paths["/items"]
	if !ok {
		t.Fatal("/items path not found")
	}
	if item.Get == nil {
		t.Fatal("GET /items is nil")
	}
	if len(item.Get.Parameters) != 1 {
		t.Fatalf("len(Parameters) = %d, want 1", len(item.Get.Parameters))
	}
	param := item.Get.Parameters[0]
	if len(param.Examples) != 2 {
		t.Fatalf("len(Examples) = %d, want 2", len(param.Examples))
	}
	if _, ok := param.Examples["active"]; !ok {
		t.Error("example 'active' not found")
	}
	if _, ok := param.Examples["archived"]; !ok {
		t.Error("example 'archived' not found")
	}
}

func TestParseYAML_UTF16RangeAccuracy(t *testing.T) {
	mgr, store := setupManager(t)
	// The title "café" starts at byte column 10 ("  title: c" = 10 bytes)
	// but "café" in UTF-8 is 5 bytes (c=1, a=1, f=1, é=2), so the end
	// byte col is 15, while UTF-16 end col is 14 (each char = 1 UTF-16 unit).
	// "  title: " is 9 bytes; the value node starts at col 9.
	// end col in UTF-16: 9 + 4 (c, a, f, é each = 1 UTF-16 code unit) = 13
	// end col in bytes:  9 + 5 = 14
	content := "openapi: \"3.1.0\"\ninfo:\n  title: caf\xc3\xa9\n  version: \"1.0\"\npaths: {}\n"
	uri := protocol.DocumentURI("file:///utf16-test.yaml")
	openYAML(t, store, uri, content)

	tree := mgr.GetTree(uri)
	if tree == nil {
		t.Fatal("GetTree returned nil")
	}

	parser := openapi.NewParser(tree, openapi.FormatYAML)
	doc := parser.Parse()
	if doc.Info == nil {
		t.Fatal("Info is nil")
	}

	titleRange := doc.Info.TitleLoc.Range
	if titleRange.Start.Line != 2 {
		t.Errorf("TitleLoc.Start.Line = %d, want 2", titleRange.Start.Line)
	}
	// "café" starts after "  title: " => UTF-16 character 9
	if titleRange.Start.Character != 9 {
		t.Errorf("TitleLoc.Start.Character = %d, want 9", titleRange.Start.Character)
	}
	// "café" = 4 UTF-16 code units, so end character = 13
	if titleRange.End.Character != 13 {
		t.Errorf("TitleLoc.End.Character = %d, want 13 (UTF-16)", titleRange.End.Character)
	}
}

func TestParseYAML_UTF16RangeEmoji(t *testing.T) {
	mgr, store := setupManager(t)
	// 🚀 is U+1F680 = 4 UTF-8 bytes = 2 UTF-16 code units (surrogate pair)
	content := "openapi: \"3.1.0\"\ninfo:\n  title: \xf0\x9f\x9a\x80test\n  version: \"1.0\"\npaths: {}\n"
	uri := protocol.DocumentURI("file:///emoji-test.yaml")
	openYAML(t, store, uri, content)

	tree := mgr.GetTree(uri)
	if tree == nil {
		t.Fatal("GetTree returned nil")
	}

	parser := openapi.NewParser(tree, openapi.FormatYAML)
	doc := parser.Parse()
	if doc.Info == nil {
		t.Fatal("Info is nil")
	}

	titleRange := doc.Info.TitleLoc.Range
	// "🚀test" starts at col 9 (after "  title: ")
	if titleRange.Start.Character != 9 {
		t.Errorf("Start.Character = %d, want 9", titleRange.Start.Character)
	}
	// "🚀" = 2 UTF-16 units, "test" = 4 => total 6, end = 9 + 6 = 15
	// But raw byte end would be 9 + 8 = 17 (4 bytes for 🚀 + 4 for test)
	if titleRange.End.Character != 15 {
		t.Errorf("End.Character = %d, want 15 (UTF-16)", titleRange.End.Character)
	}
}
