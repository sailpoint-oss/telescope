package bridge

import (
	"context"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	gtreesitter "github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/barrelman"
	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

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

	diags := []barrelman.Diagnostic{{
		Code:    duplicateOperationIDCode,
		Message: "operationId 'dup' is already used at GET /zebra",
		Related: []barrelman.RelatedInformation{{
			URI:   "file:///spec.yaml",
			Range: barrelman.FileStartRange,
		}},
	}}

	stable := stabilizeDiagnostics(idx, diags)
	if len(stable) != 1 {
		t.Fatalf("expected one diagnostic, got %d", len(stable))
	}
	if stable[0].Message != "operationId 'dup' is already used at GET /alpha" {
		t.Fatalf("unexpected stabilized message: %q", stable[0].Message)
	}
	if len(stable[0].Related) != 1 {
		t.Fatalf("expected related info, got %+v", stable[0].Related)
	}
	if stable[0].Related[0].Message != "First defined here at GET /alpha" {
		t.Fatalf("unexpected related message: %q", stable[0].Related[0].Message)
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
