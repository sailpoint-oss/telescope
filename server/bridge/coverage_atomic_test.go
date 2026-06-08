package bridge

import (
	"context"
	"testing"

	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestDiagnosticDataString(t *testing.T) {
	tests := []struct {
		name string
		data any
		key  string
		want string
	}{
		{
			name: "nil data",
			data: nil,
			key:  "ruleId",
			want: "",
		},
		{
			name: "map[string]string hit",
			data: map[string]string{"ruleId": "oas3-schema", "other": "val"},
			key:  "ruleId",
			want: "oas3-schema",
		},
		{
			name: "map[string]string miss",
			data: map[string]string{"other": "val"},
			key:  "ruleId",
			want: "",
		},
		{
			name: "map[string]any hit string value",
			data: map[string]any{"category": "syntax"},
			key:  "category",
			want: "syntax",
		},
		{
			name: "map[string]any hit int value",
			data: map[string]any{"code": 42},
			key:  "code",
			want: "42",
		},
		{
			name: "map[string]any miss",
			data: map[string]any{"other": true},
			key:  "ruleId",
			want: "",
		},
		{
			name: "unexpected type string",
			data: "just a string",
			key:  "ruleId",
			want: "",
		},
		{
			name: "unexpected type int",
			data: 123,
			key:  "anything",
			want: "",
		},
		{
			name: "unexpected type slice",
			data: []string{"a", "b"},
			key:  "0",
			want: "",
		},
		{
			name: "map[string]any with issueCode key",
			data: map[string]any{"issueCode": "structural.root-not-mapping"},
			key:  "issueCode",
			want: "structural.root-not-mapping",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := diagnosticDataString(tt.data, tt.key)
			if got != tt.want {
				t.Errorf("diagnosticDataString(%v, %q) = %q, want %q", tt.data, tt.key, got, tt.want)
			}
		})
	}
}

func TestContextFromGossip_NilUserData(t *testing.T) {
	gctx := &treesitter.AnalysisContext{
		Context: context.Background(),
	}
	bctx := ContextFromGossip(gctx)
	if bctx == nil {
		t.Fatal("expected non-nil context")
	}
	if bctx.URI != "" {
		t.Errorf("URI = %q, want empty", bctx.URI)
	}
	if bctx.Index != nil {
		t.Error("Index should be nil for nil UserData")
	}
	if bctx.Tree != nil {
		t.Error("Tree should be nil when gctx.Tree is nil")
	}
	if bctx.Content != nil {
		t.Error("Content should be nil when gctx.Tree is nil")
	}
}

func TestContextFromGossip_AnalysisData(t *testing.T) {
	data := &AnalysisData{
		DocURI:        "file:///spec.yaml",
		TargetVersion: "3.1",
	}
	gctx := &treesitter.AnalysisContext{
		Context:  context.Background(),
		UserData: data,
	}

	bctx := ContextFromGossip(gctx)
	if bctx.URI != "file:///spec.yaml" {
		t.Errorf("URI = %q, want file:///spec.yaml", bctx.URI)
	}
	if bctx.TargetVersion != "3.1" {
		t.Errorf("TargetVersion = %q, want 3.1", bctx.TargetVersion)
	}
}

func TestContextFromGossip_AnalysisDataWithIndex(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`openapi: "3.1.0"
info:
  title: T
  version: "1"`))
	data := &AnalysisData{
		DocURI: "file:///api.yaml",
		Index:  idx,
	}
	gctx := &treesitter.AnalysisContext{
		Context:  context.Background(),
		UserData: data,
	}

	bctx := ContextFromGossip(gctx)
	if bctx.Index == nil {
		t.Fatal("expected non-nil Index when AnalysisData has Index and Tree is nil")
	}
}

func TestContextFromGossip_RawOpenAPIIndex(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`openapi: "3.0.3"
info:
  title: T
  version: "1"
paths: {}`))
	gctx := &treesitter.AnalysisContext{
		Context:  context.Background(),
		UserData: idx,
	}

	bctx := ContextFromGossip(gctx)
	if bctx.Index == nil {
		t.Fatal("expected non-nil Index for raw openapi.Index UserData")
	}
}

func TestContextFromGossip_UnrelatedUserData(t *testing.T) {
	gctx := &treesitter.AnalysisContext{
		Context:  context.Background(),
		UserData: "just-a-string",
	}

	bctx := ContextFromGossip(gctx)
	if bctx.URI != "" {
		t.Errorf("URI = %q, want empty for unrelated UserData", bctx.URI)
	}
	if bctx.Index != nil {
		t.Error("Index should be nil for unrelated UserData type")
	}
}

func TestDuplicateOperationIDFromMessage(t *testing.T) {
	msg := "operationId 'listUsers' is already used at GET /users"
	opID, prefix, ok := duplicateOperationIDFromMessage(msg)
	if !ok {
		t.Fatal("expected match")
	}
	if opID != "listUsers" {
		t.Errorf("opID = %q, want listUsers", opID)
	}
	if prefix != duplicateOperationIDPrefix {
		t.Errorf("prefix = %q", prefix)
	}
	if _, _, ok := duplicateOperationIDFromMessage("unrelated"); ok {
		t.Error("expected no match for unrelated message")
	}
	if _, _, ok := duplicateOperationIDFromMessage("operationId '' is already used at "); ok {
		t.Error("expected no match for empty operation id")
	}
}

func TestDuplicateOperationIDRelatedMessage(t *testing.T) {
	if got := duplicateOperationIDRelatedMessage(duplicateOperationIDPrefix); got != duplicateOperationIDRelated {
		t.Errorf("got %q, want %q", got, duplicateOperationIDRelated)
	}
}

func TestShouldSuppressMalformedIndex(t *testing.T) {
	tests := []struct {
		name     string
		userData any
		want     bool
	}{
		{"nil userData", nil, false},
		{"wrong type", "string", false},
		{"nil AnalysisData pointer", (*AnalysisData)(nil), false},
		{"suppress false", &AnalysisData{SuppressMalformedDiagnostics: false}, false},
		{"suppress true nil index", &AnalysisData{SuppressMalformedDiagnostics: true, Index: nil}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldSuppressMalformedIndex(tt.userData); got != tt.want {
				t.Errorf("shouldSuppressMalformedIndex() = %v, want %v", got, tt.want)
			}
		})
	}
}
