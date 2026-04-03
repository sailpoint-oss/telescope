package bun

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type loadRulesResponse struct {
	RuleCount int            `json:"ruleCount"`
	Errors    []RuleRunError `json:"errors"`
}

func runRuleThroughSidecar(
	t *testing.T,
	ruleRelativePath string,
	ruleID string,
	kind string,
	docRelativePath string,
) []SidecarDiagnostic {
	t.Setenv("TELESCOPE_DEV", "1")

	origWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	repoRoot, err := filepath.Abs(filepath.Join(origWD, "..", "..", ".."))
	if err != nil {
		t.Fatalf("absolute repo root: %v", err)
	}
	if err := os.Chdir(filepath.Join(repoRoot, "server")); err != nil {
		t.Fatalf("chdir to server root: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(origWD)
	})

	mgr := NewManager(slog.Default())
	ctx := context.Background()
	if err := mgr.Start(ctx); err != nil {
		t.Skipf("bun sidecar unavailable: %v", err)
	}
	t.Cleanup(mgr.Stop)

	rulePath := filepath.Join(repoRoot, filepath.FromSlash(ruleRelativePath))
	docPath := filepath.Join(repoRoot, filepath.FromSlash(docRelativePath))

	loadReq := &LoadRulesRequest{
		Rules: []RuleConfig{{
			ID:   ruleID,
			Path: rulePath,
			Kind: kind,
		}},
		WorkDir: repoRoot,
	}

	loadEnv := &Envelope{
		ID:      mgr.newRequestID(),
		Type:    MsgLoadRules,
		Payload: loadReq,
	}
	loadRespEnv, err := mgr.sendRequest(ctx, loadEnv, 10*time.Second)
	if err != nil {
		t.Fatalf("load rules: %v", err)
	}
	if loadRespEnv == nil {
		t.Fatal("expected load rules response")
	}
	loadPayload, err := json.Marshal(loadRespEnv.Payload)
	if err != nil {
		t.Fatalf("marshal load payload: %v", err)
	}
	var loadResp loadRulesResponse
	if err := json.Unmarshal(loadPayload, &loadResp); err != nil {
		t.Fatalf("unmarshal load response: %v", err)
	}
	if len(loadResp.Errors) != 0 {
		t.Fatalf("expected no load errors, got %+v", loadResp.Errors)
	}
	if loadResp.RuleCount == 0 {
		t.Fatal("expected at least one loaded rule")
	}

	raw, err := os.ReadFile(docPath)
	if err != nil {
		t.Fatalf("read document: %v", err)
	}
	format := strings.TrimPrefix(strings.ToLower(filepath.Ext(docPath)), ".")
	if format == "yml" {
		format = "yaml"
	}
	ast, err := SerializeRawContent(raw, format)
	if err != nil {
		t.Fatalf("serialize raw content: %v", err)
	}
	uri := "file://" + filepath.ToSlash(docPath)
	pointers := PointersFromContent(string(raw), uri)
	runReq := &RunRulesRequest{
		DocumentURI: uri,
		RuleIDs:     []string{ruleID},
		Document: SerializedDoc{
			URI:      uri,
			AST:      ast,
			RawText:  string(raw),
			Format:   format,
			Version:  map[bool]string{true: "3.0.0", false: ""}[kind == "openapi"],
			Pointers: pointers,
		},
		Project: SerializedProjectIndex{
			OperationIDs:  map[string][]string{},
			ComponentRefs: map[string][]string{},
			Tags:          map[string][]string{},
		},
	}
	runResp, err := mgr.RunRules(ctx, runReq)
	if err != nil {
		t.Fatalf("run rules: %v", err)
	}
	if runResp == nil {
		t.Fatal("expected run rules response")
	}
	if len(runResp.Errors) != 0 {
		t.Fatalf("expected no run errors, got %+v", runResp.Errors)
	}
	if len(runResp.Diagnostics) == 0 {
		t.Fatalf("expected diagnostics for rule %q", ruleID)
	}
	return runResp.Diagnostics
}

func requireDiagnostic(
	t *testing.T,
	diagnostics []SidecarDiagnostic,
	code string,
	messageSubstring string,
) {
	found := false
	for _, diag := range diagnostics {
		if diag.Code == code &&
			strings.Contains(strings.ToLower(diag.Message), strings.ToLower(messageSubstring)) {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected %s diagnostic, got %+v", code, diagnostics)
	}
}

func TestCustomSummaryRuleRunsThroughSidecar(t *testing.T) {
	diagnostics := runRuleThroughSidecar(
		t,
		"test-files/.telescope/rules/example-custom-openapi-rule.ts",
		"example-custom-openapi-rule",
		"openapi",
		"test-files/openapi/test-missing-summary.yaml",
	)
	requireDiagnostic(t, diagnostics, "custom-operation-summary", "summary")
}

func TestRequireOperationIDRuleRunsThroughSidecar(t *testing.T) {
	diagnostics := runRuleThroughSidecar(
		t,
		"test-files/.telescope/rules/require-operationid.ts",
		"require-operationid",
		"openapi",
		"test-files/openapi/test-missing-operationid.yaml",
	)
	requireDiagnostic(t, diagnostics, "custom-require-operationid", "operationid")
}

func TestPathTrailingSlashRuleRunsThroughSidecar(t *testing.T) {
	diagnostics := runRuleThroughSidecar(
		t,
		"test-files/.telescope/rules/path-trailing-slash.ts",
		"path-trailing-slash",
		"openapi",
		"test-files/openapi/test-missing-summary.yaml",
	)
	requireDiagnostic(t, diagnostics, "custom-trailing-slash", "trailing slash")
}

func TestGenericVersionRuleRunsThroughSidecar(t *testing.T) {
	diagnostics := runRuleThroughSidecar(
		t,
		"test-files/.telescope/rules/example-generic-rule.ts",
		"example-generic-rule",
		"generic",
		"test-files/custom/custom-generic-invalid.yaml",
	)
	requireDiagnostic(t, diagnostics, "custom-version-required", "version")
}
