package rules

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestWalk_CircularSchemaReference(t *testing.T) {
	// Construct a schema graph with a cycle: A -> B -> A via properties.
	// Walk must terminate without hanging or crashing.
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
	r := NewReporter("test-circular", protocol.SeverityWarning)
	Walk(idx, Visitors{
		RecursiveSchema: func(name string, schema *openapi.Schema, pointer string, r *Reporter) {
			visited++
			if visited > 100 {
				t.Fatal("RecursiveSchema visited more than 100 nodes — possible infinite loop")
			}
		},
	}, r)

	// With schemas A and B, we expect exactly 2 visits (A, then B; the
	// back-edge from B→A is skipped because A is already visited).
	if visited != 2 {
		t.Errorf("visited = %d, want 2", visited)
	}
}

func TestWalk_DeeplyNestedSchema(t *testing.T) {
	// Build a chain of 100 schemas via allOf. The walker's depth limit
	// (maxWalkDepth=64) should prevent visiting all of them.
	const depth = 100
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
	r := NewReporter("test-deep", protocol.SeverityWarning)
	Walk(idx, Visitors{
		RecursiveSchema: func(name string, schema *openapi.Schema, pointer string, r *Reporter) {
			visited++
		},
	}, r)

	// Should visit at most maxWalkDepth+1 = 65 schemas (depth 0..64 inclusive).
	if visited > maxWalkDepth+1 {
		t.Errorf("visited = %d, exceeds maxWalkDepth+1 = %d", visited, maxWalkDepth+1)
	}
	if visited == 0 {
		t.Error("visited = 0, expected at least 1 visit")
	}
}

func TestWalk_NilIndex(t *testing.T) {
	// Walk with nil index must not panic.
	r := NewReporter("test-nil", protocol.SeverityWarning)
	Walk(nil, Visitors{
		Document: func(doc *openapi.Document, r *Reporter) {
			t.Error("Document visitor should not be called for nil index")
		},
	}, r)
}

func TestWalk_NilDocument(t *testing.T) {
	// Walk with nil document must not panic.
	idx := &openapi.Index{Document: nil}
	r := NewReporter("test-nil-doc", protocol.SeverityWarning)
	Walk(idx, Visitors{
		Document: func(doc *openapi.Document, r *Reporter) {
			t.Error("Document visitor should not be called for nil document")
		},
	}, r)
}
