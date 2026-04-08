package lsp

import (
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestFormatDescription_Empty(t *testing.T) {
	if got := formatDescription(""); got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestFormatDescription_Short(t *testing.T) {
	desc := "A short description."
	got := formatDescription(desc)
	if !strings.Contains(got, "A short description.") {
		t.Errorf("expected description preserved, got %q", got)
	}
}

func TestFormatDescription_LongTruncated(t *testing.T) {
	desc := strings.Repeat("x", 600)
	got := formatDescription(desc)
	if len(got) > 600 {
		t.Errorf("expected truncated description, got len %d", len(got))
	}
	if !strings.HasSuffix(got, "...") {
		t.Errorf("expected trailing ellipsis, got %q", got[len(got)-10:])
	}
}

func TestFormatUnresolvedRefHover_ContainsPath(t *testing.T) {
	got := formatUnresolvedRefHover("./external.yaml#/components/schemas/Missing")
	if !strings.Contains(got, "$ref") {
		t.Errorf("expected $ref mention, got %q", got)
	}
	if !strings.Contains(got, "external.yaml") {
		t.Errorf("expected ref path in output, got %q", got)
	}
	if !strings.Contains(got, "could not be resolved") {
		t.Errorf("expected unresolved message, got %q", got)
	}
}

func TestMarkdownHover(t *testing.T) {
	hover := markdownHover("## Title\n\nSome text")
	if hover == nil {
		t.Fatal("expected non-nil hover")
	}
	if hover.Contents.Kind != protocol.Markdown {
		t.Errorf("expected Markdown kind, got %q", hover.Contents.Kind)
	}
	if hover.Contents.Value != "## Title\n\nSome text" {
		t.Errorf("unexpected content: %q", hover.Contents.Value)
	}
}

func TestFormatSchemaHoverWithContext_BasicType(t *testing.T) {
	schema := &openapi.Schema{
		Type:   "string",
		Format: "email",
		Description: openapi.DescriptionValue{
			Text: "User email address",
		},
	}
	got := formatSchemaHoverWithContext("UserEmail", schema, nil)

	if !strings.Contains(got, "### UserEmail") {
		t.Errorf("expected schema name heading, got %q", got)
	}
	if !strings.Contains(got, "`string`") {
		t.Errorf("expected type string, got %q", got)
	}
	if !strings.Contains(got, "`email`") {
		t.Errorf("expected format email, got %q", got)
	}
	if !strings.Contains(got, "User email address") {
		t.Errorf("expected description, got %q", got)
	}
}

func TestFormatSchemaHoverWithContext_WithEnum(t *testing.T) {
	schema := &openapi.Schema{
		Type: "string",
		Enum: []string{"active", "inactive", "pending"},
	}
	got := formatSchemaHoverWithContext("Status", schema, nil)
	if !strings.Contains(got, "active") {
		t.Errorf("expected enum values, got %q", got)
	}
	if !strings.Contains(got, "Enum") {
		t.Errorf("expected Enum label, got %q", got)
	}
}

func TestFormatSchemaHoverWithContext_WithFlags(t *testing.T) {
	schema := &openapi.Schema{
		Type:       "string",
		Deprecated: true,
		Nullable:   true,
		ReadOnly:   true,
	}
	got := formatSchemaHoverWithContext("", schema, nil)
	if !strings.Contains(got, "deprecated") {
		t.Errorf("expected deprecated flag, got %q", got)
	}
	if !strings.Contains(got, "nullable") {
		t.Errorf("expected nullable flag, got %q", got)
	}
	if !strings.Contains(got, "readOnly") {
		t.Errorf("expected readOnly flag, got %q", got)
	}
}

func TestFormatSchemaHoverWithContext_WithProperties(t *testing.T) {
	schema := &openapi.Schema{
		Type: "object",
		Properties: map[string]*openapi.Schema{
			"id":   {Type: "integer"},
			"name": {Type: "string"},
		},
		Required: []string{"id"},
	}
	got := formatSchemaHoverWithContext("User", schema, nil)
	if !strings.Contains(got, "`id`") {
		t.Errorf("expected id property, got %q", got)
	}
	if !strings.Contains(got, "`name`") {
		t.Errorf("expected name property, got %q", got)
	}
	if !strings.Contains(got, "**yes**") {
		t.Errorf("expected required marker, got %q", got)
	}
}

func TestFormatCompositionHoverWithContext_AllOf(t *testing.T) {
	schema := &openapi.Schema{
		AllOf: []*openapi.Schema{
			{
				Properties: map[string]*openapi.Schema{
					"id": {Type: "integer"},
				},
				Required: []string{"id"},
			},
			{
				Properties: map[string]*openapi.Schema{
					"name": {Type: "string"},
				},
			},
		},
	}
	got := formatCompositionHoverWithContext(schema, 0, nil)
	if !strings.Contains(got, "allOf") {
		t.Errorf("expected allOf label, got %q", got)
	}
	if !strings.Contains(got, "`id`") {
		t.Errorf("expected merged id property, got %q", got)
	}
	if !strings.Contains(got, "`name`") {
		t.Errorf("expected merged name property, got %q", got)
	}
}

func TestFormatCompositionHoverWithContext_OneOf(t *testing.T) {
	schema := &openapi.Schema{
		OneOf: []*openapi.Schema{
			{Ref: "#/components/schemas/Cat"},
			{Ref: "#/components/schemas/Dog"},
		},
		Discriminator: &openapi.Discriminator{PropertyName: "petType"},
	}
	got := formatCompositionHoverWithContext(schema, 0, nil)
	if !strings.Contains(got, "oneOf") {
		t.Errorf("expected oneOf label, got %q", got)
	}
	if !strings.Contains(got, "Discriminator") {
		t.Errorf("expected Discriminator label, got %q", got)
	}
	if !strings.Contains(got, "petType") {
		t.Errorf("expected discriminator property name, got %q", got)
	}
}

func TestFormatCompositionHoverWithContext_AnyOf(t *testing.T) {
	schema := &openapi.Schema{
		AnyOf: []*openapi.Schema{
			{Type: "string"},
			{Type: "integer"},
		},
	}
	got := formatCompositionHoverWithContext(schema, 0, nil)
	if !strings.Contains(got, "anyOf") {
		t.Errorf("expected anyOf label, got %q", got)
	}
	if !strings.Contains(got, "Variants") {
		t.Errorf("expected Variants label, got %q", got)
	}
}

func TestFormatRefHoverWithContext_Schema(t *testing.T) {
	target := &openapi.Schema{
		Type: "object",
		Properties: map[string]*openapi.Schema{
			"id": {Type: "integer"},
		},
	}
	got := formatRefHoverWithContext("#/components/schemas/Pet", target, nil)
	if !strings.Contains(got, "$ref") {
		t.Errorf("expected $ref label, got %q", got)
	}
	if !strings.Contains(got, "#/components/schemas/Pet") {
		t.Errorf("expected ref path, got %q", got)
	}
	if !strings.Contains(got, "`object`") {
		t.Errorf("expected object type, got %q", got)
	}
}

func TestFormatRefHoverWithContext_Response(t *testing.T) {
	target := &openapi.Response{
		Description: openapi.DescriptionValue{Text: "Success response"},
	}
	got := formatRefHoverWithContext("#/components/responses/Success", target, nil)
	if !strings.Contains(got, "Success response") {
		t.Errorf("expected response description, got %q", got)
	}
}

func TestFormatRefHoverWithContext_Parameter(t *testing.T) {
	target := &openapi.Parameter{
		Name: "limit",
		In:   "query",
	}
	got := formatRefHoverWithContext("#/components/parameters/Limit", target, nil)
	if !strings.Contains(got, "`query`") {
		t.Errorf("expected parameter in, got %q", got)
	}
}

func TestFormatRefHoverWithContext_SecurityScheme(t *testing.T) {
	target := &openapi.SecurityScheme{
		Type:   "http",
		Scheme: "bearer",
	}
	got := formatRefHoverWithContext("#/components/securitySchemes/Bearer", target, nil)
	if !strings.Contains(got, "`http`") {
		t.Errorf("expected scheme type, got %q", got)
	}
	if !strings.Contains(got, "`bearer`") {
		t.Errorf("expected scheme, got %q", got)
	}
}

func TestFormatRefHoverWithContext_ExternalRefSchema(t *testing.T) {
	target := &openapi.Schema{
		Ref: "./models.yaml#/components/schemas/Pet",
	}
	got := formatRefHoverWithContext("./models.yaml#/components/schemas/Pet", target, nil)
	if !strings.Contains(got, "external file") || !strings.Contains(got, "Schema") {
		t.Errorf("expected external ref fallback, got %q", got)
	}
}

func TestFormatRefHoverWithContext_UnknownType(t *testing.T) {
	target := 42
	got := formatRefHoverWithContext("#/something", target, nil)
	if !strings.Contains(got, "resolved") {
		t.Errorf("expected resolved fallback, got %q", got)
	}
}

func TestIsAtLocOrSameLineNameSpan_EmptyName(t *testing.T) {
	loc := openapi.Loc{}
	pos := protocol.Position{Line: 0, Character: 0}
	got := isAtLocOrSameLineNameSpan(pos, loc, "")
	if got {
		t.Error("expected false for empty name with zero loc")
	}
}

func TestIsAtLocOrSameLineNameSpan_WithinRange(t *testing.T) {
	loc := openapi.Loc{
		Range: navigator.Range{
			Start: navigator.Position{Line: 5, Character: 4},
			End:   navigator.Position{Line: 5, Character: 20},
		},
	}
	pos := protocol.Position{Line: 5, Character: 10}
	got := isAtLocOrSameLineNameSpan(pos, loc, "MySchema")
	if !got {
		t.Error("expected true when position is within range")
	}
}

func TestEscapeInlineBackticks_OddCount(t *testing.T) {
	got := escapeInlineBackticks("one ` stray backtick and ` another `")
	if !strings.Contains(got, "\\`") {
		t.Errorf("expected escaped backticks for odd count, got %q", got)
	}
}

func TestEscapeInlineBackticks_NoBackticks(t *testing.T) {
	got := escapeInlineBackticks("plain text")
	if got != "plain text" {
		t.Errorf("expected unmodified text, got %q", got)
	}
}

func TestRefBaseName_Segments(t *testing.T) {
	tests := []struct {
		ref, want string
	}{
		{"#/components/schemas/Pet", "Pet"},
		{"Pet", "Pet"},
		{"./models.yaml#/components/schemas/User", "User"},
		{"#/a/b/c/d", "d"},
	}
	for _, tt := range tests {
		got := refBaseName(tt.ref)
		if got != tt.want {
			t.Errorf("refBaseName(%q) = %q, want %q", tt.ref, got, tt.want)
		}
	}
}

func TestFormatSchemaFlags_Const(t *testing.T) {
	schema := &openapi.Schema{HasConst: true}
	got := formatSchemaFlags(schema)
	if !strings.Contains(got, "const") {
		t.Errorf("expected const flag, got %q", got)
	}
}

func TestFormatSchemaConstraints_MinMax(t *testing.T) {
	min := float64(0)
	max := float64(100)
	schema := &openapi.Schema{
		Minimum: &min,
		Maximum: &max,
	}
	got := formatSchemaConstraints(schema)
	if !strings.Contains(got, "minimum: 0") {
		t.Errorf("expected minimum, got %q", got)
	}
	if !strings.Contains(got, "maximum: 100") {
		t.Errorf("expected maximum, got %q", got)
	}
}

func TestMergeAllOfProperties_Hover(t *testing.T) {
	schemas := []*openapi.Schema{
		{
			Properties: map[string]*openapi.Schema{
				"id": {Type: "integer"},
			},
			Required: []string{"id"},
		},
		{
			Properties: map[string]*openapi.Schema{
				"name": {Type: "string"},
			},
			Required: []string{"name"},
		},
	}
	merged := mergeAllOfProperties(schemas)
	if len(merged.Properties) != 2 {
		t.Errorf("expected 2 merged properties, got %d", len(merged.Properties))
	}
	if len(merged.Required) != 2 {
		t.Errorf("expected 2 required fields, got %d", len(merged.Required))
	}
	if merged.Type != "object" {
		t.Errorf("expected type object, got %q", merged.Type)
	}
}

func TestSummarizeSchemaShape(t *testing.T) {
	tests := []struct {
		name   string
		schema *openapi.Schema
		want   string
	}{
		{"nil", nil, ""},
		{"array", &openapi.Schema{Type: "array", Items: &openapi.Schema{Type: "string"}}, "array"},
		{"object with props", &openapi.Schema{Type: "object", Properties: map[string]*openapi.Schema{"a": {}, "b": {}}}, "{a, b}"},
		{"bare object", &openapi.Schema{Type: "object"}, "object"},
		{"string", &openapi.Schema{Type: "string"}, "string"},
		{"enum", &openapi.Schema{Enum: []string{"a", "b"}}, "enum"},
		{"empty", &openapi.Schema{}, ""},
	}
	for _, tt := range tests {
		got := summarizeSchemaShape(tt.schema, 0, nil)
		if got != tt.want {
			t.Errorf("summarizeSchemaShape(%s) = %q, want %q", tt.name, got, tt.want)
		}
	}
}
