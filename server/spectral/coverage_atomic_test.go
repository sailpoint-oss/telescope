package spectral

import (
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/rulesets"
	"gopkg.in/yaml.v3"
)

func TestParseRules(t *testing.T) {
	boolTrue := true
	boolFalse := false

	tests := []struct {
		name      string
		rs        *rulesets.RuleSet
		wantCount int
	}{
		{
			name:      "nil ruleset",
			rs:        nil,
			wantCount: 0,
		},
		{
			name:      "empty rules map",
			rs:        &rulesets.RuleSet{Rules: map[string]rulesets.RuleDefinition{}},
			wantCount: 0,
		},
		{
			name: "valid rule with given and then",
			rs: &rulesets.RuleSet{
				Rules: map[string]rulesets.RuleDefinition{
					"my-rule": {
						Description: "test rule",
						Message:     "something is wrong",
						Severity:    "error",
						Given:       "$.info",
						Then: map[string]interface{}{
							"function": "truthy",
						},
						Recommended: &boolTrue,
					},
				},
			},
			wantCount: 1,
		},
		{
			name: "rule with no given is skipped",
			rs: &rulesets.RuleSet{
				Rules: map[string]rulesets.RuleDefinition{
					"no-given": {
						Severity: "warn",
						Then:     map[string]interface{}{"function": "truthy"},
					},
				},
			},
			wantCount: 0,
		},
		{
			name: "rule with no then is skipped",
			rs: &rulesets.RuleSet{
				Rules: map[string]rulesets.RuleDefinition{
					"no-then": {
						Given: "$.info",
					},
				},
			},
			wantCount: 0,
		},
		{
			name: "recommended false is preserved",
			rs: &rulesets.RuleSet{
				Rules: map[string]rulesets.RuleDefinition{
					"not-recommended": {
						Given:       "$.info",
						Then:        map[string]interface{}{"function": "truthy"},
						Recommended: &boolFalse,
					},
				},
			},
			wantCount: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ParseRules(tt.rs)
			if len(got) != tt.wantCount {
				t.Errorf("ParseRules() returned %d rules, want %d", len(got), tt.wantCount)
			}
		})
	}

	t.Run("parsed rule has correct fields", func(t *testing.T) {
		rs := &rulesets.RuleSet{
			Rules: map[string]rulesets.RuleDefinition{
				"check-info": {
					Description: "Info must exist",
					Message:     "missing info",
					Severity:    "error",
					Given:       "$.info",
					Then: map[string]interface{}{
						"field":    "title",
						"function": "truthy",
					},
					Formats:     []string{"oas3"},
					Recommended: &boolTrue,
				},
			},
		}
		rules := ParseRules(rs)
		if len(rules) != 1 {
			t.Fatalf("expected 1 rule, got %d", len(rules))
		}
		r := rules[0]
		if r.ID != "check-info" {
			t.Errorf("ID = %q, want %q", r.ID, "check-info")
		}
		if r.Severity != ctypes.SeverityError {
			t.Errorf("Severity = %d, want %d", r.Severity, ctypes.SeverityError)
		}
		if len(r.Given) != 1 || r.Given[0] != "$.info" {
			t.Errorf("Given = %v, want [$.info]", r.Given)
		}
		if len(r.Then) != 1 || r.Then[0].Function != "truthy" || r.Then[0].Field != "title" {
			t.Errorf("Then = %v, want [{Field:title Function:truthy}]", r.Then)
		}
		if !r.Recommended {
			t.Error("expected Recommended=true")
		}
		if len(r.Formats) != 1 || r.Formats[0] != "oas3" {
			t.Errorf("Formats = %v, want [oas3]", r.Formats)
		}
	})
}

