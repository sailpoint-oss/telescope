package bridge

import (
	"context"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	gtreesitter "github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/barrelman"
	barrelAnalyzers "github.com/sailpoint-oss/barrelman/analyzers"
	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestDiagnosticsSliceConverters_HandleNilAndEmpty(t *testing.T) {
	if got := DiagnosticsToProtocol(nil); got == nil || len(got) != 0 {
		t.Fatalf("expected empty protocol diagnostics, got %+v", got)
	}
	if got := DiagnosticsFromProtocol(nil); got != nil {
		t.Fatalf("expected nil barrelman diagnostics, got %+v", got)
	}
	if got := DiagnosticsToProtocol([]barrelman.Diagnostic{}); got == nil || len(got) != 0 {
		t.Fatalf("expected empty protocol diagnostics for empty input, got %+v", got)
	}
	if got := DiagnosticsFromProtocol([]protocol.Diagnostic{}); got != nil {
		t.Fatalf("expected nil barrelman diagnostics for empty input, got %+v", got)
	}
}

func TestDiagnosticsProtocolRoundTrip_PreservesFields(t *testing.T) {
	diag := barrelman.Diagnostic{
		Range: barrelman.Range{
			Start: barrelman.Position{Line: 1, Character: 2},
			End:   barrelman.Position{Line: 3, Character: 4},
		},
		Severity:        barrelman.SeverityWarning,
		Code:            "rule-id",
		CodeDescription: "https://example.com/rule",
		Source:          "barrelman",
		Message:         "problem found",
		Tags:            []barrelman.DiagnosticTag{barrelman.DiagnosticTagDeprecated},
		Related: []barrelman.RelatedInformation{{
			URI:     "file:///spec.yaml",
			Range:   barrelman.FileStartRange,
			Message: "related",
		}},
		Data: map[string]any{"key": "value"},
	}

	proto := DiagnosticToProtocol(diag)
	back := DiagnosticsFromProtocol([]protocol.Diagnostic{proto})
	if len(back) != 1 {
		t.Fatalf("expected one diagnostic, got %d", len(back))
	}
	got := back[0]
	if got.Code != diag.Code || got.Source != diag.Source || got.Message != diag.Message {
		t.Fatalf("round trip mismatch: %+v", got)
	}
	if got.Range != diag.Range {
		t.Fatalf("range mismatch: got %+v want %+v", got.Range, diag.Range)
	}
	if got.Severity != diag.Severity {
		t.Fatalf("severity mismatch: got %v want %v", got.Severity, diag.Severity)
	}
}

func TestWrapForGossip_RunsRuleAndConvertsDiagnostics(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`openapi: "3.1.0"
info:
  title: Example
  version: "1.0.0"
paths: {}
`))
	if idx == nil {
		t.Fatal("expected parsed index")
	}

	rule := barrelman.Rule{
		ID: "test-rule",
		Run: func(ctx *barrelman.AnalysisContext) []barrelman.Diagnostic {
			if ctx == nil || ctx.Index == nil {
				t.Fatal("expected analysis context with index")
			}
			return []barrelman.Diagnostic{{
				Code:     "test-rule",
				Source:   "bridge-test",
				Message:  "wrapped diagnostic",
				Severity: barrelman.SeverityWarning,
			}}
		},
	}

	analyzer := WrapForGossip(rule)
	if analyzer.Scope != gtreesitter.ScopeFile {
		t.Fatalf("unexpected analyzer scope: %v", analyzer.Scope)
	}
	diags := analyzer.Run(&gtreesitter.AnalysisContext{
		Context:  context.Background(),
		UserData: idx,
	})
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(diags))
	}
	if diags[0].Message != "wrapped diagnostic" || diags[0].Code != "test-rule" {
		t.Fatalf("unexpected wrapped diagnostic: %+v", diags[0])
	}
}

func TestWrapForGossip_SuppressesMalformedOAS3SchemaDiagnostics(t *testing.T) {
	rule := barrelman.Rule{
		ID: "oas3-schema",
		Run: func(ctx *barrelman.AnalysisContext) []barrelman.Diagnostic {
			return []barrelman.Diagnostic{
				{
					Code:    "oas3-schema",
					Source:  "barrelman",
					Message: "syntax error in document",
					Data: map[string]string{
						"category":  "syntax",
						"issueCode": "syntax.parse-error",
					},
				},
				{
					Code:    "oas3-schema",
					Source:  "barrelman",
					Message: "document root must be a YAML/JSON object",
					Data: map[string]string{
						"category":  "structural",
						"issueCode": "structural.root-not-mapping",
					},
				},
				{
					Code:    "oas3-schema",
					Source:  "barrelman",
					Message: "Info Object requires 'title'",
					Data: map[string]string{
						"category":  "structural",
						"issueCode": "structural.missing-info-title",
					},
				},
			}
		},
	}

	analyzer := WrapForGossip(rule)
	diags := analyzer.Run(&gtreesitter.AnalysisContext{
		Context: context.Background(),
	})
	if len(diags) != 1 {
		t.Fatalf("expected 1 surviving diagnostic, got %d (%+v)", len(diags), diags)
	}
	if diags[0].Message != "Info Object requires 'title'" {
		t.Fatalf("unexpected surviving diagnostic: %+v", diags[0])
	}
}

