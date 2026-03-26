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

func TestCustomSummaryRuleRunsThroughSidecar(t *testing.T) {
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

	rulePath := filepath.Join(repoRoot, "test-files", ".telescope", "rules", "example-custom-openapi-rule.ts")
	docPath := filepath.Join(repoRoot, "test-files", "openapi", "test-missing-summary.yaml")

	loadReq := &LoadRulesRequest{
		Rules: []RuleConfig{{
			ID:   "example-custom-openapi-rule",
			Path: rulePath,
			Kind: "openapi",
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
	ast, err := SerializeRawContent(raw, "yaml")
	if err != nil {
		t.Fatalf("serialize raw content: %v", err)
	}
	uri := "file://" + filepath.ToSlash(docPath)
	pointers := PointersFromContent(string(raw), uri)
	if _, ok := pointers["/paths/~1users/get"]; !ok {
		t.Fatalf("expected operation pointer in serialized content, got %v pointers", len(pointers))
	}
	runReq := &RunRulesRequest{
		DocumentURI: uri,
		RuleIDs:     []string{"example-custom-openapi-rule"},
		Document: SerializedDoc{
			URI:     uri,
			AST:     ast,
			RawText: string(raw),
			Format:  "yaml",
			Version: "3.0.0",
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
		t.Fatal("expected custom summary diagnostics")
	}
	found := false
	for _, diag := range runResp.Diagnostics {
		if diag.Code == "custom-operation-summary" &&
			strings.Contains(strings.ToLower(diag.Message), "summary") {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected custom-operation-summary diagnostic, got %+v", runResp.Diagnostics)
	}
}
