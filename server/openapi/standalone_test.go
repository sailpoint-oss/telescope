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

func TestParseAndIndexInvalidYAML(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`{{{invalid`))
	if idx == nil {
		t.Fatal("nil index")
	}
	if idx.Document.DocType != openapi.DocTypeUnknown {
		t.Errorf("DocType = %d, want unknown", idx.Document.DocType)
	}
}
