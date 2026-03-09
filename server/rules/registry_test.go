package rules_test

import (
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

func TestRegistry_RegisterAndGet(t *testing.T) {
	r := rules.NewRegistry()
	meta := rules.RuleMeta{
		ID:          "test-rule",
		Description: "Test rule",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryNaming,
		Recommended: true,
		Formats:     []openapi.Format{openapi.FormatOAS3},
	}

	r.Register(meta)

	got, ok := r.Get("test-rule")
	if !ok {
		t.Fatal("rule not found")
	}
	if got.ID != "test-rule" {
		t.Errorf("ID = %q", got.ID)
	}
	if got.Severity != ctypes.SeverityWarning {
		t.Errorf("Severity = %d", got.Severity)
	}
}

func TestRegistry_ByCategory(t *testing.T) {
	r := rules.NewRegistry()
	r.Register(rules.RuleMeta{ID: "a", Category: rules.CategoryNaming})
	r.Register(rules.RuleMeta{ID: "b", Category: rules.CategorySecurity})
	r.Register(rules.RuleMeta{ID: "c", Category: rules.CategoryNaming})

	naming := r.ByCategory(rules.CategoryNaming)
	if len(naming) != 2 {
		t.Errorf("len(naming) = %d, want 2", len(naming))
	}
}

func TestRegistry_Recommended(t *testing.T) {
	r := rules.NewRegistry()
	r.Register(rules.RuleMeta{ID: "a", Recommended: true})
	r.Register(rules.RuleMeta{ID: "b", Recommended: false})
	r.Register(rules.RuleMeta{ID: "c", Recommended: true})

	rec := r.Recommended()
	if len(rec) != 2 {
		t.Errorf("len(recommended) = %d, want 2", len(rec))
	}
}
