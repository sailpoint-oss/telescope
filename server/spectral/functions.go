package spectral

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"sync"
	"unicode"

	"gopkg.in/yaml.v3"
)

// spectralRegexCache memoizes compileSpectralRegex results keyed by the raw
// expression (including any `/pattern/flags` wrapper). *regexp.Regexp is safe
// for concurrent use; sharing compiled regexes across pattern evaluations
// removes a large source of per-Execute allocations.
type spectralRegexCacheEntry struct {
	re  *regexp.Regexp
	err error
}

var spectralRegexCache sync.Map // expr string -> *spectralRegexCacheEntry

// SpectralFunc validates a YAML node and returns any issues found. The field
// parameter narrows the check to a specific child of the node. Options come
// from the rule's functionOptions.
type SpectralFunc func(node *yaml.Node, field string, opts map[string]interface{}) []Issue

// BuiltinFunctions maps Spectral function names to their implementations.
var BuiltinFunctions = map[string]SpectralFunc{
	"truthy":                    funcTruthy,
	"falsy":                     funcFalsy,
	"defined":                   funcDefined,
	"undefined":                 funcUndefined,
	"pattern":                   funcPattern,
	"casing":                    funcCasing,
	"length":                    funcLength,
	"enumeration":               funcEnumeration,
	"schema":                    funcSchema,
	"alphabetical":              funcAlphabetical,
	"or":                        funcOr,
	"xor":                       funcXor,
	"typedEnum":                 funcTypedEnum,
	"unreferencedReusableObject": funcUnreferencedReusableObject,
}

func targetNode(node *yaml.Node, field string) *yaml.Node {
	if field == "" {
		return node
	}
	return nodeField(node, field)
}

// --- truthy / falsy / defined / undefined ---

func funcTruthy(node *yaml.Node, field string, _ map[string]interface{}) []Issue {
	target := targetNode(node, field)
	if target == nil || isFalsy(target) {
		return []Issue{{Node: node, Message: fieldMsg(field, "must be truthy")}}
	}
	return nil
}

func funcFalsy(node *yaml.Node, field string, _ map[string]interface{}) []Issue {
	target := targetNode(node, field)
	if target != nil && !isFalsy(target) {
		return []Issue{{Node: node, Message: fieldMsg(field, "must be falsy")}}
	}
	return nil
}

func funcDefined(node *yaml.Node, field string, _ map[string]interface{}) []Issue {
	if field == "" {
		if node == nil {
			return []Issue{{Node: node, Message: "must be defined"}}
		}
		return nil
	}
	if !nodeHasField(node, field) {
		return []Issue{{Node: node, Message: fmt.Sprintf("'%s' must be defined", field)}}
	}
	return nil
}

func funcUndefined(node *yaml.Node, field string, _ map[string]interface{}) []Issue {
	if field == "" {
		if node != nil {
			return []Issue{{Node: node, Message: "must be undefined"}}
		}
		return nil
	}
	if nodeHasField(node, field) {
		return []Issue{{Node: node, Message: fmt.Sprintf("'%s' must not be defined", field)}}
	}
	return nil
}

// --- pattern ---

func funcPattern(node *yaml.Node, field string, opts map[string]interface{}) []Issue {
	target := targetNode(node, field)
	if target == nil || target.Kind != yaml.ScalarNode {
		return nil
	}
	val := target.Value

	if matchExpr, ok := opts["match"].(string); ok {
		re, err := compileSpectralRegex(matchExpr)
		if err != nil {
			return []Issue{{Node: node, Message: fmt.Sprintf("invalid match regex: %v", err)}}
		}
		if !re.MatchString(val) {
			return []Issue{{Node: target, Message: fmt.Sprintf("must match pattern %q", matchExpr)}}
		}
	}

	if notMatch, ok := opts["notMatch"].(string); ok {
		re, err := compileSpectralRegex(notMatch)
		if err != nil {
			return []Issue{{Node: node, Message: fmt.Sprintf("invalid notMatch regex: %v", err)}}
		}
		if re.MatchString(val) {
			return []Issue{{Node: target, Message: fmt.Sprintf("must not match pattern %q", notMatch)}}
		}
	}

	return nil
}

