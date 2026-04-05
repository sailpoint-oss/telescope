package rules

import (
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestWalk_CircularSchemaReference(t *testing.T) {
	schemaA := &openapi.Schema{
		Type:       "object",
		Properties: make(map[string]*openapi.Schema),
	}
	schemaB := &openapi.Schema{
		Type:       "object",
		Properties: make(map[string]*openapi.Schema),
	}
	schemaA.Properties["b"] = schemaB
	schemaB.Properties["a"] = schemaA // circular

	doc := &openapi.Document{
		Version:       "3.1.0",
		ParsedVersion: openapi.Version31,
		DocType:       openapi.DocTypeRoot,
		Components: &openapi.Components{
			Schemas: map[string]*openapi.Schema{
				"A": schemaA,
			},
		},
	}

	idx := &openapi.Index{Document: doc}

	var visited int
	r := NewReporter("test-circular", ctypes.SeverityWarning)
	WalkIndex(idx, Visitors{
		RecursiveSchema: func(name string, schema *openapi.Schema, pointer string, r *Reporter) {
			visited++
			if visited > 100 {
				t.Fatal("RecursiveSchema visited more than 100 nodes — possible infinite loop")
			}
		},
	}, r)

	if visited != 2 {
		t.Errorf("visited = %d, want 2", visited)
	}
}

func TestWalk_DeeplyNestedSchema(t *testing.T) {
	const depth = 100
	const walkerMaxDepth = 64 // mirrors barrelman's internal maxWalkDepth
	schemas := make([]*openapi.Schema, depth)
	for i := depth - 1; i >= 0; i-- {
		schemas[i] = &openapi.Schema{
			Type:       "object",
			Properties: make(map[string]*openapi.Schema),
		}
		if i < depth-1 {
			schemas[i].AllOf = []*openapi.Schema{schemas[i+1]}
		}
	}

	doc := &openapi.Document{
		Version:       "3.1.0",
		ParsedVersion: openapi.Version31,
		DocType:       openapi.DocTypeRoot,
		Components: &openapi.Components{
			Schemas: map[string]*openapi.Schema{
				"Deep": schemas[0],
			},
		},
	}
	idx := &openapi.Index{Document: doc}

	var visited int
	r := NewReporter("test-deep", ctypes.SeverityWarning)
	WalkIndex(idx, Visitors{
		RecursiveSchema: func(name string, schema *openapi.Schema, pointer string, r *Reporter) {
			visited++
		},
	}, r)

	if visited > walkerMaxDepth+1 {
		t.Errorf("visited = %d, exceeds walkerMaxDepth+1 = %d", visited, walkerMaxDepth+1)
	}
	if visited == 0 {
		t.Error("visited = 0, expected at least 1 visit")
	}
}

func TestWalk_NilIndex(t *testing.T) {
	r := NewReporter("test-nil", ctypes.SeverityWarning)
	WalkIndex(nil, Visitors{
		Document: func(doc *openapi.Document, r *Reporter) {
			t.Error("Document visitor should not be called for nil index")
		},
	}, r)
}

func TestWalk_NilDocument(t *testing.T) {
	idx := &openapi.Index{Document: nil}
	r := NewReporter("test-nil-doc", ctypes.SeverityWarning)
	WalkIndex(idx, Visitors{
		Document: func(doc *openapi.Document, r *Reporter) {
			t.Error("Document visitor should not be called for nil document")
		},
	}, r)
}
