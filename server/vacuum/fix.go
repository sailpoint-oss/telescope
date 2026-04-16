package vacuum

import (
	"strings"

	vmodel "github.com/daveshanley/vacuum/model"
	"go.yaml.in/yaml/v4"
)

func defaultAutoFixFunctions() map[string]vmodel.AutoFixFunction {
	return map[string]vmodel.AutoFixFunction{
		"fixEmptyDescription": fillEmptyString("TODO: Add description"),
		"fillEmptyStringTODO": fillEmptyString("TODO"),
	}
}

func fillEmptyString(replacement string) vmodel.AutoFixFunction {
	return func(node *yaml.Node, document *yaml.Node, context *vmodel.RuleFunctionContext) (*yaml.Node, error) {
		if node == nil {
			return node, nil
		}
		if node.Kind == yaml.ScalarNode && strings.TrimSpace(node.Value) == "" {
			node.Value = replacement
		}
		return node, nil
	}
}
