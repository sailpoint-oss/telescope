// Package testutil provides test helpers and fixtures for Telescope tests.
package testutil

import (
	_ "embed"
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_json "github.com/tree-sitter/tree-sitter-json/bindings/go"
	ts_yaml "github.com/tree-sitter-grammars/tree-sitter-yaml/bindings/go"

	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

//go:embed fixtures/petstore.yaml
var PetstoreYAML []byte

// AllSpecs returns every registered test specification from the specs registry.
func AllSpecs() []specs.Spec { return specs.All() }

// BenchmarkSpecs returns a curated set of specs for benchmarking (one per size tier).
func BenchmarkSpecs() []specs.Spec { return specs.BenchmarkSpecs() }

// YAMLLanguage returns the tree-sitter YAML language.
func YAMLLanguage() *tree_sitter.Language {
	return tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
}

// JSONLanguage returns the tree-sitter JSON language.
func JSONLanguage() *tree_sitter.Language {
	return tree_sitter.NewLanguage(unsafe.Pointer(ts_json.Language()))
}

// ParseYAML parses YAML content into a tree-sitter tree.
func ParseYAML(t *testing.T, content []byte) *tree_sitter.Tree {
	t.Helper()
	parser := tree_sitter.NewParser()
	t.Cleanup(parser.Close)
	if err := parser.SetLanguage(YAMLLanguage()); err != nil {
		t.Fatalf("set YAML language: %v", err)
	}
	tree := parser.Parse(content, nil)
	if tree == nil {
		t.Fatal("failed to parse YAML")
	}
	t.Cleanup(tree.Close)
	return tree
}

// ParseJSON parses JSON content into a tree-sitter tree.
func ParseJSON(t *testing.T, content []byte) *tree_sitter.Tree {
	t.Helper()
	parser := tree_sitter.NewParser()
	t.Cleanup(parser.Close)
	if err := parser.SetLanguage(JSONLanguage()); err != nil {
		t.Fatalf("set JSON language: %v", err)
	}
	tree := parser.Parse(content, nil)
	if tree == nil {
		t.Fatal("failed to parse JSON")
	}
	t.Cleanup(tree.Close)
	return tree
}
