package lsp

import (
	"path/filepath"
	"testing"

	"github.com/sailpoint-oss/telescope/server/config"
)

func TestBuildLoadRulesRequest_ExcludesSchemaFiles(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.OpenAPI.Rules = []config.RuleRef{
		{Rule: "example-openapi-rule.ts"},
	}
	cfg.AdditionalValidation = map[string]config.ValidationGroup{
		"zod-group": {
			Patterns: []string{"custom/**/*.yaml"},
			Rules: []config.RuleRef{
				{Rule: "example-generic-rule.ts"},
			},
			Schemas: []config.SchemaPatternMapping{
				{Schema: "example-zod-schema.ts"},
				{Schema: "example-json-schema.json"},
			},
		},
	}

	req := buildLoadRulesRequest(cfg, "/tmp/work/.telescope")
	if req == nil {
		t.Fatal("expected non-nil load rules request")
	}

	if len(req.Rules) != 2 {
		t.Fatalf("expected 2 rule configs (openapi + generic), got %d", len(req.Rules))
	}

	for _, rule := range req.Rules {
		if rule.Kind == "schema" {
			t.Fatalf("unexpected schema kind in load request: %+v", rule)
		}
		if filepath.Ext(rule.Path) == ".json" {
			t.Fatalf("unexpected json schema path in load request: %+v", rule)
		}
	}
}
