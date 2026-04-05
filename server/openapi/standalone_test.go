package openapi_test

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestParseAndIndex(t *testing.T) {
	spec := []byte(`openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
  description: A test API
paths:
  /users:
    get:
      operationId: getUsers
      summary: Get users
      tags:
        - Users
      responses:
        "200":
          description: OK
    post:
      operationId: createUser
      summary: Create user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUser'
      responses:
        "201":
          description: Created
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
      required:
        - id
        - name
    CreateUser:
      type: object
      properties:
        name:
          type: string
tags:
  - name: Users
    description: User management`)

	idx := openapi.ParseAndIndex(spec)
	if idx == nil {
		t.Fatal("ParseAndIndex returned nil")
	}
	if idx.Document == nil {
		t.Fatal("Document is nil")
	}

	// Check basic document fields
	if idx.Document.Version != "3.1.0" {
		t.Errorf("Version = %q, want %q", idx.Document.Version, "3.1.0")
	}
	if idx.Document.DocType != openapi.DocTypeRoot {
		t.Errorf("DocType = %d, want %d", idx.Document.DocType, openapi.DocTypeRoot)
	}

	// Check info
	if idx.Document.Info == nil {
		t.Fatal("Info is nil")
	}
	if idx.Document.Info.Title != "Test API" {
		t.Errorf("Info.Title = %q, want %q", idx.Document.Info.Title, "Test API")
	}

	// Check paths
	if len(idx.Document.Paths) != 1 {
		t.Fatalf("Paths count = %d, want 1", len(idx.Document.Paths))
	}
	usersPath, ok := idx.Document.Paths["/users"]
	if !ok {
		t.Fatal("/users path not found")
	}
	if usersPath.Get == nil {
		t.Fatal("GET /users is nil")
	}
	if usersPath.Get.OperationID != "getUsers" {
		t.Errorf("GET /users operationId = %q", usersPath.Get.OperationID)
	}
	if usersPath.Post == nil {
		t.Fatal("POST /users is nil")
	}

	// Check operations index
	if _, ok := idx.Operations["getUsers"]; !ok {
		t.Error("getUsers not in operations index")
	}

	// Check schemas
	if len(idx.Schemas) != 2 {
		t.Errorf("Schemas count = %d, want 2", len(idx.Schemas))
	}
	userSchema, ok := idx.Schemas["User"]
	if !ok {
		t.Fatal("User schema not found")
	}
	if userSchema.Type != "object" {
		t.Errorf("User.Type = %q, want %q", userSchema.Type, "object")
	}
	if len(userSchema.Properties) != 2 {
		t.Errorf("User.Properties count = %d, want 2", len(userSchema.Properties))
	}
	if len(userSchema.Required) != 2 {
		t.Errorf("User.Required count = %d, want 2", len(userSchema.Required))
	}

	// Check tags
	if len(idx.Tags) != 1 {
		t.Fatalf("Tags count = %d, want 1", len(idx.Tags))
	}
	if _, ok := idx.Tags["Users"]; !ok {
		t.Error("Users tag not found")
	}
}

func TestParseAndIndexMinimal(t *testing.T) {
	spec := []byte(`openapi: "3.0.0"
info:
  title: Minimal
  version: "0.1"`)

	idx := openapi.ParseAndIndex(spec)
	if idx == nil {
		t.Fatal("nil index")
	}
	if idx.Document.Version != "3.0.0" {
		t.Errorf("Version = %q", idx.Document.Version)
	}
	if idx.Document.ParsedVersion != openapi.Version30 {
		t.Errorf("ParsedVersion = %q", idx.Document.ParsedVersion)
	}
}

func TestParseAndIndexArazzo(t *testing.T) {
	doc := []byte(`arazzo: 1.0.1
info:
  title: Workflow
  version: "1.0.0"
sourceDescriptions:
  - name: api
    url: ./openapi.yaml
    type: openapi
workflows:
  - workflowId: getPets
    steps: []
`)

	idx := openapi.ParseAndIndex(doc)
	if idx == nil {
		t.Fatal("ParseAndIndex returned nil")
	}
	if idx.DocumentKind() != openapi.DocumentKindArazzo {
		t.Fatalf("DocumentKind = %q, want arazzo", idx.DocumentKind())
	}
	if !idx.IsArazzo() {
		t.Fatal("IsArazzo() = false, want true")
	}
	if idx.IsOpenAPI() {
		t.Fatal("IsOpenAPI() = true, want false")
	}
	if idx.Arazzo == nil {
		t.Fatal("Arazzo document is nil")
	}
	if idx.Version != "1.0.1" {
		t.Fatalf("Version = %q, want 1.0.1", idx.Version)
	}
}

