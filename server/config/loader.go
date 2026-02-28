package config

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// ConfigFiles are the files searched for configuration, in priority order.
var ConfigFiles = []string{
	".telescope.yaml",
	".telescope.yml",
	".telescope/config.yaml",
	".telescope/config.yml",
}

// Load finds and loads the telescope config from the given workspace root.
// Returns the default config if no config file is found.
func Load(workspaceRoot string) (*Config, error) {
	for _, name := range ConfigFiles {
		path := filepath.Join(workspaceRoot, name)
		if _, err := os.Stat(path); err == nil {
			return LoadFile(path)
		}
	}
	return DefaultConfig(), nil
}

// LoadFile loads config from a specific file path.
func LoadFile(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}

	cfg := DefaultConfig()
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}

	return cfg, nil
}
