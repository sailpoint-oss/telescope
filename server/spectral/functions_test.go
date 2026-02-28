package spectral

import (
	"testing"

	"gopkg.in/yaml.v3"
)

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
