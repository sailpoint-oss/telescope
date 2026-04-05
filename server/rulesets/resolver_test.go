package rulesets_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sailpoint-oss/telescope/server/rulesets"
)

func TestResolveCircularExtends(t *testing.T) {
	t.Run("mutual circular reference", func(t *testing.T) {
		dir := t.TempDir()
		fileA := filepath.Join(dir, "a.yaml")
		fileB := filepath.Join(dir, "b.yaml")

		os.WriteFile(fileA, []byte("extends: "+fileB+"\nrules:\n  rule-a:\n    severity: warn\n"), 0644)
		os.WriteFile(fileB, []byte("extends: "+fileA+"\nrules:\n  rule-b:\n    severity: warn\n"), 0644)

		rs, err := rulesets.LoadFile(fileA)
		if err != nil {
			t.Fatalf("LoadFile: %v", err)
		}
		_, err = rulesets.Resolve(rs, dir)
		if err == nil {
			t.Fatal("expected circular extends error, got nil")
		}
		if !strings.Contains(err.Error(), "circular extends") {
			t.Errorf("expected 'circular extends' in error, got: %v", err)
		}
	})

	t.Run("self-referencing file", func(t *testing.T) {
		dir := t.TempDir()
		file := filepath.Join(dir, "self.yaml")

		os.WriteFile(file, []byte("extends: "+file+"\nrules:\n  rule-a:\n    severity: warn\n"), 0644)

		rs, err := rulesets.LoadFile(file)
		if err != nil {
			t.Fatalf("LoadFile: %v", err)
		}
		_, err = rulesets.Resolve(rs, dir)
		if err == nil {
			t.Fatal("expected circular extends error, got nil")
		}
		if !strings.Contains(err.Error(), "circular extends") {
			t.Errorf("expected 'circular extends' in error, got: %v", err)
		}
	})

	t.Run("deep non-circular chain works", func(t *testing.T) {
		dir := t.TempDir()
		fileC := filepath.Join(dir, "c.yaml")
		fileB := filepath.Join(dir, "b.yaml")
		fileA := filepath.Join(dir, "a.yaml")

		os.WriteFile(fileC, []byte("rules:\n  rule-c:\n    severity: warn\n"), 0644)
		os.WriteFile(fileB, []byte("extends: "+fileC+"\nrules:\n  rule-b:\n    severity: warn\n"), 0644)
		os.WriteFile(fileA, []byte("extends: "+fileB+"\nrules:\n  rule-a:\n    severity: error\n"), 0644)

		rs, err := rulesets.LoadFile(fileA)
		if err != nil {
			t.Fatalf("LoadFile: %v", err)
		}
		resolved, err := rulesets.Resolve(rs, dir)
		if err != nil {
			t.Fatalf("Resolve: %v", err)
		}
		if _, ok := resolved.Rules["rule-a"]; !ok {
			t.Error("missing rule-a")
		}
		if _, ok := resolved.Rules["rule-b"]; !ok {
			t.Error("missing rule-b")
		}
		if _, ok := resolved.Rules["rule-c"]; !ok {
			t.Error("missing rule-c")
		}
	})

	t.Run("builtin extends do not cycle", func(t *testing.T) {
		rs := &rulesets.RuleSet{
			Extends: "telescope:recommended",
			Rules: map[string]rulesets.RuleDefinition{
				"my-rule": {Severity: "error"},
			},
		}
		resolved, err := rulesets.Resolve(rs, ".")
		if err != nil {
			t.Fatalf("Resolve: %v", err)
		}
		if len(resolved.Rules) == 0 {
			t.Error("expected non-empty resolved rules")
		}
	})
}