func compileSpectralRegex(expr string) (*regexp.Regexp, error) {
	if cached, ok := spectralRegexCache.Load(expr); ok {
		entry := cached.(*spectralRegexCacheEntry)
		return entry.re, entry.err
	}
	re, err := compileSpectralRegexUncached(expr)
	entry := &spectralRegexCacheEntry{re: re, err: err}
	actual, _ := spectralRegexCache.LoadOrStore(expr, entry)
	return actual.(*spectralRegexCacheEntry).re, actual.(*spectralRegexCacheEntry).err
}

func compileSpectralRegexUncached(expr string) (*regexp.Regexp, error) {
	// Spectral allows /regex/flags syntax
	if strings.HasPrefix(expr, "/") {
		lastSlash := strings.LastIndex(expr, "/")
		if lastSlash > 0 {
			pattern := expr[1:lastSlash]
			flags := expr[lastSlash+1:]
			prefix := ""
			if strings.Contains(flags, "i") {
				prefix = "(?i)"
			}
			return regexp.Compile(prefix + pattern)
		}
	}
	return regexp.Compile(expr)
}

// --- casing ---

func funcCasing(node *yaml.Node, field string, opts map[string]interface{}) []Issue {
	target := targetNode(node, field)
	if target == nil || target.Kind != yaml.ScalarNode {
		return nil
	}
	val := target.Value
	casingType, _ := opts["type"].(string)
	if casingType == "" {
		return nil
	}

	if !matchesCasing(val, casingType) {
		return []Issue{{Node: target, Message: fmt.Sprintf("must be %s case", casingType)}}
	}
	return nil
}

func matchesCasing(val, casing string) bool {
	if val == "" {
		return true
	}
	switch casing {
	case "flat":
		return val == strings.ToLower(val) && !strings.ContainsAny(val, "-_ ")
	case "camel":
		return unicode.IsLower(rune(val[0])) && !strings.ContainsAny(val, "-_ ")
	case "pascal":
		return unicode.IsUpper(rune(val[0])) && !strings.ContainsAny(val, "-_ ")
	case "kebab":
		return val == strings.ToLower(val) && !strings.Contains(val, "_") && !strings.Contains(val, " ")
	case "cobol":
		return val == strings.ToUpper(val) && !strings.Contains(val, "_") && !strings.Contains(val, " ")
	case "snake":
		return val == strings.ToLower(val) && !strings.Contains(val, "-") && !strings.Contains(val, " ")
	case "macro":
		return val == strings.ToUpper(val) && !strings.Contains(val, "-") && !strings.Contains(val, " ")
	default:
		return true
	}
}

// --- length ---

func funcLength(node *yaml.Node, field string, opts map[string]interface{}) []Issue {
	target := targetNode(node, field)
	if target == nil {
		return nil
	}

	var length int
	switch target.Kind {
	case yaml.ScalarNode:
		length = len(target.Value)
	case yaml.SequenceNode:
		length = len(target.Content)
	case yaml.MappingNode:
		length = len(target.Content) / 2
	default:
		return nil
	}

	if minVal, ok := toInt(opts["min"]); ok && length < minVal {
		return []Issue{{Node: target, Message: fmt.Sprintf("length %d is less than minimum %d", length, minVal)}}
	}
	if maxVal, ok := toInt(opts["max"]); ok && length > maxVal {
		return []Issue{{Node: target, Message: fmt.Sprintf("length %d is greater than maximum %d", length, maxVal)}}
	}
	return nil
}

// --- enumeration ---

func funcEnumeration(node *yaml.Node, field string, opts map[string]interface{}) []Issue {
	target := targetNode(node, field)
	if target == nil || target.Kind != yaml.ScalarNode {
		return nil
	}

	values, ok := opts["values"].([]interface{})
	if !ok {
		return nil
	}

	val := nodeValue(target)
	for _, allowed := range values {
		if fmt.Sprint(val) == fmt.Sprint(allowed) {
			return nil
		}
	}
	return []Issue{{Node: target, Message: fmt.Sprintf("value %v is not one of the allowed values", val)}}
}

// --- alphabetical ---

