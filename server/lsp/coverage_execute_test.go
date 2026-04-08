package lsp

import (
	"strconv"
	"strings"
	"testing"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestNextContractRunID_Incrementing(t *testing.T) {
	id1 := nextContractRunID()
	id2 := nextContractRunID()
	if id1 == id2 {
		t.Error("sequential IDs should differ")
	}
	if !strings.HasPrefix(id1, "ct-") {
		t.Errorf("expected ct- prefix, got %q", id1)
	}
	n1, _ := strconv.Atoi(strings.TrimPrefix(id1, "ct-"))
	n2, _ := strconv.Atoi(strings.TrimPrefix(id2, "ct-"))
	if n2 != n1+1 {
		t.Errorf("expected sequential numbers: %d, %d", n1, n2)
	}
}

func TestStatusDescription(t *testing.T) {
	tests := []struct {
		code string
		want string
	}{
		{"200", "OK"},
		{"201", "Created"},
		{"204", "No Content"},
		{"400", "Bad Request"},
		{"401", "Unauthorized"},
		{"403", "Forbidden"},
		{"404", "Not Found"},
		{"500", "Internal Server Error"},
		{"418", "Response"},
		{"", "Response"},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			got := statusDescription(tt.code)
			if got != tt.want {
				t.Errorf("statusDescription(%q) = %q, want %q", tt.code, got, tt.want)
			}
		})
	}
}

func TestExampleMatchesSchemaType(t *testing.T) {
	tests := []struct {
		name       string
		example    string
		schemaType string
		want       bool
	}{
		{"string matches string", `"hello"`, "string", true},
		{"boolean true", "true", "boolean", true},
		{"boolean false", "false", "boolean", true},
		{"integer matches integer", "42", "integer", true},
		{"integer matches number", "42", "number", true},
		{"float matches number", "3.14", "number", true},
		{"float does not match integer", "3.14", "integer", false},
		{"object matches object", `{"key":"val"}`, "object", true},
		{"array matches array", `[1,2,3]`, "array", true},
		{"string does not match integer", `"hello"`, "integer", false},
		{"unknown type always matches", "anything", "unknown", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := exampleMatchesSchemaType(tt.example, tt.schemaType)
			if got != tt.want {
				t.Errorf("exampleMatchesSchemaType(%q, %q) = %v, want %v",
					tt.example, tt.schemaType, got, tt.want)
			}
		})
	}
}

func TestDetectExampleLiteralType(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{`"hello"`, "string"},
		{`'world'`, "string"},
		{"true", "boolean"},
		{"false", "boolean"},
		{"null", "null"},
		{"~", "null"},
		{"42", "integer"},
		{"-7", "integer"},
		{"3.14", "number"},
		{"-0.5", "number"},
		{`{"a":1}`, "object"},
		{`[1, 2]`, "array"},
		{"bare word", "string"},
		{"", "string"},
		{"  true  ", "boolean"},
		{"  42  ", "integer"},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			got := detectExampleLiteralType(tt.raw)
			if got != tt.want {
				t.Errorf("detectExampleLiteralType(%q) = %q, want %q", tt.raw, got, tt.want)
			}
		})
	}
}

func TestMarshalBundleDocument_YAML(t *testing.T) {
	doc := map[string]any{"openapi": "3.0.0", "info": map[string]any{"title": "Test"}}
	data, lang, err := marshalBundleDocument(doc, openapi.FormatYAML)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if lang != "yaml" {
		t.Errorf("language = %q, want %q", lang, "yaml")
	}
	if !strings.Contains(string(data), "openapi") {
		t.Error("YAML output should contain 'openapi'")
	}
}

func TestMarshalBundleDocument_JSON(t *testing.T) {
	doc := map[string]any{"openapi": "3.0.0"}
	data, lang, err := marshalBundleDocument(doc, openapi.FormatJSON)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if lang != "json" {
		t.Errorf("language = %q, want %q", lang, "json")
	}
	if !strings.HasSuffix(string(data), "\n") {
		t.Error("JSON output should end with newline")
	}
}

