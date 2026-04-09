package checks

import (
	"testing"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/treesitter"
)

func TestRegisterAll_RegistersBarrelmanRules(t *testing.T) {
	s := gossip.NewServer("test", "0.0.0")

	var analyzers []string
	s.SetAnalyzeHook(func(name string, _ treesitter.Analyzer) {
		analyzers = append(analyzers, name)
	})

	RegisterAll(s)

	if len(analyzers) == 0 {
		t.Fatal("RegisterAll should register at least one analyzer from barrelman")
	}
}

func TestRegisterMissingTokens_AddsAnalyzer(t *testing.T) {
	s := gossip.NewServer("test", "0.0.0")

	var got string
	s.SetAnalyzeHook(func(name string, _ treesitter.Analyzer) {
		if name == "missing-token" {
			got = name
		}
	})

	registerMissingTokens(s)

	if got != "missing-token" {
		t.Fatalf("expected analyzer 'missing-token' to be registered, got %q", got)
	}
}

func TestRegisterSyntaxErrors_AddsCheck(t *testing.T) {
	s := gossip.NewServer("test", "0.0.0")

	var got string
	s.SetCheckHook(func(name string, _ treesitter.Check) {
		if name == "syntax-error" {
			got = name
		}
	})

	registerSyntaxErrors(s)

	if got != "syntax-error" {
		t.Fatalf("expected check 'syntax-error' to be registered, got %q", got)
	}
}

func TestMissingTokenMeta_HasExpectedFields(t *testing.T) {
	if missingTokenMeta.ID != "missing-token" {
		t.Errorf("missingTokenMeta.ID = %q, want %q", missingTokenMeta.ID, "missing-token")
	}
	if !missingTokenMeta.Recommended {
		t.Error("missingTokenMeta.Recommended should be true")
	}
	if missingTokenMeta.DocURL == "" {
		t.Error("missingTokenMeta.DocURL should not be empty")
	}
}

func TestKindLabels_ContainsCommonTokens(t *testing.T) {
	expected := []string{"}", "{", "]", "[", ":", ",", "\"", "'"}
	for _, token := range expected {
		if _, ok := kindLabels[token]; !ok {
			t.Errorf("kindLabels missing entry for %q", token)
		}
	}
}

func TestMissingTokenLabelForKind_KnownAndUnknown(t *testing.T) {
	if got := missingTokenLabelForKind("}"); got != "`}`" {
		t.Errorf("known kind: got %q", got)
	}
	if got := missingTokenLabelForKind("???"); got != "???" {
		t.Errorf("unknown kind passthrough: got %q", got)
	}
}