func funcAlphabetical(node *yaml.Node, field string, opts map[string]interface{}) []Issue {
	target := targetNode(node, field)
	if target == nil || target.Kind != yaml.SequenceNode {
		return nil
	}

	keyedBy, _ := opts["keyedBy"].(string)
	var values []string

	for _, item := range target.Content {
		if keyedBy != "" {
			if sub := nodeField(item, keyedBy); sub != nil && sub.Kind == yaml.ScalarNode {
				values = append(values, sub.Value)
			}
		} else if item.Kind == yaml.ScalarNode {
			values = append(values, item.Value)
		}
	}

	if !sort.StringsAreSorted(values) {
		return []Issue{{Node: target, Message: "values must be alphabetically sorted"}}
	}
	return nil
}

// --- or / xor ---

func funcOr(node *yaml.Node, field string, opts map[string]interface{}) []Issue {
	_ = field
	props := toStringSlice(opts["properties"])
	if len(props) < 2 {
		return nil
	}

	for _, p := range props {
		if nodeHasField(node, p) {
			return nil
		}
	}
	return []Issue{{Node: node, Message: fmt.Sprintf("at least one of %s must be defined", strings.Join(props, ", "))}}
}

func funcXor(node *yaml.Node, field string, opts map[string]interface{}) []Issue {
	_ = field
	props := toStringSlice(opts["properties"])
	if len(props) < 2 {
		return nil
	}

	count := 0
	for _, p := range props {
		if nodeHasField(node, p) {
			count++
		}
	}
	if count != 1 {
		return []Issue{{Node: node, Message: fmt.Sprintf("exactly one of %s must be defined", strings.Join(props, ", "))}}
	}
	return nil
}

// --- schema ---

func funcSchema(node *yaml.Node, field string, opts map[string]interface{}) []Issue {
	// JSON Schema validation within Spectral rules. For now, we perform a
	// basic structural check. Full JSON Schema integration can be added
	// using the existing gossip/jsonschema package if needed.
	target := targetNode(node, field)
	if target == nil {
		return nil
	}

	schemaDef, ok := opts["schema"].(map[string]interface{})
	if !ok {
		return nil
	}

	return validateSchemaBasic(target, schemaDef)
}

func validateSchemaBasic(node *yaml.Node, schema map[string]interface{}) []Issue {
	expectedType, _ := schema["type"].(string)

	// Validate enum constraint (applies regardless of type)
	if enumRaw, ok := schema["enum"]; ok {
		if enumList, ok := enumRaw.([]interface{}); ok && node.Kind == yaml.ScalarNode {
			found := false
			for _, allowed := range enumList {
				if fmt.Sprint(allowed) == node.Value {
					found = true
					break
				}
			}
			if !found {
				return []Issue{{Node: node, Message: fmt.Sprintf("value %q is not one of the allowed enum values", node.Value)}}
			}
		}
	}

	if expectedType == "" {
		return nil
	}

	switch expectedType {
	case "array":
		if node.Kind != yaml.SequenceNode {
			return []Issue{{Node: node, Message: "must be an array"}}
		}
		if minItems, ok := toInt(schema["minItems"]); ok && len(node.Content) < minItems {
			return []Issue{{Node: node, Message: fmt.Sprintf("array must have at least %d items", minItems)}}
		}
	case "object":
		if node.Kind != yaml.MappingNode {
			return []Issue{{Node: node, Message: "must be an object"}}
		}

		// Validate required fields
		if reqRaw, ok := schema["required"]; ok {
			if reqList, ok := reqRaw.([]interface{}); ok {
				for _, r := range reqList {
					reqName, _ := r.(string)
					if reqName != "" && !nodeHasField(node, reqName) {
						return []Issue{{Node: node, Message: fmt.Sprintf("missing required property %q", reqName)}}
					}
				}
			}
		}

		// Validate properties
		if propsRaw, ok := schema["properties"]; ok {
			if propsMap, ok := propsRaw.(map[string]interface{}); ok {
				for propName, propSchemaRaw := range propsMap {
					child := nodeField(node, propName)
					if child == nil {
						continue
					}
					if propSchema, ok := propSchemaRaw.(map[string]interface{}); ok {
						if issues := validateSchemaBasic(child, propSchema); len(issues) > 0 {
							return issues
						}
					}
				}
			}
		}
	case "string":
		if node.Kind != yaml.ScalarNode || node.Tag != "!!str" {
			return []Issue{{Node: node, Message: "must be a string"}}
		}
	case "integer", "number":
		if node.Kind != yaml.ScalarNode || (node.Tag != "!!int" && node.Tag != "!!float") {
			return []Issue{{Node: node, Message: fmt.Sprintf("must be a %s", expectedType)}}
		}
	case "boolean":
		if node.Kind != yaml.ScalarNode || node.Tag != "!!bool" {
			return []Issue{{Node: node, Message: "must be a boolean"}}
		}
	}
	return nil
}

