package bundle

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBundle_ComposedUsesProvidedDependencyBytes(t *testing.T) {
	dir := t.TempDir()
	rootPath := filepath.Join(dir, "root.yaml")
	compPath := filepath.Join(dir, "components.yaml")

	root := `openapi: "3.1.0"
info:
  title: Bundle API
  version: "1.0.0"
paths:
  /pets:
    get:
      operationId: listPets
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "./components.yaml#/components/schemas/Pet"
`
	onDiskComponents := `components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
`
	overriddenComponents := `components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
        nickname:
          type: string
`

	if err := os.WriteFile(rootPath, []byte(root), 0o644); err != nil {
		t.Fatalf("write root: %v", err)
	}
	if err := os.WriteFile(compPath, []byte(onDiskComponents), 0o644); err != nil {
		t.Fatalf("write components: %v", err)
	}

	result, err := Bundle(Options{
		RootPath:  rootPath,
		RootBytes: []byte(root),
		Files: map[string][]byte{
			compPath: []byte(overriddenComponents),
		},
		Mode: ModeComposed,
	})
	if err != nil {
		t.Fatalf("Bundle: %v", err)
	}
	text := string(result.Content)
	if !strings.Contains(text, "nickname:") {
		t.Fatalf("expected bundled output to include override content, got:\n%s", text)
	}
	if !strings.Contains(text, "components:") {
		t.Fatalf("expected composed bundle output to contain components, got:\n%s", text)
	}
}

func TestBundle_JSONOutput(t *testing.T) {
	dir := t.TempDir()
	rootPath := filepath.Join(dir, "root.yaml")
	root := `openapi: "3.1.0"
info:
  title: Bundle API
  version: "1.0.0"
paths: {}
`
	if err := os.WriteFile(rootPath, []byte(root), 0o644); err != nil {
		t.Fatalf("write root: %v", err)
	}

	result, err := Bundle(Options{
		RootPath:  rootPath,
		RootBytes: []byte(root),
		Mode:      ModeComposed,
		JSON:      true,
	})
	if err != nil {
		t.Fatalf("Bundle: %v", err)
	}

	var parsed map[string]any
	if err := json.Unmarshal(result.Content, &parsed); err != nil {
		t.Fatalf("json.Unmarshal: %v\n%s", err, result.Content)
	}
	if parsed["openapi"] != "3.1.0" {
		t.Fatalf("expected openapi version in json output, got %#v", parsed["openapi"])
	}
}
