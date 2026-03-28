package classify

import (
	"testing"

	navigator "github.com/sailpoint-oss/navigator"
)

func TestClassify_OpenAPI31YAML(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`openapi: 3.1.0
info:
  title: Test API
  version: "1.0"
paths:
  /users:
    get:
      summary: List users
`)
	uri := "file:///project/openapi.yaml"

	got := c.Classify(uri, content, false)

	if !got.IsOpenAPI {
		t.Error("expected IsOpenAPI=true for clear OpenAPI 3.1 YAML")
	}
	if got.DocumentKind != navigator.DocumentKindOpenAPI {
		t.Errorf("DocumentKind = %q, want %q", got.DocumentKind, navigator.DocumentKindOpenAPI)
	}
	if got.Confidence <= 0.9 {
		t.Errorf("expected Confidence > 0.9, got %f", got.Confidence)
	}
	if got.OpenAPIVersion != "3.1" {
		t.Errorf("expected OpenAPIVersion=3.1, got %q", got.OpenAPIVersion)
	}
	if got.IsFragment {
		t.Error("expected IsFragment=false for root document")
	}
}

func TestClassify_NonOpenAPIYAML(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`# Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
`)
	uri := "file:///project/deployment.yaml"

	got := c.Classify(uri, content, false)

	if got.IsOpenAPI {
		t.Error("expected IsOpenAPI=false for non-OpenAPI YAML")
	}
	if got.DocumentKind != navigator.DocumentKindUnknown {
		t.Errorf("DocumentKind = %q, want unknown", got.DocumentKind)
	}
	if got.Confidence >= 0.3 {
		t.Errorf("expected Confidence < 0.3, got %f", got.Confidence)
	}
}

func TestClassify_Fragment_GraphMember(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`# Fragment - no openapi/swagger key
type: object
properties:
  id:
    type: string
  name:
    type: string
`)
	uri := "file:///project/schemas/user.yaml"

	got := c.Classify(uri, content, true)

	if !got.IsOpenAPI {
		t.Error("expected IsOpenAPI=true when isGraphMember=true")
	}
	if got.DocumentKind != navigator.DocumentKindOpenAPI {
		t.Errorf("DocumentKind = %q, want openapi", got.DocumentKind)
	}
	if !got.IsFragment {
		t.Error("expected IsFragment=true when isGraphMember=true")
	}
	if got.Confidence != 1.0 {
		t.Errorf("expected Confidence=1.0 for graph member, got %f", got.Confidence)
	}
}

func TestClassify_ConfigOverride_ForceOpenAPI(t *testing.T) {
	c := NewFileClassifier()
	c.AddOverride("**/custom-spec.yaml", true)
	content := []byte(`# Not a real OpenAPI doc
foo: bar
baz: qux
`)
	uri := "file:///project/custom-spec.yaml"

	got := c.Classify(uri, content, false)

	if !got.IsOpenAPI {
		t.Error("expected IsOpenAPI=true from config override")
	}
	if got.DocumentKind != navigator.DocumentKindOpenAPI {
		t.Errorf("DocumentKind = %q, want openapi", got.DocumentKind)
	}
	if got.Confidence != 1.0 {
		t.Errorf("expected Confidence=1.0 from override, got %f", got.Confidence)
	}
	// Should have config-override signal
	var found bool
	for _, s := range got.Signals {
		if s.Name == "config-override" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected config-override signal")
	}
}

func TestClassify_ConfigOverride_ForceNotOpenAPI(t *testing.T) {
	c := NewFileClassifier()
	c.AddOverride("**/ignore.yaml", false)
	content := []byte(`openapi: 3.1.0
info:
  title: Real API
paths: {}
`)
	uri := "file:///project/ignore.yaml"

	got := c.Classify(uri, content, false)

	if got.IsOpenAPI {
		t.Error("expected IsOpenAPI=false from config override (exclude)")
	}
	if got.DocumentKind != navigator.DocumentKindUnknown {
		t.Errorf("DocumentKind = %q, want unknown", got.DocumentKind)
	}
}

func TestClassify_JSON(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`{
  "openapi": "3.2.0",
  "info": {
    "title": "JSON API",
    "version": "1.0"
  },
  "paths": {}
}`)
	uri := "file:///project/spec.json"

	got := c.Classify(uri, content, false)

	if !got.IsOpenAPI {
		t.Error("expected IsOpenAPI=true for OpenAPI JSON")
	}
	if got.DocumentKind != navigator.DocumentKindOpenAPI {
		t.Errorf("DocumentKind = %q, want openapi", got.DocumentKind)
	}
	if got.OpenAPIVersion != "3.2" {
		t.Errorf("expected OpenAPIVersion=3.2, got %q", got.OpenAPIVersion)
	}
	if got.Confidence <= 0.9 {
		t.Errorf("expected Confidence > 0.9, got %f", got.Confidence)
	}
}

func TestClassify_Swagger20(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`swagger: "2.0"
info:
  title: Swagger API
  version: "1.0"
paths:
  /users:
    get:
      summary: List users
`)
	uri := "file:///project/swagger.yaml"

	got := c.Classify(uri, content, false)

	if !got.IsOpenAPI {
		t.Error("expected IsOpenAPI=true for Swagger 2.0")
	}
	if got.DocumentKind != navigator.DocumentKindOpenAPI {
		t.Errorf("DocumentKind = %q, want openapi", got.DocumentKind)
	}
	if got.OpenAPIVersion != "2.0" {
		t.Errorf("expected OpenAPIVersion=2.0, got %q", got.OpenAPIVersion)
	}
	if got.Confidence <= 0.9 {
		t.Errorf("expected Confidence > 0.9, got %f", got.Confidence)
	}
}

func TestClassify_ArazzoYAML(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`arazzo: 1.0.1
info:
  title: Workflow
  version: "1.0.0"
sourceDescriptions:
  - name: api
    url: ./openapi.yaml
    type: openapi
workflows:
  - workflowId: getPets
    steps: []
`)
	uri := "file:///project/workflow.arazzo.yaml"

	got := c.Classify(uri, content, false)

	if got.IsOpenAPI {
		t.Error("expected IsOpenAPI=false for Arazzo document")
	}
	if got.DocumentKind != navigator.DocumentKindArazzo {
		t.Errorf("DocumentKind = %q, want arazzo", got.DocumentKind)
	}
	if got.Version != "1.0.1" {
		t.Errorf("Version = %q, want 1.0.1", got.Version)
	}
	if got.OpenAPIVersion != "" {
		t.Errorf("OpenAPIVersion = %q, want empty for Arazzo", got.OpenAPIVersion)
	}
	if got.Confidence != 1.0 {
		t.Errorf("Confidence = %f, want 1.0", got.Confidence)
	}
}
