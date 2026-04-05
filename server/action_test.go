package main

import (
	"os"
	"testing"

	"gopkg.in/yaml.v3"
)

type actionMetadata struct {
	Inputs  map[string]actionInput  `yaml:"inputs"`
	Outputs map[string]actionOutput `yaml:"outputs"`
}

type actionInput struct {
	Default string `yaml:"default"`
}

type actionOutput struct {
	Description string `yaml:"description"`
}

func TestActionYAML_ExposesSpecAnalysisContract(t *testing.T) {
	data, err := os.ReadFile("../action.yml")
	if err != nil {
		t.Fatalf("read action.yml: %v", err)
	}

	var meta actionMetadata
	if err := yaml.Unmarshal(data, &meta); err != nil {
		t.Fatalf("parse action.yml: %v", err)
	}

	if meta.Inputs["mode"].Default != "ci" {
		t.Fatalf("mode default = %q, want ci", meta.Inputs["mode"].Default)
	}

	for _, key := range []string{
		"working-directory",
		"paths",
		"config",
		"ruleset",
		"diff-base",
		"diff-head",
		"severity",
		"fail-on",
		"no-external-lsp",
		"comment-pr",
		"report-md",
		"report-json",
	} {
		if _, ok := meta.Inputs[key]; !ok {
			t.Fatalf("missing action input %q", key)
		}
	}

	for _, key := range []string{"report-md", "report-json", "error"} {
		if _, ok := meta.Outputs[key]; !ok {
			t.Fatalf("missing action output %q", key)
		}
	}
}
