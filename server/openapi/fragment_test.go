package openapi_test

import (
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_json "github.com/tree-sitter/tree-sitter-json/bindings/go"
	ts_yaml "github.com/tree-sitter-grammars/tree-sitter-yaml/bindings/go"

	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func parseYAMLTree(t *testing.T, content string) *treesitter.Tree {
	t.Helper()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	p := tree_sitter.NewParser()
	defer p.Close()
	if err := p.SetLanguage(lang); err != nil {
		t.Fatal(err)
	}
	raw := p.Parse([]byte(content), nil)
	return treesitter.NewTree(raw, []byte(content))
}

func parseJSONTree(t *testing.T, content string) *treesitter.Tree {
	t.Helper()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_json.Language()))
	p := tree_sitter.NewParser()
	defer p.Close()
	if err := p.SetLanguage(lang); err != nil {
		t.Fatal(err)
	}
	raw := p.Parse([]byte(content), nil)
	return treesitter.NewTree(raw, []byte(content))
}

func TestDetectFragment_PathItem(t *testing.T) {
	yaml := `
get:
  summary: Get users
  operationId: getUsers
post:
  summary: Create user
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentPathItem {
		t.Errorf("expected FragmentPathItem, got %v", got)
	}
}

func TestDetectFragment_PathItem_JSON(t *testing.T) {
	json := `{
  "get": {
    "summary": "Get users",
    "operationId": "getUsers"
  },
  "post": {
    "summary": "Create user"
  }
}`
	tree := parseJSONTree(t, json)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatJSON)
	if got != openapi.FragmentPathItem {
		t.Errorf("expected FragmentPathItem, got %v", got)
	}
}

func TestDetectFragment_Operation(t *testing.T) {
	yaml := `
operationId: getUser
summary: Get a user by ID
parameters:
  - name: id
    in: path
responses:
  '200':
    description: OK
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentOperation {
		t.Errorf("expected FragmentOperation, got %v", got)
	}
}

func TestDetectFragment_Operation_ResponsesWithSummary(t *testing.T) {
	yaml := `
summary: Create a pet
description: Creates a new pet in the store
requestBody:
  content:
    application/json:
      schema:
        type: object
responses:
  '201':
    description: Created
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentOperation {
		t.Errorf("expected FragmentOperation, got %v", got)
	}
}

func TestDetectFragment_Parameter(t *testing.T) {
	yaml := `
name: userId
in: path
required: true
schema:
  type: string
  format: uuid
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentParameter {
		t.Errorf("expected FragmentParameter, got %v", got)
	}
}

func TestDetectFragment_RequestBody(t *testing.T) {
	yaml := `
description: User creation payload
required: true
content:
  application/json:
    schema:
      type: object
      properties:
        name:
          type: string
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentRequestBody {
		t.Errorf("expected FragmentRequestBody, got %v", got)
	}
}

func TestDetectFragment_Response(t *testing.T) {
	yaml := `
description: Successful response
content:
  application/json:
    schema:
      type: object
headers:
  X-Rate-Limit:
    schema:
      type: integer
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentResponse {
		t.Errorf("expected FragmentResponse, got %v", got)
	}
}

func TestDetectFragment_Header(t *testing.T) {
	yaml := `
description: Rate limit header
schema:
  type: integer
  minimum: 0
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentHeader {
		t.Errorf("expected FragmentHeader, got %v", got)
	}
}

func TestDetectFragment_SecurityScheme_APIKey(t *testing.T) {
	yaml := `
type: apiKey
name: X-API-Key
in: header
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentSecurityScheme {
		t.Errorf("expected FragmentSecurityScheme, got %v", got)
	}
}

func TestDetectFragment_SecurityScheme_OAuth2(t *testing.T) {
	yaml := `
type: oauth2
flows:
  authorizationCode:
    authorizationUrl: https://example.com/auth
    tokenUrl: https://example.com/token
    scopes:
      read: Read access
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentSecurityScheme {
		t.Errorf("expected FragmentSecurityScheme, got %v", got)
	}
}

func TestDetectFragment_Components(t *testing.T) {
	yaml := `
schemas:
  User:
    type: object
    properties:
      id:
        type: integer
responses:
  NotFound:
    description: Not found
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentComponents {
		t.Errorf("expected FragmentComponents, got %v", got)
	}
}