func TestExtractDocURI(t *testing.T) {
	tests := []struct {
		name string
		args []interface{}
		want string
	}{
		{"nil args", nil, ""},
		{"empty args", []interface{}{}, ""},
		{"string arg", []interface{}{"file:///a.yaml"}, "file:///a.yaml"},
		{"non-string arg", []interface{}{42}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractDocURI(tt.args)
			if string(got) != tt.want {
				t.Errorf("extractDocURI() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestExtractContractRunOptions(t *testing.T) {
	t.Run("no args uses defaults", func(t *testing.T) {
		opts := extractContractRunOptions(nil)
		if opts.BaseURL != "http://localhost:8080" {
			t.Errorf("BaseURL = %q, want default", opts.BaseURL)
		}
	})

	t.Run("string arg sets baseURL", func(t *testing.T) {
		opts := extractContractRunOptions([]interface{}{"ignored", "https://api.example.com"})
		if opts.BaseURL != "https://api.example.com" {
			t.Errorf("BaseURL = %q, want %q", opts.BaseURL, "https://api.example.com")
		}
	})

	t.Run("map arg with all fields", func(t *testing.T) {
		opts := extractContractRunOptions([]interface{}{"ignored", map[string]interface{}{
			"baseUrl":     "https://custom.test",
			"operationId": "getUser",
			"tags":        []interface{}{"users", "admin"},
			"sync":        true,
			"credentials": map[string]interface{}{"token": "secret"},
		}})
		if opts.BaseURL != "https://custom.test" {
			t.Errorf("BaseURL = %q", opts.BaseURL)
		}
		if opts.OperationID != "getUser" {
			t.Errorf("OperationID = %q", opts.OperationID)
		}
		if len(opts.Tags) != 2 || opts.Tags[0] != "users" || opts.Tags[1] != "admin" {
			t.Errorf("Tags = %v", opts.Tags)
		}
		if !opts.Sync {
			t.Error("Sync should be true")
		}
		if opts.CredentialOverrides["token"] != "secret" {
			t.Errorf("CredentialOverrides = %v", opts.CredentialOverrides)
		}
	})

	t.Run("empty string does not override default baseURL", func(t *testing.T) {
		opts := extractContractRunOptions([]interface{}{"x", "  "})
		if opts.BaseURL != "http://localhost:8080" {
			t.Errorf("BaseURL = %q, want default", opts.BaseURL)
		}
	})
}

func TestExecuteCommandDeps_EffectiveConfig(t *testing.T) {
	t.Run("nil deps returns default", func(t *testing.T) {
		var d *ExecuteCommandDeps
		cfg := d.EffectiveConfig()
		if cfg == nil {
			t.Fatal("expected non-nil config")
		}
	})

	t.Run("provider overrides static", func(t *testing.T) {
		custom := &config.Config{Extends: "telescope:all"}
		d := &ExecuteCommandDeps{
			Config:         config.DefaultConfig(),
			ConfigProvider: func() *config.Config { return custom },
		}
		if d.EffectiveConfig() != custom {
			t.Error("expected provider config to take precedence")
		}
	})

	t.Run("static config used when no provider", func(t *testing.T) {
		custom := &config.Config{Extends: "telescope:strict"}
		d := &ExecuteCommandDeps{Config: custom}
		if d.EffectiveConfig() != custom {
			t.Error("expected static config")
		}
	})
}

func TestMergeBundleComponents(t *testing.T) {
	dst := map[string]any{
		"components": map[string]any{
			"schemas": map[string]any{
				"Existing": map[string]any{"type": "object"},
			},
		},
	}
	src := map[string]any{
		"components": map[string]any{
			"schemas": map[string]any{
				"Existing": map[string]any{"type": "string"},
				"New":      map[string]any{"type": "integer"},
			},
			"responses": map[string]any{
				"NotFound": map[string]any{"description": "Not found"},
			},
		},
	}

	mergeBundleComponents(dst, src)

	comps := dst["components"].(map[string]any)
	schemas := comps["schemas"].(map[string]any)
	if schemas["Existing"].(map[string]any)["type"] != "object" {
		t.Error("existing schemas should not be overwritten")
	}
	if schemas["New"] == nil {
		t.Error("new schema should be merged in")
	}
	if comps["responses"] == nil {
		t.Error("new component kind should be merged in")
	}
}

func TestMergeBundleComponents_NoSrcComponents(t *testing.T) {
	dst := map[string]any{"info": "test"}
	src := map[string]any{"info": "other"}
	mergeBundleComponents(dst, src)
	if _, ok := dst["components"]; ok {
		t.Error("should not create components when src has none")
	}
}