// --- typedEnum ---

func funcTypedEnum(node *yaml.Node, field string, _ map[string]interface{}) []Issue {
	target := targetNode(node, field)
	if target == nil || target.Kind != yaml.MappingNode {
		return nil
	}

	typeNode := nodeField(target, "type")
	enumNode := nodeField(target, "enum")
	if typeNode == nil || enumNode == nil || enumNode.Kind != yaml.SequenceNode {
		return nil
	}

	expectedType := typeNode.Value
	var issues []Issue
	for _, item := range enumNode.Content {
		if !scalarMatchesType(item, expectedType) {
			issues = append(issues, Issue{
				Node:    item,
				Message: fmt.Sprintf("enum value %q does not match type %q", item.Value, expectedType),
			})
		}
	}
	return issues
}

func scalarMatchesType(node *yaml.Node, expectedType string) bool {
	if node.Kind != yaml.ScalarNode {
		return false
	}
	switch expectedType {
	case "string":
		return node.Tag == "!!str"
	case "integer":
		return node.Tag == "!!int"
	case "number":
		return node.Tag == "!!int" || node.Tag == "!!float"
	case "boolean":
		return node.Tag == "!!bool"
	default:
		return true
	}
}

// --- unreferencedReusableObject ---

func funcUnreferencedReusableObject(node *yaml.Node, field string, opts map[string]interface{}) []Issue {
	_ = field
	if node == nil || node.Kind != yaml.MappingNode {
		return nil
	}

	reusableLoc, _ := opts["reusableObjectsLocation"].(string)
	if reusableLoc == "" {
		return nil
	}

	root, _ := opts["__root__"].(*yaml.Node)
	if root == nil {
		return nil
	}

	// Collect all $ref values from the entire document.
	refs := collectRefs(root)

	// Check each child of the matched mapping for references.
	var issues []Issue
	for i := 0; i < len(node.Content)-1; i += 2 {
		keyNode := node.Content[i]
		name := keyNode.Value
		refPath := reusableLoc + "/" + name
		if !refs[refPath] {
			issues = append(issues, Issue{
				Node:    keyNode,
				Message: fmt.Sprintf("component %q is not referenced", name),
			})
		}
	}

	return issues
}

// collectRefs walks the entire YAML tree and returns a set of all $ref values.
func collectRefs(node *yaml.Node) map[string]bool {
	refs := make(map[string]bool)
	collectRefsRecursive(node, refs)
	return refs
}

func collectRefsRecursive(node *yaml.Node, refs map[string]bool) {
	if node == nil {
		return
	}
	switch node.Kind {
	case yaml.DocumentNode:
		for _, child := range node.Content {
			collectRefsRecursive(child, refs)
		}
	case yaml.MappingNode:
		for i := 0; i < len(node.Content)-1; i += 2 {
			key := node.Content[i]
			val := node.Content[i+1]
			if key.Value == "$ref" && val.Kind == yaml.ScalarNode {
				refs[val.Value] = true
			} else {
				collectRefsRecursive(val, refs)
			}
		}
	case yaml.SequenceNode:
		for _, item := range node.Content {
			collectRefsRecursive(item, refs)
		}
	}
}

// --- helpers ---

func isFalsy(node *yaml.Node) bool {
	if node == nil {
		return true
	}
	switch node.Kind {
	case yaml.ScalarNode:
		v := node.Value
		return v == "" || v == "false" || v == "0" || v == "null" || node.Tag == "!!null"
	case yaml.SequenceNode:
		return len(node.Content) == 0
	case yaml.MappingNode:
		return len(node.Content) == 0
	}
	return false
}

func fieldMsg(field, msg string) string {
	if field != "" {
		return fmt.Sprintf("'%s' %s", field, msg)
	}
	return msg
}

func toInt(v interface{}) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	default:
		return 0, false
	}
}

func toStringSlice(v interface{}) []string {
	switch s := v.(type) {
	case []string:
		return s
	case []interface{}:
		var out []string
		for _, item := range s {
			if str, ok := item.(string); ok {
				out = append(out, str)
			}
		}
		return out
	}
	return nil
}