func TestStabilizeDiagnostics_CanonicalizesDuplicateOperationIDMessage(t *testing.T) {
	idx := navigator.ParseContent([]byte(`openapi: "3.1.0"
info:
  title: Duplicate IDs
  version: "1.0.0"
paths:
  /zebra:
    get:
      operationId: dup
      responses:
        "200":
          description: ok
  /alpha:
    get:
      operationId: dup
      responses:
        "200":
          description: ok
`), "file:///spec.yaml")
	if idx == nil || idx.Document == nil {
		t.Fatal("expected parsed index")
	}

	tests := []struct {
		name           string
		code           string
		message        string
		wantMessage    string
		wantRelatedMsg string
	}{
		{
			name:           "legacy",
			code:           duplicateOperationIDCodeLegacy,
			message:        "operationId 'dup' is already used at GET /zebra",
			wantMessage:    "operationId 'dup' is already used at GET /alpha",
			wantRelatedMsg: "First defined here at GET /alpha",
		},
		{
			name:           "guideline",
			code:           duplicateOperationIDCodeGuideline,
			message:        "[#122] operationId 'dup' is already used at GET /zebra",
			wantMessage:    "[#122] operationId 'dup' is already used at GET /alpha",
			wantRelatedMsg: "[#122] First defined here at GET /alpha",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			diags := []barrelman.Diagnostic{{
				Code:    tt.code,
				Message: tt.message,
			}}

			stable := stabilizeDiagnostics(idx, diags)
			if len(stable) != 1 {
				t.Fatalf("expected one diagnostic, got %d", len(stable))
			}
			if stable[0].Message != tt.wantMessage {
				t.Fatalf("unexpected stabilized message: %q", stable[0].Message)
			}
			if len(stable[0].Related) != 1 {
				t.Fatalf("expected related info, got %+v", stable[0].Related)
			}
			if stable[0].Related[0].Message != tt.wantRelatedMsg {
				t.Fatalf("unexpected related message: %q", stable[0].Related[0].Message)
			}
		})
	}
}

func TestContextFromGossip_UsesOpenAPIIndexFallback(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`openapi: "3.1.0"
info:
  title: Example
  version: "1.0.0"
paths:
  /pets:
    get:
      operationId: listPets
      responses:
        "200":
          description: ok
components:
  schemas:
    Pet:
      type: object
`))
	if idx == nil || idx.Document == nil {
		t.Fatal("expected parsed openapi index")
	}

	ctx := ContextFromGossip(&gtreesitter.AnalysisContext{
		Context:  context.Background(),
		UserData: idx,
	})
	if ctx == nil || ctx.Index == nil {
		t.Fatalf("expected navigator analysis context, got %+v", ctx)
	}
	if ctx.Index.Document == nil || ctx.Index.Document.Info == nil {
		t.Fatalf("expected document info to be preserved, got %+v", ctx.Index.Document)
	}
	if ctx.Index.Document.Info.Title != "Example" {
		t.Fatalf("title = %q, want Example", ctx.Index.Document.Info.Title)
	}
	if ctx.Index.Version == "" {
		t.Fatal("expected version to be preserved")
	}
}

func TestSP122ProtocolDiagnostics_IncludeGuidelineLinkAndRelatedInfo(t *testing.T) {
	barrelAnalyzers.RegisterAll(barrelman.DefaultRegistry)
	reg := barrelman.NewRegistry()
	barrelAnalyzers.RegisterAll(reg)

	var rule barrelman.Rule
	found := false
	for _, candidate := range reg.AllRules() {
		if candidate.ID == "sp-122" {
			rule = candidate
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected sp-122 rule to be registered")
	}

	idx := navigator.ParseContent([]byte(`openapi: "3.1.0"
info:
  title: Duplicate IDs
  version: "1.0.0"
paths:
  /zebra:
    get:
      operationId: dup
      responses:
        "200":
          description: ok
  /alpha:
    get:
      operationId: dup
      responses:
        "200":
          description: ok
`), "file:///spec.yaml")
	if idx == nil || idx.Document == nil {
		t.Fatal("expected parsed index")
	}

	diags := rule.Run(&barrelman.AnalysisContext{Index: idx, URI: "file:///spec.yaml"})
	diags = stabilizeDiagnostics(idx, diags)
	proto := DiagnosticsToProtocol(diags)
	if len(proto) == 0 {
		t.Fatal("expected protocol diagnostics")
	}
	var match *protocol.Diagnostic
	for i := range proto {
		if code, ok := proto[i].Code.(string); ok && code == "sp-122" {
			match = &proto[i]
			break
		}
	}
	if match == nil {
		t.Fatalf("expected sp-122 diagnostic, got %+v", proto)
	}
	if match.CodeDescription == nil || match.CodeDescription.Href != protocol.URI(barrelman.GuidelineDocURL("122")) {
		t.Fatalf("expected CodeDescription href %q, got %+v", barrelman.GuidelineDocURL("122"), match.CodeDescription)
	}
	if len(match.RelatedInformation) == 0 {
		t.Fatalf("expected related information, got %+v", match)
	}
}
