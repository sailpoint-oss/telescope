package cli

import (
	"os"
	"path/filepath"

	"github.com/sailpoint-oss/telescope/server/config"
)

func loadCommandConfig(path string) (*config.Config, string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, "", err
	}
	if cfgFile != "" {
		cfg, err := config.LoadFile(cfgFile)
		return cfg, config.WorkspaceRootForConfigPath(cfgFile), err
	}
	for dir := filepath.Dir(abs); ; {
		for _, name := range config.ConfigFiles {
			candidate := filepath.Join(dir, name)
			if _, err := os.Stat(candidate); err == nil {
				cfg, loadErr := config.LoadFile(candidate)
				return cfg, config.WorkspaceRootForConfigPath(candidate), loadErr
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return config.DefaultConfig(), filepath.Dir(abs), nil
}