func TestDetectFragment_Server(t *testing.T) {
	yaml := `
url: https://api.example.com/v1
description: Production server
variables:
  version:
    default: v1
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentServer {
		t.Errorf("expected FragmentServer, got %v", got)
	}
}

func TestDetectFragment_Schema_TypeProperties(t *testing.T) {
	yaml := `
type: object
properties:
  id:
    type: integer
  name:
    type: string
required:
  - id
  - name
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentSchema {
		t.Errorf("expected FragmentSchema, got %v", got)
	}
}

func TestDetectFragment_Schema_AllOf(t *testing.T) {
	yaml := `
allOf:
  - $ref: '#/components/schemas/Base'
  - type: object
    properties:
      extra:
        type: string
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentSchema {
		t.Errorf("expected FragmentSchema, got %v", got)
	}
}

func TestDetectFragment_Schema_Enum(t *testing.T) {
	yaml := `
type: string
enum:
  - active
  - inactive
  - pending
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentSchema {
		t.Errorf("expected FragmentSchema, got %v", got)
	}
}

func TestDetectFragment_Schema_JSON(t *testing.T) {
	json := `{
  "type": "object",
  "properties": {
    "name": { "type": "string" }
  }
}`
	tree := parseJSONTree(t, json)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatJSON)
	if got != openapi.FragmentSchema {
		t.Errorf("expected FragmentSchema, got %v", got)
	}
}

func TestDetectFragment_RootDocument_ReturnsUnknown(t *testing.T) {
	yaml := `
openapi: "3.1.0"
info:
  title: My API
  version: "1.0"
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentUnknown {
		t.Errorf("expected FragmentUnknown for root doc, got %v", got)
	}
}

func TestDetectFragment_SwaggerDocument_ReturnsUnknown(t *testing.T) {
	yaml := `
swagger: "2.0"
info:
  title: Old API
  version: "1.0"
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentUnknown {
		t.Errorf("expected FragmentUnknown for swagger doc, got %v", got)
	}
}

func TestDetectFragment_EmptyDocument_ReturnsUnknown(t *testing.T) {
	yaml := ``
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentUnknown {
		t.Errorf("expected FragmentUnknown for empty doc, got %v", got)
	}
}

func TestDetectFragment_NilTree_ReturnsUnknown(t *testing.T) {
	got := openapi.DetectFragmentType(nil, openapi.FormatYAML)
	if got != openapi.FragmentUnknown {
		t.Errorf("expected FragmentUnknown for nil tree, got %v", got)
	}
}

func TestDetectFragment_NonOpenAPIYAML_ReturnsUnknown(t *testing.T) {
	yaml := `
name: my-project
version: 1.0.0
dependencies:
  express: ^4.18.0
`
	tree := parseYAMLTree(t, yaml)
	defer tree.Close()
	got := openapi.DetectFragmentType(tree, openapi.FormatYAML)
	if got != openapi.FragmentUnknown {
		t.Errorf("expected FragmentUnknown for non-OpenAPI YAML, got %v", got)
	}
}

func TestDetectFragment_String(t *testing.T) {
	cases := []struct {
		ft   openapi.FragmentType
		want string
	}{
		{openapi.FragmentUnknown, "Unknown"},
		{openapi.FragmentSchema, "Schema"},
		{openapi.FragmentPathItem, "PathItem"},
		{openapi.FragmentOperation, "Operation"},
		{openapi.FragmentParameter, "Parameter"},
		{openapi.FragmentRequestBody, "RequestBody"},
		{openapi.FragmentResponse, "Response"},
		{openapi.FragmentHeader, "Header"},
		{openapi.FragmentSecurityScheme, "SecurityScheme"},
		{openapi.FragmentComponents, "Components"},
		{openapi.FragmentServer, "Server"},
	}
	for _, tc := range cases {
		if got := tc.ft.String(); got != tc.want {
			t.Errorf("FragmentType(%d).String() = %q, want %q", tc.ft, got, tc.want)
		}
	}
}
