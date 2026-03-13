package project

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/sailpoint-oss/telescope/server/openapi"
)

func writeFile(t *testing.T, dir, name, content string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestRebuildIndex_LoadsNewRefs(t *testing.T) {
	dir := t.TempDir()

	rootContent := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: OK
`
	writeFile(t, dir, "api.yaml", rootContent)

	fragmentContent := `type: object
properties:
  id:
    type: string
`
	writeFile(t, dir, "schemas/user.yaml", fragmentContent)

	rootPath := filepath.Join(dir, "api.yaml")
	rootURI := pathToURI(rootPath)

	pctx, err := BuildProjectContext(rootURI, nil, nil)
	if err != nil {
		t.Fatalf("BuildProjectContext: %v", err)
	}

	if len(pctx.Docs) != 1 {
		t.Fatalf("expected 1 doc, got %d", len(pctx.Docs))
	}

	// Simulate adding a $ref to the root document pointing to the fragment.
	updatedContent := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: ./schemas/user.yaml
`
	writeFile(t, dir, "api.yaml", updatedContent)

	// Rebuild the root document index. The new $ref should cause the
	// fragment to be loaded transitively.
	if err := pctx.RebuildIndex(rootURI, nil); err != nil {
		t.Fatalf("RebuildIndex: %v", err)
	}

	fragPath := filepath.Join(dir, "schemas", "user.yaml")
	fragURI := pathToURI(fragPath)

	if !pctx.ContainsFile(fragURI) {
		t.Errorf("expected fragment %s to be loaded after RebuildIndex, docs: %v", fragURI, docsKeys(pctx))
	}
}

func TestProjectContext_ContainsFile(t *testing.T) {
	pctx := &ProjectContext{
		RootURI: "file:///a.yaml",
		Docs: map[string]*openapi.Index{
			"file:///a.yaml": {},
			"file:///b.yaml": {},
		},
		Graph: NewFileGraph(),
	}

	if !pctx.ContainsFile("file:///a.yaml") {
		t.Error("expected a.yaml to be in project")
	}
	if !pctx.ContainsFile("file:///b.yaml") {
		t.Error("expected b.yaml to be in project")
	}
	if pctx.ContainsFile("file:///c.yaml") {
		t.Error("expected c.yaml to NOT be in project")
	}
}

func TestBuildProjectContext_HandlesReferenceCycles(t *testing.T) {
	dir := t.TempDir()

	rootContent := `openapi: "3.1.0"
info:
  title: Cycle Root
  version: "1.0"
paths: {}
components:
  schemas:
    A:
      $ref: ./schemas/a.yaml
`
	aContent := `type: object
properties:
  b:
    $ref: ./b.yaml
`
	bContent := `type: object
properties:
  a:
    $ref: ./a.yaml
`

	rootPath := writeFile(t, dir, "api.yaml", rootContent)
	writeFile(t, dir, "schemas/a.yaml", aContent)
	writeFile(t, dir, "schemas/b.yaml", bContent)

	pctx, err := BuildProjectContext(pathToURI(rootPath), nil, nil)
	if err != nil {
		t.Fatalf("BuildProjectContext: %v", err)
	}

	aURI := pathToURI(filepath.Join(dir, "schemas", "a.yaml"))
	bURI := pathToURI(filepath.Join(dir, "schemas", "b.yaml"))

	if !pctx.ContainsFile(aURI) {
		t.Fatalf("expected cycle member a.yaml to be loaded, docs: %v", docsKeys(pctx))
	}
	if !pctx.ContainsFile(bURI) {
		t.Fatalf("expected cycle member b.yaml to be loaded, docs: %v", docsKeys(pctx))
	}
}

func TestBuildProjectContext_LoadsNestedExternalRefTargets(t *testing.T) {
	dir := t.TempDir()

	rootContent := `openapi: "3.1.0"
info:
  title: Nested Refs
  version: "1.0"
paths:
  /items/{id}:
    $ref: ./paths/items-by-id.yaml
`
	pathFragment := `get:
  operationId: getItem
  summary: Get item
  description: Returns one item
  parameters:
    - $ref: ../parameters/id.yaml
  responses:
    "200":
      description: OK
`
	parameterFragment := `name: id
in: path
required: true
schema:
  type: string
`

	rootPath := writeFile(t, dir, "api.yaml", rootContent)
	writeFile(t, dir, "paths/items-by-id.yaml", pathFragment)
	writeFile(t, dir, "parameters/id.yaml", parameterFragment)

	pctx, err := BuildProjectContext(pathToURI(rootPath), nil, nil)
	if err != nil {
		t.Fatalf("BuildProjectContext: %v", err)
	}

	pathURI := pathToURI(filepath.Join(dir, "paths", "items-by-id.yaml"))
	paramURI := pathToURI(filepath.Join(dir, "parameters", "id.yaml"))

	if !pctx.ContainsFile(pathURI) {
		t.Fatalf("expected path fragment to be loaded, docs: %v", docsKeys(pctx))
	}
	if !pctx.ContainsFile(paramURI) {
		t.Fatalf("expected nested parameter fragment to be loaded, docs: %v", docsKeys(pctx))
	}
}

func TestBuildProjectContext_LoadsCrossVersionExternalRefs(t *testing.T) {
	dir := t.TempDir()

	rootContent := `openapi: "3.2.0"
info:
  title: Version Isolation
  version: "1.0"
paths:
  /example:
    get:
      operationId: getExample
      summary: Get example
      description: Cross-version $ref load
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: ./schemas/legacy.yaml#/components/schemas/Legacy
`
	legacyContent := `openapi: "3.0.0"
info:
  title: Legacy Schema
  version: "1.0"
components:
  schemas:
    Legacy:
      type: object
      properties:
        id:
          type: string
`

	rootPath := writeFile(t, dir, "api.yaml", rootContent)
	writeFile(t, dir, "schemas/legacy.yaml", legacyContent)

	pctx, err := BuildProjectContext(pathToURI(rootPath), nil, nil)
	if err != nil {
		t.Fatalf("BuildProjectContext: %v", err)
	}

	legacyURI := pathToURI(filepath.Join(dir, "schemas", "legacy.yaml"))
	if !pctx.ContainsFile(legacyURI) {
		t.Fatalf("expected cross-version target to be loaded, docs: %v", docsKeys(pctx))
	}

	resolved, err := pctx.Resolver.Resolve(pathToURI(rootPath), "./schemas/legacy.yaml#/components/schemas/Legacy")
	if err != nil {
		t.Fatalf("Resolve cross-version ref: %v", err)
	}
	if resolved.TargetURI != legacyURI {
		t.Fatalf("resolved target URI = %q, want %q", resolved.TargetURI, legacyURI)
	}
}

func docsKeys(pctx *ProjectContext) []string {
	keys := make([]string, 0, len(pctx.Docs))
	for k := range pctx.Docs {
		keys = append(keys, k)
	}
	return keys
}

func TestRebuildIndex_ConcurrentSafe(t *testing.T) {
	dir := t.TempDir()

	rootContent := `openapi: "3.1.0"
info:
  title: Concurrent Test
  version: "1.0"
paths:
  /test:
    get:
      operationId: getTest
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: ./schemas/a.yaml
`
	writeFile(t, dir, "api.yaml", rootContent)
	writeFile(t, dir, "schemas/a.yaml", "type: object\nproperties:\n  id:\n    type: string\n")
	writeFile(t, dir, "schemas/b.yaml", "type: object\nproperties:\n  name:\n    type: string\n")

	rootPath := filepath.Join(dir, "api.yaml")
	rootURI := pathToURI(rootPath)
	fragAURI := pathToURI(filepath.Join(dir, "schemas", "a.yaml"))
	fragBURI := pathToURI(filepath.Join(dir, "schemas", "b.yaml"))

	pctx, err := BuildProjectContext(rootURI, nil, nil)
	if err != nil {
		t.Fatalf("BuildProjectContext: %v", err)
	}

	const goroutines = 10
	var wg sync.WaitGroup

	// Concurrent RebuildIndex calls on different fragments.
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			uri := fragAURI
			if n%2 == 0 {
				uri = fragBURI
			}
			// Rewrite fragment content to simulate file changes.
			fname := "schemas/a.yaml"
			if n%2 == 0 {
				fname = "schemas/b.yaml"
			}
			writeFile(t, dir, fname, "type: object\nproperties:\n  v:\n    type: integer\n")
			_ = pctx.RebuildIndex(uri, nil)
		}(i)
	}

	// Concurrent ContainsFile reads.
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = pctx.ContainsFile(fragAURI)
			_ = pctx.ContainsFile(fragBURI)
		}()
	}

	// Concurrent AllURIs reads.
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = pctx.AllURIs()
		}()
	}

	wg.Wait()

	// If we get here without a race detector complaint or panic, the test passes.
	if !pctx.ContainsFile(rootURI) {
		t.Error("root URI should still be in project after concurrent rebuilds")
	}
}
