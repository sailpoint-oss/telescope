package spectral

import (
	"testing"

	"gopkg.in/yaml.v3"
)

func yamlDoc(t *testing.T, input string) *yaml.Node {
	t.Helper()
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(input), &doc); err != nil {
		t.Fatalf("failed to parse YAML: %v", err)
	}
	return &doc
}

func yamlNode(t *testing.T, input string) *yaml.Node {
	t.Helper()
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(input), &doc); err != nil {
		t.Fatalf("failed to parse YAML: %v", err)
	}
	if doc.Kind == yaml.DocumentNode && len(doc.Content) > 0 {
		return doc.Content[0]
	}
	return &doc
}

func TestFuncTruthy(t *testing.T) {
	t.Run("truthy string passes", func(t *testing.T) {
		node := yamlNode(t, `hello`)
		issues := funcTruthy(node, "", nil)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("empty string fails", func(t *testing.T) {
		node := yamlNode(t, `""`)
		issues := funcTruthy(node, "", nil)
		if len(issues) == 0 {
			t.Error("expected issue for empty string")
		}
	})

	t.Run("false fails", func(t *testing.T) {
		node := yamlNode(t, `false`)
		issues := funcTruthy(node, "", nil)
		if len(issues) == 0 {
			t.Error("expected issue for false")
		}
	})

	t.Run("null fails", func(t *testing.T) {
		node := yamlNode(t, `null`)
		issues := funcTruthy(node, "", nil)
		if len(issues) == 0 {
			t.Error("expected issue for null")
		}
	})

	t.Run("truthy with field", func(t *testing.T) {
		node := yamlNode(t, "name: hello\n")
		issues := funcTruthy(node, "name", nil)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("truthy with missing field", func(t *testing.T) {
		node := yamlNode(t, "name: hello\n")
		issues := funcTruthy(node, "description", nil)
		if len(issues) == 0 {
			t.Error("expected issue for missing field")
		}
	})
}

func TestFuncFalsy(t *testing.T) {
	t.Run("empty string passes", func(t *testing.T) {
		node := yamlNode(t, `""`)
		issues := funcFalsy(node, "", nil)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("non-empty string fails", func(t *testing.T) {
		node := yamlNode(t, `hello`)
		issues := funcFalsy(node, "", nil)
		if len(issues) == 0 {
			t.Error("expected issue for truthy value")
		}
	})
}

func TestFuncPattern(t *testing.T) {
	t.Run("match succeeds", func(t *testing.T) {
		node := yamlNode(t, `"1.2.3"`)
		opts := map[string]interface{}{"match": `^\d+\.\d+\.\d+$`}
		issues := funcPattern(node, "", opts)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("match fails", func(t *testing.T) {
		node := yamlNode(t, `latest`)
		opts := map[string]interface{}{"match": `^\d+\.\d+\.\d+$`}
		issues := funcPattern(node, "", opts)
		if len(issues) == 0 {
			t.Error("expected issue for non-matching pattern")
		}
	})

	t.Run("notMatch succeeds", func(t *testing.T) {
		node := yamlNode(t, `hello world`)
		opts := map[string]interface{}{"notMatch": `<script`}
		issues := funcPattern(node, "", opts)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("notMatch fails", func(t *testing.T) {
		node := yamlNode(t, `has <script> tag`)
		opts := map[string]interface{}{"notMatch": `<script`}
		issues := funcPattern(node, "", opts)
		if len(issues) == 0 {
			t.Error("expected issue for matching notMatch pattern")
		}
	})
}

func TestFuncCasing(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		casing  string
		wantErr bool
	}{
		{"kebab valid", "my-api-name", "kebab", false},
		{"kebab invalid", "myApiName", "kebab", true},
		{"camel valid", "myApiName", "camel", false},
		{"camel invalid", "MyApiName", "camel", true},
		{"pascal valid", "MyApiName", "pascal", false},
		{"pascal invalid", "myApiName", "pascal", true},
		{"snake valid", "my_api_name", "snake", false},
		{"snake invalid", "My_Api_Name", "snake", true},
		{"flat valid", "myapiname", "flat", false},
		{"flat invalid", "MyApiName", "flat", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			node := yamlNode(t, tt.value)
			opts := map[string]interface{}{"type": tt.casing}
			issues := funcCasing(node, "", opts)
			if tt.wantErr && len(issues) == 0 {
				t.Error("expected issue")
			}
			if !tt.wantErr && len(issues) > 0 {
				t.Errorf("expected no issues, got %d: %s", len(issues), issues[0].Message)
			}
		})
	}
}

func TestFuncLength(t *testing.T) {
	t.Run("array min passes", func(t *testing.T) {
		node := yamlNode(t, "- a\n- b\n")
		opts := map[string]interface{}{"min": 1}
		issues := funcLength(node, "", opts)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("array min fails", func(t *testing.T) {
		node := yamlNode(t, "[]")
		opts := map[string]interface{}{"min": 1}
		issues := funcLength(node, "", opts)
		if len(issues) == 0 {
			t.Error("expected issue for empty array")
		}
	})

	t.Run("string max passes", func(t *testing.T) {
		node := yamlNode(t, `hi`)
		opts := map[string]interface{}{"max": 10}
		issues := funcLength(node, "", opts)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("string max fails", func(t *testing.T) {
		node := yamlNode(t, `"this is a very long string that exceeds the maximum"`)
		opts := map[string]interface{}{"max": 5}
		issues := funcLength(node, "", opts)
		if len(issues) == 0 {
			t.Error("expected issue for string exceeding max length")
		}
	})
}

func TestFuncDefined(t *testing.T) {
	t.Run("field exists", func(t *testing.T) {
		node := yamlNode(t, "name: hello\n")
		issues := funcDefined(node, "name", nil)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("field missing", func(t *testing.T) {
		node := yamlNode(t, "name: hello\n")
		issues := funcDefined(node, "description", nil)
		if len(issues) == 0 {
			t.Error("expected issue for missing field")
		}
	})
}

func TestFuncUndefined(t *testing.T) {
	t.Run("field exists", func(t *testing.T) {
		node := yamlNode(t, "name: hello\n")
		issues := funcUndefined(node, "name", nil)
		if len(issues) == 0 {
			t.Error("expected issue for existing field")
		}
	})

	t.Run("field missing", func(t *testing.T) {
		node := yamlNode(t, "name: hello\n")
		issues := funcUndefined(node, "description", nil)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})
}

func TestFuncOr(t *testing.T) {
	t.Run("one property exists", func(t *testing.T) {
		node := yamlNode(t, "name: hello\n")
		opts := map[string]interface{}{
			"properties": []interface{}{"name", "title"},
		}
		issues := funcOr(node, "", opts)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("no properties exist", func(t *testing.T) {
		node := yamlNode(t, "other: value\n")
		opts := map[string]interface{}{
			"properties": []interface{}{"name", "title"},
		}
		issues := funcOr(node, "", opts)
		if len(issues) == 0 {
			t.Error("expected issue when no properties exist")
		}
	})
}

func TestFuncXor(t *testing.T) {
	t.Run("exactly one property exists", func(t *testing.T) {
		node := yamlNode(t, "name: hello\n")
		opts := map[string]interface{}{
			"properties": []interface{}{"name", "title"},
		}
		issues := funcXor(node, "", opts)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("both properties exist", func(t *testing.T) {
		node := yamlNode(t, "name: hello\ntitle: world\n")
		opts := map[string]interface{}{
			"properties": []interface{}{"name", "title"},
		}
		issues := funcXor(node, "", opts)
		if len(issues) == 0 {
			t.Error("expected issue when both properties exist")
		}
	})

	t.Run("no properties exist", func(t *testing.T) {
		node := yamlNode(t, "other: value\n")
		opts := map[string]interface{}{
			"properties": []interface{}{"name", "title"},
		}
		issues := funcXor(node, "", opts)
		if len(issues) == 0 {
			t.Error("expected issue when no properties exist")
		}
	})
}

func TestFuncAlphabetical(t *testing.T) {
	t.Run("sorted array passes", func(t *testing.T) {
		node := yamlNode(t, "- alpha\n- beta\n- gamma\n")
		issues := funcAlphabetical(node, "", nil)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("unsorted array fails", func(t *testing.T) {
		node := yamlNode(t, "- gamma\n- alpha\n- beta\n")
		issues := funcAlphabetical(node, "", nil)
		if len(issues) == 0 {
			t.Error("expected issue for unsorted array")
		}
	})
}

func TestFuncEnumeration(t *testing.T) {
	t.Run("valid value passes", func(t *testing.T) {
		node := yamlNode(t, `https`)
		opts := map[string]interface{}{
			"values": []interface{}{"http", "https"},
		}
		issues := funcEnumeration(node, "", opts)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("invalid value fails", func(t *testing.T) {
		node := yamlNode(t, `ftp`)
		opts := map[string]interface{}{
			"values": []interface{}{"http", "https"},
		}
		issues := funcEnumeration(node, "", opts)
		if len(issues) == 0 {
			t.Error("expected issue for invalid enum value")
		}
	})
}

func TestFuncUnreferencedReusableObject(t *testing.T) {
	t.Run("reports unreferenced schema", func(t *testing.T) {
		root := yamlDoc(t, `
openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /pets:
    get:
      responses:
        "200":
          description: OK
components:
  schemas:
    Pet:
      type: object
    Unused:
      type: string
`)
		// Navigate to components.schemas mapping node
		schemasNode := findPath(root, "components", "schemas")
		if schemasNode == nil {
			t.Fatal("could not find components.schemas node")
		}

		opts := map[string]interface{}{
			"reusableObjectsLocation": "#/components/schemas",
			"__root__":                root,
		}
		issues := funcUnreferencedReusableObject(schemasNode, "", opts)

		// Both Pet and Unused should be reported since neither is $ref'd.
		if len(issues) != 2 {
			t.Fatalf("expected 2 issues, got %d", len(issues))
		}
	})

	t.Run("referenced schema is not reported", func(t *testing.T) {
		root := yamlDoc(t, `
openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /pets:
    get:
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
components:
  schemas:
    Pet:
      type: object
    Unused:
      type: string
`)
		schemasNode := findPath(root, "components", "schemas")
		if schemasNode == nil {
			t.Fatal("could not find components.schemas node")
		}

		opts := map[string]interface{}{
			"reusableObjectsLocation": "#/components/schemas",
			"__root__":                root,
		}
		issues := funcUnreferencedReusableObject(schemasNode, "", opts)

		// Only Unused should be reported.
		if len(issues) != 1 {
			t.Fatalf("expected 1 issue, got %d", len(issues))
		}
		if issues[0].Message != `component "Unused" is not referenced` {
			t.Errorf("unexpected message: %s", issues[0].Message)
		}
	})

	t.Run("all referenced returns no issues", func(t *testing.T) {
		root := yamlDoc(t, `
openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /pets:
    get:
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
  /errors:
    get:
      responses:
        "500":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Error"
components:
  schemas:
    Pet:
      type: object
    Error:
      type: object
`)
		schemasNode := findPath(root, "components", "schemas")
		if schemasNode == nil {
			t.Fatal("could not find components.schemas node")
		}

		opts := map[string]interface{}{
			"reusableObjectsLocation": "#/components/schemas",
			"__root__":                root,
		}
		issues := funcUnreferencedReusableObject(schemasNode, "", opts)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("no root returns no issues", func(t *testing.T) {
		node := yamlNode(t, "Pet:\n  type: object\n")
		opts := map[string]interface{}{
			"reusableObjectsLocation": "#/components/schemas",
		}
		issues := funcUnreferencedReusableObject(node, "", opts)
		if len(issues) != 0 {
			t.Errorf("expected no issues without root, got %d", len(issues))
		}
	})
}

func TestFuncSchemaEnum(t *testing.T) {
	t.Run("valid enum value passes", func(t *testing.T) {
		node := yamlNode(t, `https`)
		opts := map[string]interface{}{
			"schema": map[string]interface{}{
				"type": "string",
				"enum": []interface{}{"http", "https"},
			},
		}
		issues := funcSchema(node, "", opts)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d: %s", len(issues), issues[0].Message)
		}
	})

	t.Run("invalid enum value fails", func(t *testing.T) {
		node := yamlNode(t, `ftp`)
		opts := map[string]interface{}{
			"schema": map[string]interface{}{
				"type": "string",
				"enum": []interface{}{"http", "https"},
			},
		}
		issues := funcSchema(node, "", opts)
		if len(issues) == 0 {
			t.Error("expected issue for invalid enum value")
		}
	})
}

func TestFuncSchemaRequired(t *testing.T) {
	t.Run("required fields present", func(t *testing.T) {
		node := yamlNode(t, "name: hello\nversion: 1\n")
		opts := map[string]interface{}{
			"schema": map[string]interface{}{
				"type":     "object",
				"required": []interface{}{"name", "version"},
			},
		}
		issues := funcSchema(node, "", opts)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d: %s", len(issues), issues[0].Message)
		}
	})

	t.Run("required field missing", func(t *testing.T) {
		node := yamlNode(t, "name: hello\n")
		opts := map[string]interface{}{
			"schema": map[string]interface{}{
				"type":     "object",
				"required": []interface{}{"name", "version"},
			},
		}
		issues := funcSchema(node, "", opts)
		if len(issues) == 0 {
			t.Error("expected issue for missing required field")
		}
	})
}

func TestFuncSchemaProperties(t *testing.T) {
	t.Run("valid property type", func(t *testing.T) {
		node := yamlNode(t, "name: hello\ncount: 42\n")
		opts := map[string]interface{}{
			"schema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"name":  map[string]interface{}{"type": "string"},
					"count": map[string]interface{}{"type": "integer"},
				},
			},
		}
		issues := funcSchema(node, "", opts)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d: %s", len(issues), issues[0].Message)
		}
	})

	t.Run("invalid property type", func(t *testing.T) {
		node := yamlNode(t, "name: hello\ncount: not-a-number\n")
		opts := map[string]interface{}{
			"schema": map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"count": map[string]interface{}{"type": "integer"},
				},
			},
		}
		issues := funcSchema(node, "", opts)
		if len(issues) == 0 {
			t.Error("expected issue for invalid property type")
		}
	})
}

// findPath navigates a YAML document node to a nested mapping value.
func findPath(root *yaml.Node, keys ...string) *yaml.Node {
	node := root
	if node.Kind == yaml.DocumentNode && len(node.Content) > 0 {
		node = node.Content[0]
	}
	for _, key := range keys {
		if node.Kind != yaml.MappingNode {
			return nil
		}
		found := false
		for i := 0; i < len(node.Content)-1; i += 2 {
			if node.Content[i].Value == key {
				node = node.Content[i+1]
				found = true
				break
			}
		}
		if !found {
			return nil
		}
	}
	return node
}