func TestParseAndIndexInvalidYAML(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`{{{invalid`))
	if idx == nil {
		t.Fatal("nil index")
	}
	if idx.Document.DocType != openapi.DocTypeUnknown {
		t.Errorf("DocType = %d, want unknown", idx.Document.DocType)
	}
}

func TestParseAndIndexDepthLimit(t *testing.T) {
	// Build a YAML string with 70 levels of nested properties (exceeds maxSchemaDepth=64)
	var yaml string
	yaml = "openapi: \"3.1.0\"\ninfo:\n  title: Deep\n  version: \"1.0\"\ncomponents:\n  schemas:\n    Root:\n"
	indent := "      "
	for i := 0; i < 70; i++ {
		yaml += indent + "type: object\n"
		yaml += indent + "properties:\n"
		yaml += indent + "  nested:\n"
		indent += "    "
	}
	yaml += indent + "type: string\n"

	// Should not panic
	idx := openapi.ParseAndIndex([]byte(yaml))
	if idx == nil {
		t.Fatal("ParseAndIndex returned nil")
	}

	// Walk down to verify depth limit: eventually a schema will be nil
	schema := idx.Schemas["Root"]
	if schema == nil {
		t.Fatal("Root schema is nil")
	}
	depth := 0
	for schema != nil {
		depth++
		schema = schema.Properties["nested"]
	}
	// We should have stopped before reaching 70 levels
	if depth > 66 {
		t.Errorf("parsed %d levels deep, expected depth limit around 64", depth)
	}
}

func TestHasPathNilSafety(t *testing.T) {
	var nilIdx *openapi.Index
	if nilIdx.HasPath("/test") {
		t.Error("HasPath should return false for nil index")
	}

	nilDocIdx := &openapi.Index{Document: nil}
	if nilDocIdx.HasPath("/test") {
		t.Error("HasPath should return false for nil document")
	}

	validIdx := openapi.ParseAndIndex([]byte(`openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: test`))
	if !validIdx.HasPath("/users") {
		t.Error("HasPath should return true for existing path")
	}
	if validIdx.HasPath("/nonexistent") {
		t.Error("HasPath should return false for non-existing path")
	}
}

func TestParseAndIndexTagExtensions(t *testing.T) {
	spec := []byte(`openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
tags:
  - name: Users
    description: User management
    x-display-name: User Operations`)

	idx := openapi.ParseAndIndex(spec)
	if idx == nil {
		t.Fatal("ParseAndIndex returned nil")
	}
	tag, ok := idx.Tags["Users"]
	if !ok {
		t.Fatal("Users tag not found")
	}
	if tag.Extensions == nil {
		t.Fatal("Tag.Extensions is nil")
	}
	ext, ok := tag.Extensions["x-display-name"]
	if !ok {
		t.Fatal("x-display-name extension not found on tag")
	}
	if ext.Value != "User Operations" {
		t.Errorf("x-display-name = %q, want %q", ext.Value, "User Operations")
	}
}

func TestParseAndIndexCollectsRefsForHyphenatedParameters(t *testing.T) {
	spec := []byte(`openapi: "3.1.0"
info:
  title: Plex Test
  version: "1.0"
paths:
  /:
    get:
      parameters:
        - $ref: "#/components/parameters/X-Plex-Client-Identifier"
components:
  parameters:
    X-Plex-Client-Identifier:
      name: X-Plex-Client-Identifier
      in: header
      schema:
        type: string`)

	idx := openapi.ParseAndIndex(spec)
	if idx == nil {
		t.Fatal("ParseAndIndex returned nil")
	}

	target := "#/components/parameters/X-Plex-Client-Identifier"
	usages := idx.Refs[target]
	if len(usages) != 1 {
		t.Fatalf("expected 1 ref usage for %q, got %d", target, len(usages))
	}

	if usages[0].Loc.Range.Start.Line == 0 {
		t.Fatalf("expected parser-based ref location to be captured, got line %d", usages[0].Loc.Range.Start.Line)
	}
}
