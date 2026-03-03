package project

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/openapi"
)

func makeTestIndex(docType openapi.DocType, schemas map[string]bool) *openapi.Index {
	doc := &openapi.Document{
		DocType: docType,
		Components: &openapi.Components{
			Schemas: make(map[string]*openapi.Schema),
		},
	}
	for name := range schemas {
		doc.Components.Schemas[name] = &openapi.Schema{Type: "object"}
	}

	idx := &openapi.Index{
		Document: doc,
		Schemas:  make(map[string]*openapi.Schema),
		Refs:     make(map[string][]openapi.RefUsage),
	}
	for name, s := range doc.Components.Schemas {
		idx.Schemas[name] = s
	}
	return idx
}

func TestCrossFileResolver_LocalRef(t *testing.T) {
	rootIdx := makeTestIndex(openapi.DocTypeRoot, map[string]bool{"User": true})

	r := NewCrossFileResolver(map[string]*openapi.Index{
		"file:///api.yaml": rootIdx,
	})

	result, err := r.Resolve("file:///api.yaml", "#/components/schemas/User")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.TargetURI != "file:///api.yaml" {
		t.Errorf("TargetURI = %q, want file:///api.yaml", result.TargetURI)
	}
	if result.Value == nil {
		t.Error("resolved value should not be nil")
	}
}

func TestCrossFileResolver_ExternalRef(t *testing.T) {
	rootIdx := makeTestIndex(openapi.DocTypeRoot, map[string]bool{})
	schemaIdx := makeTestIndex(openapi.DocTypeFragment, map[string]bool{"Pet": true})

	r := NewCrossFileResolver(map[string]*openapi.Index{
		"file:///workspace/api.yaml":            rootIdx,
		"file:///workspace/schemas/pet.yaml": schemaIdx,
	})

	result, err := r.Resolve("file:///workspace/api.yaml", "./schemas/pet.yaml#/components/schemas/Pet")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.TargetURI != "file:///workspace/schemas/pet.yaml" {
		t.Errorf("TargetURI = %q, want file:///workspace/schemas/pet.yaml", result.TargetURI)
	}
	if result.Value == nil {
		t.Error("resolved value should not be nil")
	}
}

func TestCrossFileResolver_ExternalRefNoFragment(t *testing.T) {
	rootIdx := makeTestIndex(openapi.DocTypeRoot, map[string]bool{})
	schemaIdx := makeTestIndex(openapi.DocTypeFragment, map[string]bool{"Pet": true})

	r := NewCrossFileResolver(map[string]*openapi.Index{
		"file:///workspace/api.yaml":         rootIdx,
		"file:///workspace/schemas/pet.yaml": schemaIdx,
	})

	result, err := r.Resolve("file:///workspace/api.yaml", "./schemas/pet.yaml")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Value != schemaIdx.Document {
		t.Error("expected entire document to be returned when no fragment")
	}
}

func TestCrossFileResolver_MissingFile(t *testing.T) {
	rootIdx := makeTestIndex(openapi.DocTypeRoot, map[string]bool{})

	r := NewCrossFileResolver(map[string]*openapi.Index{
		"file:///workspace/api.yaml": rootIdx,
	})

	_, err := r.Resolve("file:///workspace/api.yaml", "./missing.yaml#/Foo")
	if err == nil {
		t.Error("expected error for missing file")
	}
}

func TestCrossFileResolver_Empty(t *testing.T) {
	r := NewCrossFileResolver(map[string]*openapi.Index{})
	_, err := r.Resolve("file:///a.yaml", "")
	if err == nil {
		t.Error("expected error for empty ref")
	}
}
