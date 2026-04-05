package openapi

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func contains(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func mustIndex(t *testing.T, spec string) *Index {
	t.Helper()
	idx := ParseAndIndex([]byte(spec))
	if idx == nil {
		t.Fatal("ParseAndIndex returned nil")
	}
	return idx
}

func TestIndexResolveAndHelperMethods(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Resolve API
  version: "1.0.0"
servers:
  - url: https://api.example.com
tags:
  - name: widgets
paths:
  /widgets:
    get:
      operationId: listWidgets
      responses:
        "200":
          $ref: "#/components/responses/Ok"
components:
  schemas:
    Widget:
      type: object
  responses:
    Ok:
      description: ok
  parameters:
    WidgetId:
      name: id
      in: path
      required: true
      schema:
        type: string
  examples:
    WidgetExample:
      value:
        id: "1"
  requestBodies:
    WidgetBody:
      required: true
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/Widget"
  headers:
    TraceId:
      schema:
        type: string
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
  links:
    WidgetLink:
      operationId: listWidgets
`
	idx := mustIndex(t, spec)

	if idx.DocumentKind() != DocumentKindOpenAPI {
		t.Fatalf("DocumentKind = %q, want openapi", idx.DocumentKind())
	}
	if !idx.IsRootDocument() || !idx.IsAPIDescription() {
		t.Fatal("expected openapi index to be a root API description")
	}
	if idx.NavigatorIndex() == nil {
		t.Fatal("expected navigator-backed index")
	}
	if idx.PrimaryValue() == nil {
		t.Fatal("expected primary value")
	}
	localIdx := *idx
	localIdx.nav = nil

	testCases := []struct {
		name string
		ref  string
		want interface{}
	}{
		{name: "schema", ref: "#/components/schemas/Widget", want: idx.Document.Components.Schemas["Widget"]},
		{name: "external local schema", ref: "./other.yaml#/components/schemas/Widget", want: idx.Document.Components.Schemas["Widget"]},
		{name: "response", ref: "#/components/responses/Ok", want: idx.Document.Components.Responses["Ok"]},
		{name: "parameter", ref: "#/components/parameters/WidgetId", want: idx.Document.Components.Parameters["WidgetId"]},
		{name: "example", ref: "#/components/examples/WidgetExample", want: idx.Document.Components.Examples["WidgetExample"]},
		{name: "request body", ref: "#/components/requestBodies/WidgetBody", want: idx.Document.Components.RequestBodies["WidgetBody"]},
		{name: "header", ref: "#/components/headers/TraceId", want: idx.Document.Components.Headers["TraceId"]},
		{name: "security scheme", ref: "#/components/securitySchemes/bearerAuth", want: idx.Document.Components.SecuritySchemes["bearerAuth"]},
		{name: "link", ref: "#/components/links/WidgetLink", want: idx.Document.Components.Links["WidgetLink"]},
		{name: "info", ref: "#/info", want: idx.Document.Info},
		{name: "path item", ref: "#/paths/~1widgets", want: idx.Document.Paths["/widgets"]},
		{name: "operation", ref: "#/paths/~1widgets/get", want: idx.Document.Paths["/widgets"].Get},
		{name: "server", ref: "#/servers/0", want: &idx.Document.Servers[0]},
		{name: "tag", ref: "#/tags/0", want: &idx.Document.Tags[0]},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := localIdx.Resolve(tc.ref)
			if err != nil {
				t.Fatalf("Resolve(%q) returned error: %v", tc.ref, err)
			}
			if got != tc.want {
				t.Fatalf("Resolve(%q) = %#v, want %#v", tc.ref, got, tc.want)
			}
		})
	}

	if got := idx.AllOperations(); len(got) != 1 || got[0].Operation.OperationID != "listWidgets" {
		t.Fatalf("unexpected AllOperations result: %+v", got)
	}
	if !contains(idx.SchemaNames(), "Widget") {
		t.Fatalf("expected Widget schema in %v", idx.SchemaNames())
	}
	for kind, want := range map[string]string{
		"responses":       "Ok",
		"parameters":      "WidgetId",
		"examples":        "WidgetExample",
		"requestBodies":   "WidgetBody",
		"headers":         "TraceId",
		"securitySchemes": "bearerAuth",
		"links":           "WidgetLink",
	} {
		if !contains(idx.ComponentNames(kind), want) {
			t.Fatalf("expected component %q in kind %q, got %v", want, kind, idx.ComponentNames(kind))
		}
	}
	if path := ComponentRefPath("schemas", "Widget/Name"); path != "#/components/schemas/Widget~1Name" {
		t.Fatalf("unexpected component ref path: %q", path)
	}
	if refs := idx.RefsTo("#/components/responses/Ok"); len(refs) != 1 {
		t.Fatalf("expected one response ref usage, got %+v", refs)
	}
	if localIdx.PrimaryValue() != localIdx.Document {
		t.Fatal("expected non-navigator primary value to be the document")
	}
	if localIdx.NavigatorIndex() != nil {
		t.Fatal("expected local resolver copy to hide navigator index")
	}
	if localIdx.DocumentKind() != DocumentKindOpenAPI {
		t.Fatalf("expected fallback document kind openapi, got %q", localIdx.DocumentKind())
	}
}

func TestResolveErrorsAndDocumentKindFallbacks(t *testing.T) {
	var nilIdx *Index
	if _, err := nilIdx.ResolveRef("#/components/schemas/Widget"); err == nil {
		t.Fatal("expected nil index resolve error")
	}
	if nilIdx.DocumentKind() != DocumentKindUnknown {
		t.Fatal("nil index should report unknown document kind")
	}
	if nilIdx.PrimaryValue() != nil {
		t.Fatal("nil index primary value should be nil")
	}

	noDoc := &Index{}
	if _, err := noDoc.ResolveRef("#/components/schemas/Widget"); err == nil {
		t.Fatal("expected missing document resolve error")
	}
	if noDoc.DocumentKind() != DocumentKindUnknown {
		t.Fatal("empty index should report unknown document kind")
	}
	if noDoc.IsRootDocument() || noDoc.IsAPIDescription() {
		t.Fatal("empty index should not report API description")
	}

	idx := mustIndex(t, `openapi: "3.1.0"
info:
  title: Errors API
  version: "1.0.0"
paths:
  /widgets:
    get:
      operationId: listWidgets
      responses:
        "200":
          description: ok
`)
	idx.nav = nil
	for _, ref := range []string{
		"components/schemas/Widget",
		"#/bad/segment",
		"#/paths/~1missing/get",
		"#/paths/~1widgets/post",
		"#/servers/abc",
		"#/servers/2",
	} {
		if _, err := idx.ResolveRef(ref); err == nil {
			t.Fatalf("expected ResolveRef(%q) to fail", ref)
		}
	}

	arazzo := mustIndex(t, `arazzo: 1.0.1
info:
  title: Workflow
  version: "1.0.0"
sourceDescriptions:
  - name: api
    url: ./openapi.yaml
    type: openapi
workflows:
  - workflowId: smoke
    steps: []
`)
	if !arazzo.IsRootDocument() || !arazzo.IsAPIDescription() {
		t.Fatal("expected arazzo index to report root API description")
	}
}

func TestIndexCacheHelpers(t *testing.T) {
	cache := NewIndexCache()
	rootURI := protocol.DocumentURI("file:///root.yaml")
	otherURI := protocol.DocumentURI("file:///other.yaml")
	root := mustIndex(t, `openapi: "3.1.0"
info:
  title: Cache API
  version: "1.0.0"
paths:
  /widgets:
    get:
      operationId: listWidgets
      responses:
        "200":
          description: ok
components:
  schemas:
    Widget:
      type: object
`)
	other := mustIndex(t, `openapi: "3.1.0"
info:
  title: Other API
  version: "1.0.0"
paths: {}
`)

	cache.Set(rootURI, root)
	cache.Set(otherURI, other)

	all := cache.All()
	if len(all) != 2 {
		t.Fatalf("expected 2 cached indexes, got %d", len(all))
	}
	delete(all, rootURI)
	if len(cache.All()) != 2 {
		t.Fatal("All should return a copy")
	}

	uri, ref := cache.FindByOperationID("listWidgets")
	if uri != rootURI || ref == nil || ref.Method != "get" {
		t.Fatalf("unexpected FindByOperationID result: %q %+v", uri, ref)
	}
	if uri, ref := cache.FindByOperationID("missing"); uri != "" || ref != nil {
		t.Fatalf("expected missing operationId lookup to be empty, got %q %+v", uri, ref)
	}

	refURI, value := cache.FindRefTarget("#/components/schemas/Widget")
	if refURI != rootURI || value == nil {
		t.Fatalf("unexpected FindRefTarget result: %q %#v", refURI, value)
	}
	if refURI, value := cache.FindRefTarget("#/components/schemas/Missing"); refURI != "" || value != nil {
		t.Fatalf("expected missing ref target lookup to be empty, got %q %#v", refURI, value)
	}
}
