package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/sailpoint-oss/telescope/server/rulesets"
)

// SpectralFiles lists the config filenames searched for Spectral rulesets, in
// priority order. The .telescope/ directory is searched first so that
// Telescope-specific configuration takes precedence over workspace-root
// Spectral configs.
var SpectralFiles = []string{
	".telescope/spectral.yaml",
	".telescope/spectral.yml",
	".telescope/spectral.json",
	".spectral.yaml",
	".spectral.yml",
	".spectral.json",
}

// FindSpectralRuleset searches the workspace root for a Spectral ruleset file,
// returning the full path to the first match. Returns ("", nil) when no file
// is found.
func FindSpectralRuleset(workspaceRoot string) (string, error) {
	for _, name := range SpectralFiles {
		full := filepath.Join(workspaceRoot, name)
		info, err := os.Stat(full)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return "", fmt.Errorf("stat %s: %w", full, err)
		}
		if !info.IsDir() {
			return full, nil
		}
	}
	return "", nil
}

// LoadSpectralRuleset discovers and loads the first available Spectral ruleset
// file in the workspace. Returns (nil, nil) when no file is found.
func LoadSpectralRuleset(workspaceRoot string) (*rulesets.RuleSet, error) {
	path, err := FindSpectralRuleset(workspaceRoot)
	if err != nil {
		return nil, err
	}
	if path == "" {
		return nil, nil
	}
	return rulesets.LoadFile(path)
}
