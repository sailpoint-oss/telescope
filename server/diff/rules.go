package diff

import (
	"fmt"
	"os"

	"github.com/pb33f/libopenapi/what-changed/model"
	"go.yaml.in/yaml/v4"
)

// LoadBreakingRules loads openapi-changes-style breaking rules from a YAML file.
func LoadBreakingRules(path string) (*model.BreakingRulesConfig, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read rules: %w", err)
	}
	var cfg model.BreakingRulesConfig
	if err := yaml.Unmarshal(b, &cfg); err != nil {
		return nil, fmt.Errorf("parse rules yaml: %w", err)
	}
	return &cfg, nil
}
