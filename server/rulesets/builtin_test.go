package rulesets_test

import (
	"testing"

	"github.com/LukasParke/gossip"
	"github.com/sailpoint-oss/telescope/server/rules/analyzers"
	"github.com/sailpoint-oss/telescope/server/rules/checks"
	"github.com/sailpoint-oss/telescope/server/rulesets"
)

func init() {
	s := gossip.NewServer("test", "0.0.0")
	analyzers.RegisterAll(s)
	checks.RegisterAll(s)
}

func TestGetBuiltin_StrictNonEmpty(t *testing.T) {
	rs := rulesets.GetBuiltin("telescope:strict")
	if rs == nil {
		t.Fatal("GetBuiltin(telescope:strict) returned nil")
	}
	if len(rs.Rules) == 0 {
		t.Fatal("telescope:strict should have non-empty Rules (recommended + OWASP)")
	}

	recommended := rulesets.GetBuiltin("telescope:recommended")
	if recommended == nil {
		t.Fatal("GetBuiltin(telescope:recommended) returned nil")
	}
	owasp := rulesets.GetBuiltin("telescope:owasp")
	if owasp == nil {
		t.Fatal("GetBuiltin(telescope:owasp) returned nil")
	}

	// Strict must contain all recommended rules
	for id := range recommended.Rules {
		if _, ok := rs.Rules[id]; !ok {
			t.Errorf("telescope:strict missing recommended rule %q", id)
		}
	}

	// Strict must contain all OWASP rules
	for id := range owasp.Rules {
		if _, ok := rs.Rules[id]; !ok {
			t.Errorf("telescope:strict missing OWASP rule %q", id)
		}
	}
}

func TestGetBuiltin_RecommendedNonEmpty(t *testing.T) {
	rs := rulesets.GetBuiltin("telescope:recommended")
	if rs == nil {
		t.Fatal("returned nil")
	}
	if len(rs.Rules) == 0 {
		t.Fatal("expected non-empty rules")
	}
}

func TestGetBuiltin_UnknownReturnsNil(t *testing.T) {
	rs := rulesets.GetBuiltin("telescope:nonexistent")
	if rs != nil {
		t.Error("expected nil for unknown builtin")
	}
}

func TestGetBuiltin_StrictEnabledMap(t *testing.T) {
	rs := rulesets.GetBuiltin("telescope:strict")
	enabled := rulesets.BuildEnabledMap(rs)
	if len(enabled) == 0 {
		t.Fatal("BuildEnabledMap(strict) should be non-empty")
	}
	for id, v := range enabled {
		if !v {
			t.Errorf("rule %q should be enabled in strict", id)
		}
	}
}
