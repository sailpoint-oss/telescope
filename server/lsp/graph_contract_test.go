package lsp

import (
	"log/slog"
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/barometer/pkg/barometer"
	"github.com/sailpoint-oss/telescope/server/config"
)

func TestGraphResolver_NilDependencies(t *testing.T) {
	var resolver *GraphResolver
	if resolver.CanResolve("file:///spec.yaml", "#/components/schemas/Pet") {
		t.Fatal("nil resolver should not resolve refs")
	}
	uri, value, err := resolver.Resolve("file:///spec.yaml", "#/components/schemas/Pet")
	if err != nil {
		t.Fatalf("nil resolver should not return error, got %v", err)
	}
	if uri != "" || value != nil {
		t.Fatalf("nil resolver returned unexpected data: %q %+v", uri, value)
	}
}

func TestGraphResolver_LocalRef(t *testing.T) {
	env := newCoverageEnv(t)
	bridge, err := NewGraphBridge(slog.Default())
	if err != nil {
		t.Fatalf("NewGraphBridge error: %v", err)
	}
	resolver := NewGraphResolver(bridge, env.cache)
	ref := "#/components/schemas/Pet"
	if !resolver.CanResolve(string(env.uri), ref) {
		t.Fatal("expected local ref to resolve")
	}
	uri, value, err := resolver.Resolve(string(env.uri), ref)
	if err != nil {
		t.Fatalf("Resolve error: %v", err)
	}
	if uri != env.uri {
		t.Fatalf("resolved uri = %q, want %q", uri, env.uri)
	}
	if value == nil {
		t.Fatal("expected resolved value")
	}
}

func TestContractDiagnosticsForOpenAPI_AddsAuthHintsAndRange(t *testing.T) {
	env := newCoverageEnv(t)
	idx := env.cache.Get(env.uri)
	result := &barometer.Result{
		OpenAPI: &barometer.OpenAPIResult{
			Results: []barometer.OpenAPIContractResult{{
				Path:        "/pets",
				Method:      "get",
				OperationID: "listPets",
				Pass:        false,
				Error:       "missing credential for security requirement",
			}},
		},
	}
	ct := &config.ContractTestsConfig{
		Credentials: map[string]config.CredentialSource{
			"bearerAuth": {AccessTokenEnv: "TELESCOPE_TOKEN"},
		},
	}

	diags := contractDiagnosticsForOpenAPI(idx, result, ct)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(diags))
	}
	diag := diags[0]
	if diag.Source != contractDiagSource || diag.Code != "contract.openapi" {
		t.Fatalf("unexpected contract diagnostic metadata: %+v", diag)
	}
	if !strings.Contains(diag.Message, "GET /pets") || !strings.Contains(diag.Message, "TELESCOPE_TOKEN") {
		t.Fatalf("expected path/method and env hint in message, got %q", diag.Message)
	}
	if diag.Range.Start.Line == 0 && diag.Range.End.Character <= 1 {
		t.Fatalf("expected operation-linked diagnostic range, got %+v", diag.Range)
	}
}

func TestContractDiagnosticsForOpenAPI_DefaultMessageAndFallbackRange(t *testing.T) {
	env := newCoverageEnv(t)
	idx := env.cache.Get(env.uri)
	result := &barometer.Result{
		OpenAPI: &barometer.OpenAPIResult{
			Results: []barometer.OpenAPIContractResult{{
				Path:   "/unknown",
				Method: "post",
				Pass:   false,
			}},
		},
	}

	diags := contractDiagnosticsForOpenAPI(idx, result, nil)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(diags))
	}
	if !strings.Contains(diags[0].Message, "contract test failed") {
		t.Fatalf("expected default message, got %q", diags[0].Message)
	}
	if diags[0].Range != (protocol.Range{
		Start: protocol.Position{Line: 0, Character: 0},
		End:   protocol.Position{Line: 0, Character: 1},
	}) {
		t.Fatalf("expected file-start fallback range, got %+v", diags[0].Range)
	}
}

func TestContractDiagnosticsForArazzo(t *testing.T) {
	result := &barometer.Result{
		Arazzo: &barometer.ArazzoResult{
			Workflows: []barometer.WorkflowResult{
				{WorkflowID: "wf-ok", Pass: true},
				{WorkflowID: "wf-fail", Pass: false},
				{WorkflowID: "wf-empty-error", Pass: false},
			},
		},
	}

	diags := contractDiagnosticsForArazzo("file:///workflow.yaml", result)
	if len(diags) != 2 {
		t.Fatalf("expected 2 failing workflow diagnostics, got %d", len(diags))
	}
	if diags[0].Code != "contract.arazzo" || diags[0].Source != contractDiagSource {
		t.Fatalf("unexpected arazzo diagnostic metadata: %+v", diags[0])
	}
	if !strings.Contains(diags[1].Message, "workflow step failed") {
		t.Fatalf("expected default workflow failure message, got %q", diags[1].Message)
	}
}

func TestContractCredentialHints(t *testing.T) {
	ct := &config.ContractTestsConfig{
		Credentials: map[string]config.CredentialSource{
			"oauth": {
				ClientIDEnv:     "CLIENT_ID",
				ClientSecretEnv: "CLIENT_SECRET",
			},
		},
	}
	hint := contractCredentialHints(ct)
	if !strings.Contains(hint, "oauth") || !strings.Contains(hint, "CLIENT_ID") {
		t.Fatalf("unexpected credential hint: %q", hint)
	}
}
