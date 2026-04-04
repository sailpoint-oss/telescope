package classify

import (
	"testing"

	navigator "github.com/sailpoint-oss/navigator"
)

func TestClassify_OpenAPIRoot(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths: {}
`)
	result := c.Classify("file:///api.yaml", content, false)
	if !result.IsOpenAPI {
		t.Error("expected IsOpenAPI=true for OpenAPI root document")
	}
	if result.IsFragment {
		t.Error("expected IsFragment=false for root document")
	}
	if result.DocumentKind != navigator.DocumentKindOpenAPI {
		t.Errorf("expected DocumentKindOpenAPI, got %v", result.DocumentKind)
	}
	if result.OpenAPIVersion != "3.1" {
		t.Errorf("expected OpenAPIVersion=3.1, got %q", result.OpenAPIVersion)
	}
}

func TestClassify_NonOpenAPIYAML(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`name: CI
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
`)
	result := c.Classify("file:///ci.yaml", content, false)
	if result.IsOpenAPI {
		t.Error("expected IsOpenAPI=false for GitHub Actions YAML")
	}
	if result.Confidence >= 0.60 {
		t.Errorf("expected confidence < 0.60 for non-OpenAPI, got %f", result.Confidence)
	}
}

func TestClassify_GraphMember_ForcesFragment(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`type: object
properties:
  name:
    type: string
`)
	result := c.Classify("file:///schemas/user.yaml", content, true)
	if !result.IsOpenAPI {
		t.Error("expected IsOpenAPI=true when isGraphMember=true")
	}
	if !result.IsFragment {
		t.Error("expected IsFragment=true when isGraphMember=true")
	}
	if result.Confidence != 1.0 {
		t.Errorf("expected confidence=1.0 for graph member, got %f", result.Confidence)
	}
}

func TestClassify_GraphMember_NonOpenAPIContent(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`database:
  host: localhost
  port: 5432
`)
	result := c.Classify("file:///config.yaml", content, true)
	if !result.IsOpenAPI {
		t.Error("graph membership should force IsOpenAPI=true even with non-OpenAPI content")
	}
	if !result.IsFragment {
		t.Error("graph membership should set IsFragment=true")
	}
}

func TestClassify_ExcludePattern(t *testing.T) {
	c := NewFileClassifier()
	c.SetIncludeExclude(nil, []string{"*.config.yaml"})
	content := []byte(`openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths: {}
`)
	result := c.Classify("file:///app.config.yaml", content, false)
	if result.IsOpenAPI {
		t.Error("excluded file should never be classified as OpenAPI")
	}
}

func TestClassify_ExcludeOverridesGraphMember(t *testing.T) {
	c := NewFileClassifier()
	c.SetIncludeExclude(nil, []string{"*.config.yaml"})
	content := []byte(`type: object
properties:
  name:
    type: string
`)
	result := c.Classify("file:///app.config.yaml", content, true)
	if result.IsOpenAPI {
		t.Error("exclude pattern should take priority over graph membership")
	}
}

func TestClassify_IncludePattern_BoostsConfidence(t *testing.T) {
	c := NewFileClassifier()
	c.SetIncludeExclude([]string{"*.yaml"}, nil)

	content := []byte(`info:
  title: Test
tags:
  - name: pets
`)
	withInclude := c.Classify("file:///api.yaml", content, false)

	c2 := NewFileClassifier()
	withoutInclude := c2.Classify("file:///api.yaml", content, false)

	if withInclude.Confidence <= withoutInclude.Confidence {
		t.Errorf("include pattern should boost confidence: with=%f, without=%f",
			withInclude.Confidence, withoutInclude.Confidence)
	}
}

func TestClassify_ConfigOverride_ForceOpenAPI(t *testing.T) {
	c := NewFileClassifier()
	c.AddOverride("custom-spec.yaml", true)
	content := []byte(`database:
  host: localhost
`)
	result := c.Classify("file:///custom-spec.yaml", content, false)
	if !result.IsOpenAPI {
		t.Error("config override should force IsOpenAPI=true")
	}
}

func TestClassify_ConfigOverride_ForceNotOpenAPI(t *testing.T) {
	c := NewFileClassifier()
	c.AddOverride("not-openapi.yaml", false)
	content := []byte(`openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths: {}
`)
	result := c.Classify("file:///not-openapi.yaml", content, false)
	if result.IsOpenAPI {
		t.Error("config override should force IsOpenAPI=false")
	}
}

func TestClassify_OASExtension(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`info:
  title: Test
paths: {}
`)
	result := c.Classify("file:///api.openapi.yaml", content, false)
	hasOASSignal := false
	for _, s := range result.Signals {
		if s.Name == "oas-extension" {
			hasOASSignal = true
			break
		}
	}
	if !hasOASSignal {
		t.Error("expected oas-extension signal for .openapi.yaml file")
	}
}

func TestClassify_WorkspaceProximity(t *testing.T) {
	c := NewFileClassifier()
	c.RegisterRootDir("/workspace/api")
	content := []byte(`type: object
properties:
  id:
    type: integer
`)
	result := c.Classify("file:///workspace/api/schema.yaml", content, false)
	hasProximity := false
	for _, s := range result.Signals {
		if s.Name == "workspace-proximity" {
			hasProximity = true
			break
		}
	}
	if !hasProximity {
		t.Error("expected workspace-proximity signal for file near known root")
	}
}

func TestClassify_ArazzoDocument(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`arazzo: "1.0.0"
info:
  title: Test Workflow
workflows: []
`)
	result := c.Classify("file:///workflow.arazzo.yaml", content, false)
	if result.DocumentKind != navigator.DocumentKindArazzo {
		t.Errorf("expected DocumentKindArazzo, got %v", result.DocumentKind)
	}
}

func TestClassify_SwaggerDocument(t *testing.T) {
	c := NewFileClassifier()
	content := []byte(`swagger: "2.0"
info:
  title: Test
  version: "1.0"
paths: {}
`)
	result := c.Classify("file:///api.yaml", content, false)
	if !result.IsOpenAPI {
		t.Error("expected IsOpenAPI=true for Swagger 2.0 document")
	}
	if result.OpenAPIVersion != "2.0" {
		t.Errorf("expected OpenAPIVersion=2.0, got %q", result.OpenAPIVersion)
	}
}

func TestClassify_EmptyFile(t *testing.T) {
	c := NewFileClassifier()
	result := c.Classify("file:///empty.yaml", nil, false)
	if result.IsOpenAPI {
		t.Error("empty file should not be classified as OpenAPI")
	}
}
