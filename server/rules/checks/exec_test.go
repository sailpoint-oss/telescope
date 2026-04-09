package checks

import (
	"strings"
	"testing"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/testutil"
)

func captureSyntaxCheck(t *testing.T) treesitter.Check {
	t.Helper()
	s := gossip.NewServer("capture-syntax", "0.0.0")
	var out treesitter.Check
	s.SetCheckHook(func(name string, c treesitter.Check) {
		if name == "syntax-error" {
			out = c
		}
	})
	registerSyntaxErrors(s)
	return out
}

func captureMissingTokenAnalyzer(t *testing.T) treesitter.Analyzer {
	t.Helper()
	s := gossip.NewServer("capture-missing", "0.0.0")
	var out treesitter.Analyzer
	s.SetAnalyzeHook(func(name string, a treesitter.Analyzer) {
		if name == "missing-token" {
			out = a
		}
	})
	registerMissingTokens(s)
	return out
}

func TestSyntaxErrorCheck_MessageTruncatesLongCapture(t *testing.T) {
	chk := captureSyntaxCheck(t)
	if chk.Message == nil {
		t.Fatal("nil Message")
	}
	long := strings.Repeat("e", 50)
	msg := chk.Message(treesitter.Capture{Text: long})
	if !strings.Contains(msg, "...") || len(msg) > 90 {
		t.Errorf("expected compact truncated message, got len=%d: %q", len(msg), msg)
	}
}

func TestSyntaxErrorCheck_FindsErrorNodesYAML(t *testing.T) {
	chk := captureSyntaxCheck(t)
	raw := testutil.ParseYAML(t, []byte("openapi: 3.0.0\n  not_a_key_under_root: true\n"))
	tree := treesitter.NewTree(raw, []byte("openapi: 3.0.0\n  not_a_key_under_root: true\n"))
	lang := testutil.YAMLLanguage()

	diags := rules.RunChecksProto([]rules.NamedCheck{{Name: "syntax-error", Check: chk}}, tree, lang)
	if len(diags) < 1 {
		t.Fatalf("expected syntax-error diagnostics, got 0")
	}
	var sawSyntax bool
	for _, d := range diags {
		if c, ok := d.Code.(string); ok && c == "syntax-error" {
			sawSyntax = true
		}
		if d.Severity != protocol.SeverityError {
			t.Errorf("want SeverityError, got %v", d.Severity)
		}
		if !strings.Contains(d.Message, "Syntax error") {
			t.Errorf("message %q should mention syntax", d.Message)
		}
	}
	if !sawSyntax {
		t.Fatalf("no diagnostic with code syntax-error: %#v", diags)
	}
}

func TestMissingTokenAnalyzer_UnclosedBraceJSON(t *testing.T) {
	an := captureMissingTokenAnalyzer(t)
	src := `{"openapi":"3.0.0","info":{"title":"x"}`
	raw := testutil.ParseJSON(t, []byte(src))
	tree := treesitter.NewTree(raw, []byte(src))

	ctx := &treesitter.AnalysisContext{Tree: tree}
	diags := an.Run(ctx)
	if len(diags) == 0 {
		t.Fatal("expected missing-token diagnostics for unclosed JSON object")
	}
	for _, d := range diags {
		if d.Code != "missing-token" {
			t.Errorf("code = %v", d.Code)
		}
		if d.Severity != protocol.SeverityError {
			t.Errorf("severity = %v", d.Severity)
		}
		if !strings.HasPrefix(d.Message, "Expected") {
			t.Errorf("message %q", d.Message)
		}
		if d.CodeDescription == nil || d.CodeDescription.Href == "" {
			t.Error("expected CodeDescription.Href")
		}
	}
}

func TestMissingTokenAnalyzer_NilTree(t *testing.T) {
	an := captureMissingTokenAnalyzer(t)
	if diags := an.Run(&treesitter.AnalysisContext{Tree: nil}); len(diags) != 0 {
		t.Fatalf("nil tree should yield no diags, got %d", len(diags))
	}
}

func TestMissingTokenAnalyzer_NoMissingNodes(t *testing.T) {
	an := captureMissingTokenAnalyzer(t)
	src := `{"openapi":"3.0.0","info":{"title":"x"},"paths":{}}`
	raw := testutil.ParseJSON(t, []byte(src))
	tree := treesitter.NewTree(raw, []byte(src))
	if diags := an.Run(&treesitter.AnalysisContext{Tree: tree}); len(diags) != 0 {
		t.Fatalf("valid minimal JSON should have no missing-token diags, got %#v", diags)
	}
}