func TestExpandMessage(t *testing.T) {
	tests := []struct {
		name     string
		template string
		values   map[string]string
		want     string
	}{
		{
			name:     "empty template",
			template: "",
			values:   map[string]string{"x": "y"},
			want:     "",
		},
		{
			name:     "no placeholders",
			template: "plain message",
			values:   map[string]string{"key": "val"},
			want:     "plain message",
		},
		{
			name:     "single placeholder",
			template: "field {{property}} is invalid",
			values:   map[string]string{"property": "name"},
			want:     "field name is invalid",
		},
		{
			name:     "multiple placeholders",
			template: "{{property}} at {{path}}: {{error}}",
			values: map[string]string{
				"property": "title",
				"path":     "$.info",
				"error":    "must be truthy",
			},
			want: "title at $.info: must be truthy",
		},
		{
			name:     "missing value leaves placeholder",
			template: "field {{unknown}} problem",
			values:   map[string]string{},
			want:     "field {{unknown}} problem",
		},
		{
			name:     "nil values map",
			template: "hello {{world}}",
			values:   nil,
			want:     "hello {{world}}",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ExpandMessage(tt.template, tt.values)
			if got != tt.want {
				t.Errorf("ExpandMessage(%q, %v) = %q, want %q", tt.template, tt.values, got, tt.want)
			}
		})
	}
}

func TestParseGiven(t *testing.T) {
	tests := []struct {
		name  string
		input interface{}
		want  int
	}{
		{"string input", "$.paths", 1},
		{"empty string", "", 0},
		{"string slice", []string{"$.info", "$.paths"}, 2},
		{"interface slice", []interface{}{"$.info", "$.paths"}, 2},
		{"interface slice with empty", []interface{}{"$.info", ""}, 1},
		{"nil", nil, 0},
		{"int", 42, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseGiven(tt.input)
			if len(got) != tt.want {
				t.Errorf("parseGiven(%v) returned %d items, want %d", tt.input, len(got), tt.want)
			}
		})
	}
}

func TestParseThen(t *testing.T) {
	tests := []struct {
		name  string
		input interface{}
		want  int
	}{
		{
			name:  "single map",
			input: map[string]interface{}{"function": "truthy"},
			want:  1,
		},
		{
			name: "array of maps",
			input: []interface{}{
				map[string]interface{}{"function": "truthy"},
				map[string]interface{}{"function": "pattern", "field": "name"},
			},
			want: 2,
		},
		{
			name:  "empty function is skipped",
			input: map[string]interface{}{"field": "x"},
			want:  0,
		},
		{
			name:  "nil",
			input: nil,
			want:  0,
		},
		{
			name:  "string not supported",
			input: "truthy",
			want:  0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseThen(tt.input)
			if len(got) != tt.want {
				t.Errorf("parseThen(%v) returned %d items, want %d", tt.input, len(got), tt.want)
			}
		})
	}

	t.Run("preserves function options", func(t *testing.T) {
		input := map[string]interface{}{
			"function":        "pattern",
			"field":           "description",
			"functionOptions": map[string]interface{}{"match": "^[A-Z]"},
		}
		got := parseThen(input)
		if len(got) != 1 {
			t.Fatalf("expected 1, got %d", len(got))
		}
		if got[0].Field != "description" {
			t.Errorf("Field = %q, want %q", got[0].Field, "description")
		}
		if got[0].FunctionOptions["match"] != "^[A-Z]" {
			t.Errorf("FunctionOptions[match] = %v, want %q", got[0].FunctionOptions["match"], "^[A-Z]")
		}
	})
}

