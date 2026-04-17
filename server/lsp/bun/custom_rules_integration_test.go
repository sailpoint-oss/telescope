package bun

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type loadRulesResponse struct {
	RuleCount int            `json:"ruleCount"`
	Errors    []RuleRunError `json:"errors"`
}

// integrationRule describes a rule and the fixture it's exercised against.
// The four integration tests in this file share a single Bun sidecar started
// in TestMain; loading every rule once up-front saves the O(seconds) sidecar
// startup cost that previously ran per-test (4x on a 3-5s cold-start is most
// of the 47s Windows CI time for this package).
type integrationRule struct {
	id              string
	rulePath        string // repo-relative
	kind            string
	documentPath    string // repo-relative, fixture exercised by this rule
	version         string // sent to the sidecar as the document OpenAPI version
}

var integrationRules = []integrationRule{
	{
		id:           "example-custom-openapi-rule",
		rulePath:     "test-files/.telescope/rules/example-custom-openapi-rule.ts",
		kind:         "openapi",
		documentPath: "test-files/openapi/test-missing-summary.yaml",
		version:      "3.0.0",
	},
	{
		id:           "require-operationid",
		rulePath:     "test-files/.telescope/rules/require-operationid.ts",
		kind:         "openapi",
		documentPath: "test-files/openapi/test-missing-operationid.yaml",
		version:      "3.0.0",
	},
	{
		id:           "path-trailing-slash",
		rulePath:     "test-files/.telescope/rules/path-trailing-slash.ts",
		kind:         "openapi",
		documentPath: "test-files/openapi/test-missing-summary.yaml",
		version:      "3.0.0",
	},
	{
		id:           "example-generic-rule",
		rulePath:     "test-files/.telescope/rules/example-generic-rule.ts",
		kind:         "generic",
		documentPath: "test-files/custom/custom-generic-invalid.yaml",
		version:      "",
	},
}

// sharedSidecar holds the process-wide sidecar Manager for integration tests
// in this package. It is lazily initialized by ensureSidecar (guarded by
// sidecarOnce) and torn down in TestMain so that a Manager.Start happens at
// most once per `go test` invocation instead of once per test.
type sharedSidecar struct {
	mgr      *Manager
	repoRoot string
	err      error
	skip     bool
	skipMsg  string
}

var (
	sidecarOnce     sync.Once
	sidecarInstance *sharedSidecar
)

func ensureSidecar(t *testing.T) *sharedSidecar {
	t.Helper()
	sidecarOnce.Do(func() {
		sidecarInstance = startSharedSidecar()
	})
	if sidecarInstance.skip {
		t.Skip(sidecarInstance.skipMsg)
	}
	if sidecarInstance.err != nil {
		t.Fatalf("shared sidecar setup: %v", sidecarInstance.err)
	}
	return sidecarInstance
}

func startSharedSidecar() *sharedSidecar {
	s := &sharedSidecar{}

	origWD, err := os.Getwd()
	if err != nil {
		s.err = err
		return s
	}
	repoRoot, err := filepath.Abs(filepath.Join(origWD, "..", "..", ".."))
	if err != nil {
		s.err = err
		return s
	}
	s.repoRoot = repoRoot
	if err := os.Chdir(filepath.Join(repoRoot, "server")); err != nil {
		s.err = err
		return s
	}
	// We intentionally do not restore the original working directory here —
	// TestMain restores it after the package tests finish, and leaving it set
	// lets each test hit the right relative paths without reasserting chdir.
	_ = origWD

	// t.Setenv requires a *testing.T, so use os.Setenv directly for the
	// process-wide sidecar. TestMain will unset it during teardown.
	_ = os.Setenv(
		"TELESCOPE_BUN_RUNNER_PATH",
		filepath.Join(repoRoot, "server", "lsp", "bun", "runner", "dist", "runner.js"),
	)

	mgr := NewManager(slog.Default())
	ctx := context.Background()
	if err := mgr.Start(ctx); err != nil {
		s.skip = true
		s.skipMsg = "bun sidecar unavailable: " + err.Error()
		return s
	}
	if !mgr.Available() {
		mgr.Stop()
		s.skip = true
		s.skipMsg = "bun sidecar unavailable: install Bun and build the bundled runner first"
		return s
	}

	loadReq := &LoadRulesRequest{
		WorkDir: repoRoot,
	}
	for _, r := range integrationRules {
		loadReq.Rules = append(loadReq.Rules, RuleConfig{
			ID:   r.id,
			Path: filepath.Join(repoRoot, filepath.FromSlash(r.rulePath)),
			Kind: r.kind,
		})
	}

	loadEnv := &Envelope{
		ID:      mgr.newRequestID(),
		Type:    MsgLoadRules,
		Payload: loadReq,
	}
	loadRespEnv, err := mgr.sendRequest(ctx, loadEnv, 15*time.Second)
	if err != nil {
		mgr.Stop()
		s.err = err
		return s
	}
	if loadRespEnv == nil {
		mgr.Stop()
		s.err = errSentinel("expected load rules response")
		return s
	}
	loadPayload, err := json.Marshal(loadRespEnv.Payload)
	if err != nil {
		mgr.Stop()
		s.err = err
		return s
	}
	var loadResp loadRulesResponse
	if err := json.Unmarshal(loadPayload, &loadResp); err != nil {
		mgr.Stop()
		s.err = err
		return s
	}
	if len(loadResp.Errors) != 0 {
		mgr.Stop()
		s.err = errSentinelf("expected no load errors, got %+v", loadResp.Errors)
		return s
	}
	if loadResp.RuleCount < len(integrationRules) {
		mgr.Stop()
		s.err = errSentinelf("expected %d loaded rules, got %d", len(integrationRules), loadResp.RuleCount)
		return s
	}

	s.mgr = mgr
	return s
}

