package lsp_test

import (
	"strings"
	"testing"

	"github.com/sailpoint-oss/telescope/server/lsp"
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
