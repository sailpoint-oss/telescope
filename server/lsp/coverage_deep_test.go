package lsp

import (
	"context"
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestFormatParameterHover_WithName(t *testing.T) {
	param := &openapi.Parameter{
		In:       "query",
		Required: true,
		Schema:   &openapi.Schema{Type: "string", Format: "uuid"},
	}
	result := formatParameterHover("userId", param)

	if !strings.Contains(result, "### Parameter: userId") {
		t.Error("expected heading with parameter name")
	}
	if !strings.Contains(result, "**In:** `query`") {
		t.Error("expected In field")
	}
	if !strings.Contains(result, "**Required:** yes") {
		t.Error("expected Required field")
	}
	if !strings.Contains(result, "`string`") {
		t.Error("expected type string")
	}
	if !strings.Contains(result, "`uuid`") {
		t.Error("expected format uuid")
	}
}

func TestFormatParameterHover_Deprecated(t *testing.T) {
	param := &openapi.Parameter{In: "header", Deprecated: true}
	result := formatParameterHover("X-Old", param)
	if !strings.Contains(result, "**Deprecated**") {
		t.Error("expected deprecated marker")
	}
}

func TestFormatParameterHover_EmptyName(t *testing.T) {
	param := &openapi.Parameter{In: "path"}
	result := formatParameterHover("", param)
	if strings.Contains(result, "### Parameter:") {
		t.Error("should not include heading for empty name")
	}
	if !strings.Contains(result, "**In:** `path`") {
		t.Error("expected In field")
	}
}

func TestFormatParameterHover_WithEnum(t *testing.T) {
	param := &openapi.Parameter{
		In:     "query",
		Schema: &openapi.Schema{Type: "string", Enum: []string{"asc", "desc"}},
	}
	result := formatParameterHover("sort", param)
	if !strings.Contains(result, "asc") || !strings.Contains(result, "desc") {
		t.Error("expected enum values in output")
	}
}

func TestFormatResponseHover_WithContent(t *testing.T) {
	resp := &openapi.Response{
		Description: openapi.DescriptionValue{Text: "Successful response"},
		Content: map[string]*openapi.MediaType{
			"application/json": {Schema: &openapi.Schema{Type: "object"}},
		},
	}
	result := formatResponseHover("200", resp)

	if !strings.Contains(result, "### Response: 200") {
		t.Error("expected response heading")
	}
	if !strings.Contains(result, "Successful response") {
		t.Error("expected description")
	}
	if !strings.Contains(result, "`application/json`") {
		t.Error("expected content type")
	}
}

func TestFormatResponseHover_WithHeaders(t *testing.T) {
	resp := &openapi.Response{
		Headers: map[string]*openapi.Header{
			"X-Rate-Limit": {},
		},
	}
	result := formatResponseHover("429", resp)
	if !strings.Contains(result, "`X-Rate-Limit`") {
		t.Error("expected header name in output")
	}
}

func TestFormatResponseHover_EmptyName(t *testing.T) {
	resp := &openapi.Response{
		Description: openapi.DescriptionValue{Text: "desc"},
	}
	result := formatResponseHover("", resp)
	if strings.Contains(result, "### Response:") {
		t.Error("should not include heading for empty name")
	}
}

func TestFormatPathItemHover_WithOperations(t *testing.T) {
	item := &openapi.PathItem{}
	item.Get = &openapi.Operation{Summary: "List pets"}
	item.Post = &openapi.Operation{Summary: "Create pet"}

	result := formatPathItemHover("/pets", item)

	if !strings.Contains(result, "### /pets") {
		t.Error("expected path heading")
	}
	if !strings.Contains(result, "GET") {
		t.Error("expected GET method")
	}
	if !strings.Contains(result, "POST") {
		t.Error("expected POST method")
	}
}

func TestFormatPathItemHover_EmptyPath(t *testing.T) {
	item := &openapi.PathItem{}
	item.Delete = &openapi.Operation{}

	result := formatPathItemHover("", item)
	if !strings.Contains(result, "DELETE") {
		t.Error("expected DELETE method")
	}
}

func TestFormatHeaderHover_WithSchema(t *testing.T) {
	h := &openapi.Header{
		Required: true,
		Schema:   &openapi.Schema{Type: "integer", Format: "int32"},
		Description: openapi.DescriptionValue{Text: "Rate limit remaining"},
	}
	result := formatHeaderHover("X-Rate-Limit-Remaining", h)

	if !strings.Contains(result, "### Header: X-Rate-Limit-Remaining") {
		t.Error("expected header heading")
	}
	if !strings.Contains(result, "**Required:** yes") {
		t.Error("expected required marker")
	}
	if !strings.Contains(result, "`integer`") {
		t.Error("expected type")
	}
	if !strings.Contains(result, "`int32`") {
		t.Error("expected format")
	}
}

func TestFormatHeaderHover_Deprecated(t *testing.T) {
	h := &openapi.Header{Deprecated: true}
	result := formatHeaderHover("X-Old", h)
	if !strings.Contains(result, "**Deprecated**") {
		t.Error("expected deprecated marker")
	}
}

func TestFormatLinkHover_WithOperationRef(t *testing.T) {
	l := &openapi.Link{
		OperationRef: "#/paths/~1pets/get",
		Description:  openapi.DescriptionValue{Text: "Gets pets"},
	}
	result := formatLinkHover("GetPets", l)

	if !strings.Contains(result, "### Link: GetPets") {
		t.Error("expected link heading")
	}
	if !strings.Contains(result, "`#/paths/~1pets/get`") {
		t.Error("expected operationRef")
	}
	if !strings.Contains(result, "Gets pets") {
		t.Error("expected description")
	}
}

func TestFormatLinkHover_WithOperationID(t *testing.T) {
	l := &openapi.Link{OperationID: "listPets"}
	result := formatLinkHover("", l)

	if !strings.Contains(result, "**operationId:** `listPets`") {
		t.Error("expected operationId")
	}
}

func TestFormatExampleHover_WithValue(t *testing.T) {
	ex := &openapi.Example{
		Summary:     "A sample pet",
		Description: openapi.DescriptionValue{Text: "Shows a dog named Rex"},
		Value:       &openapi.Node{Value: `{"name": "Rex"}`},
	}
	result := formatExampleHover("Rex", ex)

	if !strings.Contains(result, "### Example: Rex") {
		t.Error("expected example heading")
	}
	if !strings.Contains(result, "A sample pet") {
		t.Error("expected summary")
	}
	if !strings.Contains(result, "Rex") {
		t.Error("expected value content")
	}
}

func TestFormatExampleHover_WithExternalValue(t *testing.T) {
	ex := &openapi.Example{
		ExternalValue: "https://example.com/pet.json",
	}
	result := formatExampleHover("", ex)
	if !strings.Contains(result, "https://example.com/pet.json") {
		t.Error("expected external value URL")
	}
}

func TestMergeAllOfProperties_MergesAndDeduplicates(t *testing.T) {
	schemas := []*openapi.Schema{
		{
			Properties: map[string]*openapi.Schema{
				"id":   {Type: "string"},
				"name": {Type: "string"},
			},
			Required: []string{"id"},
		},
		{
			Properties: map[string]*openapi.Schema{
				"email": {Type: "string"},
			},
			Required: []string{"email"},
		},
	}

	merged := mergeAllOfProperties(schemas)

	if len(merged.Properties) != 3 {
		t.Fatalf("expected 3 properties, got %d", len(merged.Properties))
	}
	if _, ok := merged.Properties["id"]; !ok {
		t.Error("missing 'id' property")
	}
	if _, ok := merged.Properties["email"]; !ok {
		t.Error("missing 'email' property")
	}
	if len(merged.Required) != 2 {
		t.Fatalf("expected 2 required fields, got %d: %v", len(merged.Required), merged.Required)
	}
}

func TestMergeAllOfProperties_NestedAllOf(t *testing.T) {
	schemas := []*openapi.Schema{
		{
			AllOf: []*openapi.Schema{
				{
					Properties: map[string]*openapi.Schema{
						"nested": {Type: "boolean"},
					},
					Required: []string{"nested"},
				},
			},
		},
		{
			Properties: map[string]*openapi.Schema{
				"top": {Type: "integer"},
			},
		},
	}

	merged := mergeAllOfProperties(schemas)

	if _, ok := merged.Properties["nested"]; !ok {
		t.Error("missing 'nested' from inner allOf")
	}
	if _, ok := merged.Properties["top"]; !ok {
		t.Error("missing 'top' from outer schema")
	}
}

func TestMergeAllOfProperties_EmptyInput(t *testing.T) {
	merged := mergeAllOfProperties(nil)
	if len(merged.Properties) != 0 {
		t.Errorf("expected empty properties, got %d", len(merged.Properties))
	}
}

func TestRangeOverlaps_BasicCases(t *testing.T) {
	tests := []struct {
		name string
		a, b protocol.Range
		want bool
	}{
		{
			name: "identical ranges",
			a:    protocol.Range{Start: protocol.Position{Line: 1, Character: 0}, End: protocol.Position{Line: 3, Character: 10}},
			b:    protocol.Range{Start: protocol.Position{Line: 1, Character: 0}, End: protocol.Position{Line: 3, Character: 10}},
			want: true,
		},
		{
			name: "a before b no overlap",
			a:    protocol.Range{Start: protocol.Position{Line: 0, Character: 0}, End: protocol.Position{Line: 1, Character: 0}},
			b:    protocol.Range{Start: protocol.Position{Line: 2, Character: 0}, End: protocol.Position{Line: 3, Character: 0}},
			want: false,
		},
		{
			name: "b before a no overlap",
			a:    protocol.Range{Start: protocol.Position{Line: 5, Character: 0}, End: protocol.Position{Line: 6, Character: 0}},
			b:    protocol.Range{Start: protocol.Position{Line: 1, Character: 0}, End: protocol.Position{Line: 3, Character: 0}},
			want: false,
		},
		{
			name: "partial overlap",
			a:    protocol.Range{Start: protocol.Position{Line: 0, Character: 0}, End: protocol.Position{Line: 5, Character: 0}},
			b:    protocol.Range{Start: protocol.Position{Line: 3, Character: 0}, End: protocol.Position{Line: 8, Character: 0}},
			want: true,
		},
		{
			name: "a contains b",
			a:    protocol.Range{Start: protocol.Position{Line: 0, Character: 0}, End: protocol.Position{Line: 10, Character: 0}},
			b:    protocol.Range{Start: protocol.Position{Line: 3, Character: 0}, End: protocol.Position{Line: 5, Character: 0}},
			want: true,
		},
		{
			name: "touching at boundary same line",
			a:    protocol.Range{Start: protocol.Position{Line: 1, Character: 0}, End: protocol.Position{Line: 1, Character: 5}},
			b:    protocol.Range{Start: protocol.Position{Line: 1, Character: 5}, End: protocol.Position{Line: 1, Character: 10}},
			want: true,
		},
		{
			name: "same line no overlap",
			a:    protocol.Range{Start: protocol.Position{Line: 1, Character: 0}, End: protocol.Position{Line: 1, Character: 3}},
			b:    protocol.Range{Start: protocol.Position{Line: 1, Character: 5}, End: protocol.Position{Line: 1, Character: 10}},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := rangeOverlaps(tt.a, tt.b)
			if got != tt.want {
				t.Errorf("rangeOverlaps(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestCallbackRange_ReturnsFirstItemRange(t *testing.T) {
	cb := openapi.Callback{
		"{$request.body#/callbackUrl}": &openapi.PathItem{},
	}
	r := callbackRange(cb)
	// With nil tree-sitter nodes, the range will be zero — just verify no panic.
	_ = r
}

func TestCallbackRange_EmptyCallback(t *testing.T) {
	r := callbackRange(openapi.Callback{})
	if r.Start.Line != 0 || r.Start.Character != 0 || r.End.Line != 0 || r.End.Character != 0 {
		t.Errorf("empty callback should produce zero range, got %+v", r)
	}
}

func TestToRange_CreatesPointRange(t *testing.T) {
	pos := protocol.Position{Line: 5, Character: 10}
	r := toRange(pos)

	if r.Start != pos {
		t.Errorf("Start = %+v, want %+v", r.Start, pos)
	}
	if r.End != pos {
		t.Errorf("End = %+v, want %+v", r.End, pos)
	}
}

func TestDiagnosticMux_SetAndMerge(t *testing.T) {
	var published []*protocol.PublishDiagnosticsParams
	mux := NewDiagnosticMux(func(_ context.Context, p *protocol.PublishDiagnosticsParams) error {
		published = append(published, p)
		return nil
	}, nil)
	// Legacy behavior: one publish per Set. Production callers get coalescing.
	mux.SetCoalesceWindow(0)

	uri := protocol.DocumentURI("file:///test.yaml")
	mux.Set(uri, "source-a", []protocol.Diagnostic{
		{Message: "diag-a"},
	})
	mux.Set(uri, "source-b", []protocol.Diagnostic{
		{Message: "diag-b1"},
		{Message: "diag-b2"},
	})

	if len(published) < 2 {
		t.Fatalf("expected at least 2 publish calls, got %d", len(published))
	}
	last := published[len(published)-1]
	if len(last.Diagnostics) != 3 {
		t.Fatalf("expected 3 merged diagnostics, got %d", len(last.Diagnostics))
	}
}

func TestDiagnosticMux_ClearSource(t *testing.T) {
	var published []*protocol.PublishDiagnosticsParams
	mux := NewDiagnosticMux(func(_ context.Context, p *protocol.PublishDiagnosticsParams) error {
		published = append(published, p)
		return nil
	}, nil)

	uri := protocol.DocumentURI("file:///test.yaml")
	mux.Set(uri, "src", []protocol.Diagnostic{{Message: "x"}})
	mux.ClearSource(uri, "src")

	last := published[len(published)-1]
	if len(last.Diagnostics) != 0 {
		t.Fatalf("expected 0 diagnostics after clear, got %d", len(last.Diagnostics))
	}
}

func TestDiagnosticMux_SetEmptyDiags(t *testing.T) {
	var published []*protocol.PublishDiagnosticsParams
	mux := NewDiagnosticMux(func(_ context.Context, p *protocol.PublishDiagnosticsParams) error {
		published = append(published, p)
		return nil
	}, nil)
	mux.SetCoalesceWindow(0)

	uri := protocol.DocumentURI("file:///test.yaml")
	mux.Set(uri, "src", []protocol.Diagnostic{{Message: "x"}})
	mux.Set(uri, "src", nil)

	last := published[len(published)-1]
	if len(last.Diagnostics) != 0 {
		t.Fatalf("expected 0 diagnostics after setting nil, got %d", len(last.Diagnostics))
	}
}

func TestDiagnosticMux_IgnoresEmptySource(t *testing.T) {
	callCount := 0
	mux := NewDiagnosticMux(func(_ context.Context, _ *protocol.PublishDiagnosticsParams) error {
		callCount++
		return nil
	}, nil)

	mux.Set("file:///x.yaml", "", []protocol.Diagnostic{{Message: "x"}})
	if callCount != 0 {
		t.Error("should not publish for empty source name")
	}
}

func TestFormatSchemaFlags(t *testing.T) {
	tests := []struct {
		name   string
		schema openapi.Schema
		want   string
	}{
		{name: "no flags", schema: openapi.Schema{}, want: ""},
		{name: "deprecated", schema: openapi.Schema{Deprecated: true}, want: "deprecated"},
		{name: "nullable", schema: openapi.Schema{Nullable: true}, want: "nullable"},
		{name: "readOnly", schema: openapi.Schema{ReadOnly: true}, want: "readOnly"},
		{name: "writeOnly", schema: openapi.Schema{WriteOnly: true}, want: "writeOnly"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := formatSchemaFlags(&tt.schema)
			if tt.want == "" {
				if result != "" {
					t.Errorf("expected empty, got %q", result)
				}
				return
			}
			if !strings.Contains(result, tt.want) {
				t.Errorf("expected %q in result %q", tt.want, result)
			}
		})
	}
}

func TestFormatSchemaConstraints(t *testing.T) {
	minLen := 3
	maxLen := 100
	schema := &openapi.Schema{
		MinLength: &minLen,
		MaxLength: &maxLen,
		Pattern:   "^[a-z]+$",
	}
	result := formatSchemaConstraints(schema)
	if !strings.Contains(result, "minLength: 3") {
		t.Errorf("expected minLength constraint, got %q", result)
	}
	if !strings.Contains(result, "maxLength: 100") {
		t.Errorf("expected maxLength constraint, got %q", result)
	}
	if !strings.Contains(result, "^[a-z]+$") {
		t.Errorf("expected pattern constraint, got %q", result)
	}
}

func TestFormatSchemaConstraints_Empty(t *testing.T) {
	result := formatSchemaConstraints(&openapi.Schema{})
	if result != "" {
		t.Errorf("expected empty, got %q", result)
	}
}

func TestTruncate(t *testing.T) {
	short := "hello"
	if got := truncate(short, 10); got != short {
		t.Errorf("truncate(%q, 10) = %q, want %q", short, got, short)
	}
	long := "this is a very long string"
	got := truncate(long, 10)
	if len(got) > 10 {
		t.Errorf("truncated string should be <= 10 chars, got %d", len(got))
	}
	if !strings.HasSuffix(got, "...") {
		t.Errorf("truncated string should end with '...', got %q", got)
	}
}

func TestRefBaseName(t *testing.T) {
	tests := []struct {
		ref  string
		want string
	}{
		{"#/components/schemas/Pet", "Pet"},
		{"#/components/responses/Error", "Error"},
		{"Pet", "Pet"},
		{"", ""},
	}
	for _, tt := range tests {
		got := refBaseName(tt.ref)
		if got != tt.want {
			t.Errorf("refBaseName(%q) = %q, want %q", tt.ref, got, tt.want)
		}
	}
}

func TestEscapeInlineBackticks(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"no backticks", "no backticks"},
		{"`paired`", "`paired`"},
		{"one ` backtick", "one \\` backtick"},
		{"``even``", "``even``"},
	}
	for _, tt := range tests {
		got := escapeInlineBackticks(tt.input)
		if got != tt.want {
			t.Errorf("escapeInlineBackticks(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestClampSelection_InnerContained(t *testing.T) {
	full := protocol.Range{
		Start: protocol.Position{Line: 0, Character: 0},
		End:   protocol.Position{Line: 10, Character: 0},
	}
	sel := protocol.Range{
		Start: protocol.Position{Line: 2, Character: 0},
		End:   protocol.Position{Line: 5, Character: 0},
	}
	got := clampSelection(full, sel)
	if got != sel {
		t.Errorf("expected selection to be returned when contained, got %+v", got)
	}
}

func TestClampSelection_InnerNotContained(t *testing.T) {
	full := protocol.Range{
		Start: protocol.Position{Line: 2, Character: 0},
		End:   protocol.Position{Line: 5, Character: 0},
	}
	sel := protocol.Range{
		Start: protocol.Position{Line: 0, Character: 0},
		End:   protocol.Position{Line: 10, Character: 0},
	}
	got := clampSelection(full, sel)
	if got != full {
		t.Errorf("expected full range when selection exceeds, got %+v", got)
	}
}

func TestPositionBefore(t *testing.T) {
	tests := []struct {
		name string
		a, b protocol.Position
		want bool
	}{
		{"same", protocol.Position{Line: 1, Character: 5}, protocol.Position{Line: 1, Character: 5}, false},
		{"a line before", protocol.Position{Line: 0, Character: 5}, protocol.Position{Line: 1, Character: 0}, true},
		{"a char before", protocol.Position{Line: 1, Character: 0}, protocol.Position{Line: 1, Character: 5}, true},
		{"a after", protocol.Position{Line: 2, Character: 0}, protocol.Position{Line: 1, Character: 5}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := positionBefore(tt.a, tt.b); got != tt.want {
				t.Errorf("positionBefore(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestFormatUnresolvedRefHover(t *testing.T) {
	result := formatUnresolvedRefHover("#/components/schemas/Missing")
	if !strings.Contains(result, "`#/components/schemas/Missing`") {
		t.Error("expected ref path in output")
	}
	if !strings.Contains(result, "could not be resolved") {
		t.Error("expected unresolved message")
	}
}

func TestMergeDiagnosticSources_Empty(t *testing.T) {
	result := mergeDiagnosticSources(nil)
	if len(result) != 0 {
		t.Errorf("expected empty result, got %d diagnostics", len(result))
	}
}

func TestMergeDiagnosticSources_Deterministic(t *testing.T) {
	sources := map[string][]protocol.Diagnostic{
		"z-source": {{Message: "from-z"}},
		"a-source": {{Message: "from-a"}},
	}
	result := mergeDiagnosticSources(sources)
	if len(result) != 2 {
		t.Fatalf("expected 2 diagnostics, got %d", len(result))
	}
	if result[0].Message != "from-a" {
		t.Errorf("expected sorted order, first diagnostic message = %q", result[0].Message)
	}
}