func TestScalarValueString(t *testing.T) {
	tests := []struct {
		name string
		node *yaml.Node
		want string
	}{
		{
			name: "scalar node",
			node: &yaml.Node{Kind: yaml.ScalarNode, Value: "hello"},
			want: "hello",
		},
		{
			name: "mapping node returns empty",
			node: &yaml.Node{Kind: yaml.MappingNode},
			want: "",
		},
		{
			name: "nil node returns empty",
			node: nil,
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := scalarValueString(tt.node)
			if got != tt.want {
				t.Errorf("scalarValueString() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestDecodeScalar(t *testing.T) {
	tests := []struct {
		name string
		node *yaml.Node
	}{
		{
			name: "boolean true",
			node: &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: "true"},
		},
		{
			name: "null",
			node: &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!null", Value: "null"},
		},
		{
			name: "string",
			node: &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "hello"},
		},
		{
			name: "integer",
			node: &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!int", Value: "42"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := decodeScalar(tt.node)
			if tt.node.Tag == "!!null" {
				if got != nil {
					t.Errorf("decodeScalar(null) = %v, want nil", got)
				}
				return
			}
			if got == nil {
				t.Error("decodeScalar returned nil")
			}
		})
	}
}

func TestNodeHasField(t *testing.T) {
	mapping := &yaml.Node{
		Kind: yaml.MappingNode,
		Content: []*yaml.Node{
			{Kind: yaml.ScalarNode, Value: "name"},
			{Kind: yaml.ScalarNode, Value: "test"},
			{Kind: yaml.ScalarNode, Value: "version"},
			{Kind: yaml.ScalarNode, Value: "1.0"},
		},
	}

	tests := []struct {
		name  string
		node  *yaml.Node
		field string
		want  bool
	}{
		{"existing field", mapping, "name", true},
		{"another existing field", mapping, "version", true},
		{"missing field", mapping, "description", false},
		{"nil node", nil, "name", false},
		{"scalar node", &yaml.Node{Kind: yaml.ScalarNode, Value: "x"}, "x", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := nodeHasField(tt.node, tt.field)
			if got != tt.want {
				t.Errorf("nodeHasField(%q) = %v, want %v", tt.field, got, tt.want)
			}
		})
	}
}

func TestFuncSchema(t *testing.T) {
	t.Run("nil node returns nil", func(t *testing.T) {
		issues := funcSchema(nil, "", map[string]interface{}{
			"schema": map[string]interface{}{"type": "string"},
		})
		if len(issues) != 0 {
			t.Errorf("expected no issues for nil node, got %d", len(issues))
		}
	})

	t.Run("no schema option returns nil", func(t *testing.T) {
		node := &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "hello"}
		issues := funcSchema(node, "", map[string]interface{}{})
		if len(issues) != 0 {
			t.Errorf("expected no issues without schema opt, got %d", len(issues))
		}
	})

	t.Run("type mismatch produces issue", func(t *testing.T) {
		node := &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "hello"}
		issues := funcSchema(node, "", map[string]interface{}{
			"schema": map[string]interface{}{"type": "integer"},
		})
		if len(issues) == 0 {
			t.Error("expected issue for type mismatch")
		}
	})
}

func TestValidateSchemaBasic(t *testing.T) {
	tests := []struct {
		name      string
		node      *yaml.Node
		schema    map[string]interface{}
		wantIssue bool
	}{
		{
			name:      "string matches string type",
			node:      &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "ok"},
			schema:    map[string]interface{}{"type": "string"},
			wantIssue: false,
		},
		{
			name:      "int does not match string type",
			node:      &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!int", Value: "42"},
			schema:    map[string]interface{}{"type": "string"},
			wantIssue: true,
		},
		{
			name:      "array type check",
			node:      &yaml.Node{Kind: yaml.SequenceNode},
			schema:    map[string]interface{}{"type": "array"},
			wantIssue: false,
		},
		{
			name:      "scalar not array",
			node:      &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "x"},
			schema:    map[string]interface{}{"type": "array"},
			wantIssue: true,
		},
		{
			name:      "object type check",
			node:      &yaml.Node{Kind: yaml.MappingNode},
			schema:    map[string]interface{}{"type": "object"},
			wantIssue: false,
		},
		{
			name:      "enum valid value",
			node:      &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "active"},
			schema:    map[string]interface{}{"enum": []interface{}{"active", "inactive"}},
			wantIssue: false,
		},
		{
			name:      "enum invalid value",
			node:      &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "deleted"},
			schema:    map[string]interface{}{"enum": []interface{}{"active", "inactive"}},
			wantIssue: true,
		},
		{
			name:      "no type returns nil",
			node:      &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "ok"},
			schema:    map[string]interface{}{},
			wantIssue: false,
		},
		{
			name:      "boolean type check pass",
			node:      &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: "true"},
			schema:    map[string]interface{}{"type": "boolean"},
			wantIssue: false,
		},
		{
			name:      "boolean type check fail",
			node:      &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "true"},
			schema:    map[string]interface{}{"type": "boolean"},
			wantIssue: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			issues := validateSchemaBasic(tt.node, tt.schema)
			if tt.wantIssue && len(issues) == 0 {
				t.Error("expected issue but got none")
			}
			if !tt.wantIssue && len(issues) > 0 {
				t.Errorf("expected no issues but got: %v", issues[0].Message)
			}
		})
	}
}

