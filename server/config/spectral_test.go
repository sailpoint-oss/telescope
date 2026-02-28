package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/sailpoint-oss/telescope/server/config"
)

func TestFindSpectralRuleset(t *testing.T) {
	t.Run("finds .spectral.yaml at root", func(t *testing.T) {
		dir := t.TempDir()
		spectralFile := filepath.Join(dir, ".spectral.yaml")
		os.WriteFile(spectralFile, []byte("extends: spectral:oas\n"), 0644)

		found, err := config.FindSpectralRuleset(dir)
		if err != nil {
			t.Fatalf("FindSpectralRuleset: %v", err)
		}
		if found != spectralFile {
			t.Errorf("got %q, want %q", found, spectralFile)
		}
	})

	t.Run("finds .telescope/spectral.yaml first", func(t *testing.T) {
		dir := t.TempDir()
		telescopeDir := filepath.Join(dir, ".telescope")
		os.MkdirAll(telescopeDir, 0755)

		telescopeSpectral := filepath.Join(telescopeDir, "spectral.yaml")
		os.WriteFile(telescopeSpectral, []byte("extends: spectral:oas\n"), 0644)

		rootSpectral := filepath.Join(dir, ".spectral.yaml")
		os.WriteFile(rootSpectral, []byte("extends: spectral:oas\n"), 0644)

		found, err := config.FindSpectralRuleset(dir)
		if err != nil {
			t.Fatalf("FindSpectralRuleset: %v", err)
		}
		if found != telescopeSpectral {
			t.Errorf("got %q, want %q (telescope dir should take priority)", found, telescopeSpectral)
		}
	})

	t.Run("returns empty when no file exists", func(t *testing.T) {
		dir := t.TempDir()

		found, err := config.FindSpectralRuleset(dir)
		if err != nil {
			t.Fatalf("FindSpectralRuleset: %v", err)
		}
		if found != "" {
			t.Errorf("expected empty, got %q", found)
		}
	})

	t.Run("finds .spectral.yml variant", func(t *testing.T) {
		dir := t.TempDir()
		spectralFile := filepath.Join(dir, ".spectral.yml")
		os.WriteFile(spectralFile, []byte("extends: spectral:oas\n"), 0644)

		found, err := config.FindSpectralRuleset(dir)
		if err != nil {
			t.Fatalf("FindSpectralRuleset: %v", err)
		}
		if found != spectralFile {
			t.Errorf("got %q, want %q", found, spectralFile)
		}
	})
}

func TestLoadSpectralRuleset(t *testing.T) {
	t.Run("loads and parses valid ruleset", func(t *testing.T) {
		dir := t.TempDir()
		content := `extends: spectral:oas
rules:
  info-contact: error
  operation-description: off
`
		os.WriteFile(filepath.Join(dir, ".spectral.yaml"), []byte(content), 0644)

		rs, err := config.LoadSpectralRuleset(dir)
		if err != nil {
			t.Fatalf("LoadSpectralRuleset: %v", err)
		}
		if rs == nil {
			t.Fatal("expected non-nil ruleset")
		}
		if rs.Rules["info-contact"].Severity != "error" {
			t.Errorf("info-contact severity = %q, want %q", rs.Rules["info-contact"].Severity, "error")
		}
		if rs.Rules["operation-description"].Severity != "off" {
			t.Errorf("operation-description severity = %q, want %q", rs.Rules["operation-description"].Severity, "off")
		}
	})

	t.Run("returns nil when no file exists", func(t *testing.T) {
		dir := t.TempDir()

		rs, err := config.LoadSpectralRuleset(dir)
		if err != nil {
			t.Fatalf("LoadSpectralRuleset: %v", err)
		}
		if rs != nil {
			t.Error("expected nil when no file exists")
		}
	})
}
