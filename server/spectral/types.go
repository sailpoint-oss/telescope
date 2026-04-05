// Package spectral implements a Spectral-compatible YAML rule engine for
// evaluating declarative linting rules against YAML/JSON documents. It
// supports JSONPath-based targeting via the "given" field and Spectral's
// built-in validation functions via the "then" field.
package spectral

import (
	"fmt"
	"strings"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/rulesets"
	"gopkg.in/yaml.v3"
)

// Rule is a fully parsed Spectral rule ready for execution.
type Rule struct {
	ID               string
	Description      string
	Message          string // supports {{value}}, {{path}}, {{property}} placeholders
	Severity         ctypes.Severity
	Given            []string       // JSONPath expressions
	Then             []FunctionCall // validation steps
	Formats          []string       // oas2, oas3, oas3_0, oas3_1
	Recommended      bool
	DocumentationURL string
}

// FunctionCall represents a single validation step within a rule's "then" clause.
type FunctionCall struct {
	Field           string                 // optional sub-field to check on matched nodes
	Function        string                 // built-in function name (e.g., "truthy", "pattern")
	FunctionOptions map[string]interface{} // function-specific configuration
}

// Issue is a single validation failure produced by a built-in function.
type Issue struct {
	Node    *yaml.Node
	Message string
}

// Match represents a JSONPath match result with its source node and decoded value.
type Match struct {
	Node  *yaml.Node  // YAML node at the match location (preserves line/column)
	Path  string      // JSONPath expression that produced this match
	Value interface{} // decoded Go value for function evaluation
}

// ParseRules converts resolved RuleDefinitions from a RuleSet into executable
// Rule values, filtering out override-only entries (those with no given/then).
// Rules that only override severity for native rules are excluded.
func ParseRules(rs *rulesets.RuleSet) []Rule {
	if rs == nil {
		return nil
	}
	var rules []Rule
	for id, def := range rs.Rules {
		r, ok := parseRule(id, def)
		if ok {
			rules = append(rules, r)
		}
	}
	return rules
}

func parseRule(id string, def rulesets.RuleDefinition) (Rule, bool) {
	given := parseGiven(def.Given)
	if len(given) == 0 {
		return Rule{}, false
	}

	then := parseThen(def.Then)
	if len(then) == 0 {
		return Rule{}, false
	}

	sev := ctypes.SeverityWarning
	if s, ok := rulesets.ParseSeverity(def.Severity); ok && s > 0 {
		sev = s
	}

	recommended := true
	if def.Recommended != nil {
		recommended = *def.Recommended
	}

	return Rule{
		ID:          id,
		Description: def.Description,
		Message:     def.Message,
		Severity:    sev,
		Given:       given,
		Then:        then,
		Formats:     def.Formats,
		Recommended: recommended,
	}, true
}

func parseGiven(v interface{}) []string {
	switch g := v.(type) {
	case string:
		if g != "" {
			return []string{g}
		}
	case []interface{}:
		var out []string
		for _, item := range g {
			if s, ok := item.(string); ok && s != "" {
				out = append(out, s)
			}
		}
		return out
	case []string:
		return g
	}
	return nil
}

func parseThen(v interface{}) []FunctionCall {
	switch t := v.(type) {
	case map[string]interface{}:
		fc := parseSingleThen(t)
		if fc.Function != "" {
			return []FunctionCall{fc}
		}
	case []interface{}:
		var out []FunctionCall
		for _, item := range t {
			if m, ok := item.(map[string]interface{}); ok {
				fc := parseSingleThen(m)
				if fc.Function != "" {
					out = append(out, fc)
				}
			}
		}
		return out
	}
	return nil
}

func parseSingleThen(m map[string]interface{}) FunctionCall {
	fc := FunctionCall{}
	if f, ok := m["field"].(string); ok {
		fc.Field = f
	}
	if fn, ok := m["function"].(string); ok {
		fc.Function = fn
	}
	if opts, ok := m["functionOptions"].(map[string]interface{}); ok {
		fc.FunctionOptions = opts
	}
	return fc
}

// ExpandMessage replaces Spectral message template placeholders.
func ExpandMessage(template string, values map[string]string) string {
	if template == "" {
		return ""
	}
	result := template
	for k, v := range values {
		result = strings.ReplaceAll(result, fmt.Sprintf("{{%s}}", k), v)
	}
	return result
}
