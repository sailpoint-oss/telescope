package mock

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const mockSpec = `openapi: 3.1.0
info:
  title: Mock API
  version: 1.0.0
paths:
  /pets/{petId}:
    get:
      operationId: getPet
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
    Pet:
      type: object
      properties:
        id:
          type: string
        type:
          type: string
`

func TestGenerate_WritesSchemaFile(t *testing.T) {
	dir := t.TempDir()
	specPath := filepath.Join(dir, "spec.yaml")
	outputDir := filepath.Join(dir, "mocks")
	if err := os.WriteFile(specPath, []byte(mockSpec), 0o644); err != nil {
		t.Fatalf("WriteFile(spec): %v", err)
	}

	err := Generate(GenerateOptions{
		SpecPath:   specPath,
		OutputDir:  outputDir,
		SchemaName: "User",
		Format:     FormatJSON,
	})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(outputDir, "User.json"))
	if err != nil {
		t.Fatalf("ReadFile(User.json): %v", err)
	}
	var decoded any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("generated JSON should be valid: %v\n%s", err, data)
	}
	if _, err := os.Stat(filepath.Join(outputDir, "Pet.json")); !os.IsNotExist(err) {
		t.Fatalf("expected Pet.json to be absent when filtering by schema, err=%v", err)
	}
}

func TestServe_ReturnsGeneratedOperationResponse(t *testing.T) {
	dir := t.TempDir()
	specPath := filepath.Join(dir, "spec.yaml")
	if err := os.WriteFile(specPath, []byte(mockSpec), 0o644); err != nil {
		t.Fatalf("WriteFile(spec): %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	server, err := Serve(ctx, ServerOptions{
		SpecPath: specPath,
		Port:     0,
	})
	if err != nil {
		t.Fatalf("Serve: %v", err)
	}
	defer func() {
		_ = server.Stop(context.Background())
		_ = server.Wait()
	}()

	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(server.URL() + "/pets/123")
	if err != nil {
		t.Fatalf("GET mock route: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Content-Type"); !strings.Contains(got, "application/json") {
		t.Fatalf("expected JSON content type, got %q", got)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("ReadAll: %v", err)
	}
	var decoded any
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatalf("expected valid JSON body: %v\n%s", err, body)
	}

	miss, err := client.Get(server.URL() + "/does-not-exist")
	if err != nil {
		t.Fatalf("GET missing route: %v", err)
	}
	defer miss.Body.Close()
	if miss.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", miss.StatusCode)
	}
}
