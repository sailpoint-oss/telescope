package bun

import "testing"

func TestPointersFromContent_IncludesOperationAndPathPointers(t *testing.T) {
	const uri = "file:///test-missing-summary.yaml"
	const content = `openapi: "3.0.0"
info:
  title: Missing Summary Test
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: Success
`

	pointers := PointersFromContent(content, uri)
	if len(pointers) == 0 {
		t.Fatal("expected pointer extraction from content")
	}
	if _, ok := pointers["/paths/~1users/get"]; !ok {
		t.Fatalf("expected operation pointer, got %v", pointers)
	}
	if _, ok := pointers["/paths/~1users"]; !ok {
		t.Fatalf("expected path item pointer, got %v", pointers)
	}
}