// sidecarError is a stable error type for shared-setup failures so that
// individual tests can t.Fatalf with the underlying message without paying
// for extra wrapping during the one-time TestMain setup.
type sidecarError string

func (e sidecarError) Error() string { return string(e) }

func errSentinel(msg string) error { return sidecarError(msg) }
func errSentinelf(format string, args ...any) error {
	return sidecarError(fmt.Sprintf(format, args...))
}

// TestMain tears down the shared Bun sidecar after the package's tests run.
// ensureSidecar lazily starts it on first call; TestMain only needs to own
// cleanup so the sidecar process doesn't outlive `go test`.
func TestMain(m *testing.M) {
	code := m.Run()
	if sidecarInstance != nil && sidecarInstance.mgr != nil {
		sidecarInstance.mgr.Stop()
	}
	os.Unsetenv("TELESCOPE_BUN_RUNNER_PATH")
	os.Exit(code)
}

// runSharedRule executes one integration rule against its fixture using the
// process-wide sidecar Manager and returns the diagnostics.
func runSharedRule(t *testing.T, rule integrationRule) []SidecarDiagnostic {
	t.Helper()
	s := ensureSidecar(t)

	docPath := filepath.Join(s.repoRoot, filepath.FromSlash(rule.documentPath))
	raw, err := os.ReadFile(docPath)
	if err != nil {
		t.Fatalf("read document %q: %v", docPath, err)
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
		RuleIDs:     []string{rule.id},
		Document: SerializedDoc{
			URI:      uri,
			AST:      ast,
			RawText:  string(raw),
			Format:   format,
			Version:  rule.version,
			Pointers: pointers,
		},
		Project: SerializedProjectIndex{
			OperationIDs:  map[string][]string{},
			ComponentRefs: map[string][]string{},
			Tags:          map[string][]string{},
		},
	}

	ctx := context.Background()
	runResp, err := s.mgr.RunRules(ctx, runReq)
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
		t.Fatalf("expected diagnostics for rule %q", rule.id)
	}
	return runResp.Diagnostics
}

func requireDiagnostic(
	t *testing.T,
	diagnostics []SidecarDiagnostic,
	code string,
	messageSubstring string,
) {
	t.Helper()
	for _, diag := range diagnostics {
		if diag.Code == code &&
			strings.Contains(strings.ToLower(diag.Message), strings.ToLower(messageSubstring)) {
			return
		}
	}
	t.Fatalf("expected %s diagnostic, got %+v", code, diagnostics)
}

func TestCustomSummaryRuleRunsThroughSidecar(t *testing.T) {
	diagnostics := runSharedRule(t, integrationRules[0])
	requireDiagnostic(t, diagnostics, "custom-operation-summary", "summary")
}

func TestRequireOperationIDRuleRunsThroughSidecar(t *testing.T) {
	diagnostics := runSharedRule(t, integrationRules[1])
	requireDiagnostic(t, diagnostics, "custom-require-operationid", "operationid")
}

func TestPathTrailingSlashRuleRunsThroughSidecar(t *testing.T) {
	diagnostics := runSharedRule(t, integrationRules[2])
	requireDiagnostic(t, diagnostics, "custom-trailing-slash", "trailing slash")
}

func TestGenericVersionRuleRunsThroughSidecar(t *testing.T) {
	diagnostics := runSharedRule(t, integrationRules[3])
	requireDiagnostic(t, diagnostics, "custom-version-required", "version")
}