func TestFuncTypedEnum(t *testing.T) {
	t.Run("nil node returns nil", func(t *testing.T) {
		issues := funcTypedEnum(nil, "", nil)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d", len(issues))
		}
	})

	t.Run("matching types produce no issues", func(t *testing.T) {
		node := &yaml.Node{
			Kind: yaml.MappingNode,
			Content: []*yaml.Node{
				{Kind: yaml.ScalarNode, Value: "type"},
				{Kind: yaml.ScalarNode, Tag: "!!str", Value: "string"},
				{Kind: yaml.ScalarNode, Value: "enum"},
				{Kind: yaml.SequenceNode, Content: []*yaml.Node{
					{Kind: yaml.ScalarNode, Tag: "!!str", Value: "a"},
					{Kind: yaml.ScalarNode, Tag: "!!str", Value: "b"},
				}},
			},
		}
		issues := funcTypedEnum(node, "", nil)
		if len(issues) != 0 {
			t.Errorf("expected no issues, got %d: %v", len(issues), issues)
		}
	})

	t.Run("mismatched enum value produces issue", func(t *testing.T) {
		node := &yaml.Node{
			Kind: yaml.MappingNode,
			Content: []*yaml.Node{
				{Kind: yaml.ScalarNode, Value: "type"},
				{Kind: yaml.ScalarNode, Tag: "!!str", Value: "integer"},
				{Kind: yaml.ScalarNode, Value: "enum"},
				{Kind: yaml.SequenceNode, Content: []*yaml.Node{
					{Kind: yaml.ScalarNode, Tag: "!!str", Value: "not-an-int"},
				}},
			},
		}
		issues := funcTypedEnum(node, "", nil)
		if len(issues) == 0 {
			t.Error("expected issues for type mismatch")
		}
	})
}

func TestScalarMatchesType(t *testing.T) {
	tests := []struct {
		name         string
		tag          string
		expectedType string
		want         bool
	}{
		{"string matches string", "!!str", "string", true},
		{"int matches integer", "!!int", "integer", true},
		{"int matches number", "!!int", "number", true},
		{"float matches number", "!!float", "number", true},
		{"bool matches boolean", "!!bool", "boolean", true},
		{"str does not match integer", "!!str", "integer", false},
		{"int does not match string", "!!int", "string", false},
		{"unknown type always matches", "!!str", "unknown", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			node := &yaml.Node{Kind: yaml.ScalarNode, Tag: tt.tag, Value: "test"}
			got := scalarMatchesType(node, tt.expectedType)
			if got != tt.want {
				t.Errorf("scalarMatchesType(tag=%q, type=%q) = %v, want %v", tt.tag, tt.expectedType, got, tt.want)
			}
		})
	}

	t.Run("non-scalar returns false", func(t *testing.T) {
		node := &yaml.Node{Kind: yaml.MappingNode}
		if scalarMatchesType(node, "string") {
			t.Error("expected false for non-scalar node")
		}
	})
}
