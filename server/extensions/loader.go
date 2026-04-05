package extensions

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
)

// LoadDir reads all .json files from the given directory and registers
// them as extension definitions in the registry.
func LoadDir(dir string, registry *Registry, logger *slog.Logger) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read extension dir %s: %w", dir, err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		if err := loadFile(path, registry); err != nil {
			logger.Warn("failed to load extension schema", "path", path, "error", err)
			continue
		}
		logger.Info("loaded extension schema", "path", path)
	}
	return nil
}

func loadFile(path string, registry *Registry) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}

	var ext ExtensionFile
	if err := json.Unmarshal(data, &ext); err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}

	if ext.Name == "" {
		return fmt.Errorf("%s: missing 'name' field", path)
	}

	return registry.Register(ExtensionMeta{
		Name:        ext.Name,
		Scopes:      ext.Scopes,
		Description: ext.Description,
		Schema:      ext.Schema,
	})
}

// LoadBuiltins registers the embedded built-in vendor extension schemas.
func LoadBuiltins(registry *Registry) error {
	for _, ext := range builtinExtensions {
		if err := registry.Register(ext); err != nil {
			return fmt.Errorf("register builtin extension %s: %w", ext.Name, err)
		}
	}
	return nil
}
