// Package rulestest provides test helpers for validating Telescope rules.
// It works with both built-in Go rules and SDK plugin rules.
//
// Usage:
//
//	func TestMyRule(t *testing.T) {
//	    rulestest.Run(t, "my-rule-id", rulestest.Case{
//	        Name: "catches missing field",
//	        Spec: `openapi: "3.1.0"
//	info:
//	  title: Test
//	  version: "1.0"`,
//	        Expect: []rulestest.Diag{
//	            {Line: 1, Code: "my-rule-id", Severity: rulestest.Warn},
//	        },
//	    })
//	}
package rulestest

import (
	"fmt"
	"strings"
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_yaml "github.com/tree-sitter-grammars/tree-sitter-yaml/bindings/go"

	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// Severity constants for test expectations.
const (
	Error = ctypes.SeverityError
	Warn  = ctypes.SeverityWarning
	Info  = ctypes.SeverityInfo
	Hint  = ctypes.SeverityHint
)

// Diag describes an expected diagnostic.
type Diag struct {
	Line     uint32             // 0-based line
	Col      uint32             // 0-based character (optional, 0 means any)
	Code     string             // rule ID
	Severity ctypes.Severity    // expected severity
	Message  string             // optional substring match
}

// Case is a single test scenario for a rule.
type Case struct {
	Name   string
	Spec   string // YAML content
	Expect []Diag // expected diagnostics
}

// Run executes a rule's analyzer against the given test cases.
// The analyzer should be obtained from rules.Define(...).Build().
func Run(t *testing.T, analyzer treesitter.Analyzer, cases ...Case) {
	t.Helper()

	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			t.Helper()
			idx := buildTestIndex(t, tc.Spec)
			ctx := &treesitter.AnalysisContext{
				UserData: idx,
			}
			diags := analyzer.Run(ctx)
			assertDiagnostics(t, diags, tc.Expect)
		})
	}
}

// RunVisitors executes a rule's visitors directly against test cases.
// This is useful for testing rules by their visitor functions.
func RunVisitors(t *testing.T, ruleID string, severity ctypes.Severity, v rules.Visitors, cases ...Case) {
	t.Helper()

	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			t.Helper()
			idx := buildTestIndex(t, tc.Spec)
			r := rules.NewReporter(ruleID, severity)
			rules.Walk(idx, v, r)
			assertDiagnostics(t, adapt.DiagnosticsToProtocol(r.Diagnostics()), tc.Expect)
		})
	}
}

// RunCustom executes a custom analyzer function against test cases.
// Useful for testing SDK plugin rules without the registry.
func RunCustom(t *testing.T, analyzer treesitter.Analyzer, cases ...Case) {
	t.Helper()

	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			t.Helper()
			idx := buildTestIndex(t, tc.Spec)
			ctx := &treesitter.AnalysisContext{
				UserData: idx,
			}
			diags := analyzer.Run(ctx)
			assertDiagnostics(t, diags, tc.Expect)
		})
	}
}

func buildTestIndex(t *testing.T, spec string) *openapi.Index {
	t.Helper()
	store := document.NewStore()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	t.Cleanup(mgr.Close)

	uri := protocol.DocumentURI("file:///test/spec.yaml")
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: "yaml",
			Version:    1,
			Text:       spec,
		},
	})

	tree := mgr.GetTree(uri)
	if tree == nil {
		t.Fatal("tree-sitter produced nil tree for spec")
	}
	doc := store.Get(uri)
	if doc == nil {
		t.Fatal("document store returned nil")
	}
	return openapi.BuildIndex(tree, doc)
}

func assertDiagnostics(t *testing.T, actual []protocol.Diagnostic, expected []Diag) {
	t.Helper()

	if len(expected) == 0 {
		if len(actual) > 0 {
			t.Errorf("expected no diagnostics, got %d:", len(actual))
			for _, d := range actual {
				t.Errorf("  L%d:%d [%s] %s",
					d.Range.Start.Line, d.Range.Start.Character,
					diagnosticCode(d), d.Message)
			}
		}
		return
	}

	for i, exp := range expected {
		if i >= len(actual) {
			t.Errorf("missing expected diagnostic #%d: L%d code=%s", i, exp.Line, exp.Code)
			continue
		}
		d := actual[i]

		if exp.Line != d.Range.Start.Line {
			t.Errorf("diagnostic #%d line: got %d, want %d (code=%s msg=%q)",
				i, d.Range.Start.Line, exp.Line, diagnosticCode(d), d.Message)
		}
		if exp.Col > 0 && exp.Col != d.Range.Start.Character {
			t.Errorf("diagnostic #%d col: got %d, want %d",
				i, d.Range.Start.Character, exp.Col)
		}
		if exp.Code != "" && exp.Code != diagnosticCode(d) {
			t.Errorf("diagnostic #%d code: got %q, want %q",
				i, diagnosticCode(d), exp.Code)
		}
		if exp.Severity != 0 && int(exp.Severity) != int(d.Severity) {
			t.Errorf("diagnostic #%d severity: got %d, want %d",
				i, d.Severity, exp.Severity)
		}
		if exp.Message != "" && !strings.Contains(d.Message, exp.Message) {
			t.Errorf("diagnostic #%d message: %q does not contain %q",
				i, d.Message, exp.Message)
		}
	}

	if len(actual) > len(expected) {
		t.Errorf("got %d extra diagnostic(s):", len(actual)-len(expected))
		for i := len(expected); i < len(actual); i++ {
			d := actual[i]
			t.Errorf("  L%d:%d [%s] %s",
				d.Range.Start.Line, d.Range.Start.Character,
				diagnosticCode(d), d.Message)
		}
	}
}

func diagnosticCode(d protocol.Diagnostic) string {
	if s, ok := d.Code.(string); ok {
		return s
	}
	return fmt.Sprintf("%v", d.Code)
}
