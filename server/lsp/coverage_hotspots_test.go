package lsp

import (
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	coregraph "github.com/sailpoint-oss/telescope/server/core/graph"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func codeActionByTitle(actions []protocol.CodeAction, title string) *protocol.CodeAction {
	for i := range actions {
		if actions[i].Title == title {
			return &actions[i]
		}
	}
	return nil
}

func lensTitles(lenses []protocol.CodeLens) []string {
	titles := make([]string, 0, len(lenses))
	for _, lens := range lenses {
		if lens.Command != nil {
			titles = append(titles, lens.Command.Title)
		}
	}
	return titles
}

func completionLabels(items []protocol.CompletionItem) []string {
	labels := make([]string, 0, len(items))
	for _, item := range items {
		labels = append(labels, item.Label)
	}
	return labels
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func countHighlightKind(highlights []protocol.DocumentHighlight, kind int) int {
	count := 0
	for _, highlight := range highlights {
		if highlight.Kind == kind {
			count++
		}
	}
	return count
}

func lineIndex(lines []string, want string) int {
	for i, line := range lines {
		if line == want {
			return i
		}
	}
	return -1
}

func TestScaffoldingActions_ContextMatrix(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Scaffold API
  version: "1.0.0"
paths:
  /users:
    get:
      responses:
        "200":
          description: ok
  /widgets:
    get:
      parameters:
        - name: filter
          in: query
          schema:
            type: string
      responses:
        "200":
          description: ok
  /reports:
    post:
      responses:
        "201":
          description: created
`
	env := newCoverageEnvWithSpec(t, "file:///scaffold.yaml", spec)
	idx := env.cache.Get(env.uri)
	docLines := lineDoc(strings.Split(spec, "\n"))
	docLines[idx.Document.Paths["/users"].Operations()[0].Operation.Loc.Range.Start.Line] = "/users"
	docLines[idx.Document.Paths["/widgets"].Operations()[0].Operation.Loc.Range.Start.Line] = "/widgets"
	docLines[idx.Document.Paths["/reports"].Operations()[0].Operation.Loc.Range.Start.Line] = "/reports"

	testCases := []struct {
		name       string
		path       string
		wantTitles []string
		check      func(t *testing.T, actions []protocol.CodeAction)
	}{
		{
			name: "get without params adds pagination header",
			path: "/users",
			wantTitles: []string{
				"Add standard error responses (400, 401, 404, 500)",
				"Add pagination parameters (page, pageSize)",
				"Generate missing CRUD operations for /users",
			},
			check: func(t *testing.T, actions []protocol.CodeAction) {
				t.Helper()
				action := codeActionByTitle(actions, "Add pagination parameters (page, pageSize)")
				if action == nil || action.Edit == nil {
					t.Fatal("expected pagination action edit")
				}
				text := action.Edit.Changes[env.uri][0].NewText
				if !strings.Contains(text, "parameters:\n") {
					t.Fatalf("expected new parameters block, got %q", text)
				}
			},
		},
		{
			name: "get with existing params appends pagination entries",
			path: "/widgets",
			wantTitles: []string{
				"Add standard error responses (400, 401, 404, 500)",
				"Add pagination parameters (page, pageSize)",
				"Generate missing CRUD operations for /widgets",
			},
			check: func(t *testing.T, actions []protocol.CodeAction) {
				t.Helper()
				action := codeActionByTitle(actions, "Add pagination parameters (page, pageSize)")
				if action == nil || action.Edit == nil {
					t.Fatal("expected pagination action edit")
				}
				text := action.Edit.Changes[env.uri][0].NewText
				if strings.Contains(text, "parameters:\n") {
					t.Fatalf("expected appended list items only, got %q", text)
				}
				if !strings.Contains(text, "- name: page") {
					t.Fatalf("expected page parameter insertion, got %q", text)
				}
			},
		},
		{
			name: "post skips pagination but still offers CRUD",
			path: "/reports",
			wantTitles: []string{
				"Add standard error responses (400, 401, 404, 500)",
				"Generate missing CRUD operations for /reports",
			},
			check: func(t *testing.T, actions []protocol.CodeAction) {
				t.Helper()
				if action := codeActionByTitle(actions, "Add pagination parameters (page, pageSize)"); action != nil {
					t.Fatal("did not expect pagination action for non-GET operation")
				}
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			opRange := adapt.RangeToProtocol(idx.Document.Paths[tc.path].Operations()[0].Operation.Loc.Range)
			actions := scaffoldingActions(env.uri, idx, docLines, &protocol.CodeActionParams{
				Range: opRange,
			})
			for _, title := range tc.wantTitles {
				if codeActionByTitle(actions, title) == nil {
					t.Fatalf("missing scaffolding action %q in %+v", title, actions)
				}
			}
			tc.check(t, actions)
		})
	}
}

func TestCodeLensHandler_GraphBridgeBranches(t *testing.T) {
	rootURI := protocol.DocumentURI("file:///root.yaml")
	fragmentURI := protocol.DocumentURI("file:///components.yaml")
	consumerURI := protocol.DocumentURI("file:///consumer.yaml")
	rootSpec := `openapi: "3.1.0"
info:
  title: Root API
  version: "1.0.0"
paths:
  /pets:
    get:
      summary: List pets
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      security:
        - bearerAuth: []
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "./components.yaml#/components/schemas/Pet"
components:
  schemas:
    Pet:
      type: object
      required:
        - id
        - name
      properties:
        id:
          type: string
        name:
          type: string
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
`
	fragmentSpec := `components:
  schemas:
    SharedPet:
      type: object
`
	consumerSpec := `openapi: "3.1.0"
info:
  title: Consumer API
  version: "1.0.0"
paths:
  /consumer:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "./root.yaml#/components/schemas/Pet"
`
	cache := openapi.NewIndexCache()
	rootIdx := openapi.ParseAndIndex([]byte(rootSpec))
	fragmentIdx := openapi.ParseAndIndex([]byte(fragmentSpec))
	consumerIdx := openapi.ParseAndIndex([]byte(consumerSpec))
	cache.Set(rootURI, rootIdx)
	cache.Set(fragmentURI, fragmentIdx)
	cache.Set(consumerURI, consumerIdx)
	bridge := &GraphBridge{graph: coregraph.NewWorkspaceGraph()}
	bridge.Graph().AddEdge(coregraph.Edge{
		SourceURI:     string(rootURI),
		TargetURI:     string(fragmentURI),
		RefValue:      "./components.yaml#/components/schemas/Pet",
		TargetPointer: "/components/schemas/Pet",
	})
	bridge.Graph().AddEdge(coregraph.Edge{
		SourceURI:     string(consumerURI),
		TargetURI:     string(rootURI),
		RefValue:      "./root.yaml#/components/schemas/Pet",
		TargetPointer: "/components/schemas/Pet",
	})
	handler := NewCodeLensHandler(cache, bridge)

	rootLenses, err := handler(nil, &protocol.CodeLensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: rootURI},
	})
	if err != nil {
		t.Fatalf("root code lens error: %v", err)
	}
	rootTitles := lensTitles(rootLenses)
	for _, title := range []string{
		"Bundle: 2 files",
		"GET List pets",
		"responses: 200",
		"params: query: limit",
		"security: bearerAuth",
		"1 references",
	} {
		if !containsString(rootTitles, title) {
			t.Fatalf("missing root code lens %q in %v", title, rootTitles)
		}
	}
}

func TestCompletionHandler_ContextMatrix(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Completion API
  version: "1.0.0"
tags:
  - name: widgets
components:
  securitySchemes:
    oauth2:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: https://example.com/token
          scopes:
            read:widgets: Read widgets
paths:
  /widgets:
    
    get:
      tags:
        - widgets
      security:
        - oauth2: [read:widgets]
      responses:
        '200':
          description: ok
`
	env := newCoverageEnvWithSpec(t, "file:///completion.yaml", spec)
	handler := NewCompletionHandler(env.cache, nil)
	lines := strings.Split(spec, "\n")
	pathLine := lineIndex(lines, "  /widgets:")
	if pathLine < 0 {
		t.Fatal("expected /widgets path line")
	}

	testCases := []struct {
		name      string
		line      uint32
		character uint32
		wantLabel string
	}{
		{name: "security schemes", line: uint32(lineIndex(lines, "      security:")), wantLabel: "oauth2"},
		{name: "security scopes", line: uint32(lineIndex(lines, "        - oauth2: [read:widgets]")), wantLabel: "read:widgets"},
		{name: "tags", line: uint32(lineIndex(lines, "      tags:")), wantLabel: "widgets"},
		{name: "path templates", line: uint32(pathLine), wantLabel: "/widgets/{id}"},
		{name: "operation templates", line: uint32(pathLine + 1), wantLabel: "get"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			list, err := handler(env.ctx, &protocol.CompletionParams{
				TextDocumentPositionParams: protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
					Position: protocol.Position{
						Line:      tc.line,
						Character: tc.character,
					},
				},
			})
			if err != nil {
				t.Fatalf("completion error: %v", err)
			}
			if list == nil {
				t.Fatal("expected completion list")
			}
			if !containsString(completionLabels(list.Items), tc.wantLabel) {
				t.Fatalf("expected completion label %q, got %v", tc.wantLabel, completionLabels(list.Items))
			}
		})
	}
}

func TestReferencesHandler_OperationAndTagIncludeDeclaration(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Reference API
  version: "1.0.0"
tags:
  - name: widgets
paths:
  /widgets:
    get:
      operationId: listWidgets
      tags:
        - widgets
      responses:
        "200":
          description: ok
  /widget-links:
    get:
      operationId: getWidgetLinks
      tags:
        - widgets
      responses:
        "200":
          description: ok
          links:
            next:
              operationId: listWidgets
`
	env := newCoverageEnvWithSpec(t, "file:///references.yaml", spec)
	handler := NewReferencesHandler(env.cache, nil)

	testCases := []struct {
		name               string
		position           protocol.Position
		includeDeclaration bool
		wantCount          int
	}{
		{
			name:               "operationId without declaration",
			position:           protocol.Position{Line: 9, Character: 20},
			includeDeclaration: false,
			wantCount:          1,
		},
		{
			name:               "operationId with declaration",
			position:           protocol.Position{Line: 9, Character: 20},
			includeDeclaration: true,
			wantCount:          2,
		},
		{
			name:               "tag without declaration",
			position:           protocol.Position{Line: 5, Character: 10},
			includeDeclaration: false,
			wantCount:          2,
		},
		{
			name:               "tag with declaration",
			position:           protocol.Position{Line: 5, Character: 10},
			includeDeclaration: true,
			wantCount:          3,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			refs, err := handler(env.ctx, &protocol.ReferenceParams{
				TextDocumentPositionParams: protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
					Position:     tc.position,
				},
				Context: protocol.ReferenceContext{IncludeDeclaration: tc.includeDeclaration},
			})
			if err != nil {
				t.Fatalf("references error: %v", err)
			}
			if len(refs) != tc.wantCount {
				t.Fatalf("expected %d references, got %d: %+v", tc.wantCount, len(refs), refs)
			}
		})
	}
}

func TestReferencesHandler_GraphBackedRefLookup(t *testing.T) {
	rootSpec := `openapi: "3.1.0"
info:
  title: Root API
  version: "1.0.0"
paths:
  /pets:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "./components.yaml#/components/schemas/Pet"
`
	componentSpec := `openapi: "3.1.0"
info:
  title: Components
  version: "1.0.0"
components:
  schemas:
    Pet:
      type: object
`
	rootURI := protocol.DocumentURI("file:///root.yaml")
	componentURI := protocol.DocumentURI("file:///components.yaml")
	env := newCoverageEnvWithSpec(t, rootURI, rootSpec)
	env.addDoc(t, componentURI, componentSpec)
	bridge := &GraphBridge{graph: coregraph.NewWorkspaceGraph()}
	bridge.Graph().AddEdge(coregraph.Edge{
		SourceURI:     string(rootURI),
		TargetURI:     string(componentURI),
		RefValue:      "./components.yaml#/components/schemas/Pet",
		TargetPointer: "/components/schemas/Pet",
	})

	handler := NewReferencesHandler(env.cache, bridge)
	refs, err := handler(env.ctx, &protocol.ReferenceParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: rootURI},
			Position:     protocol.Position{Line: 13, Character: 24},
		},
		Context: protocol.ReferenceContext{IncludeDeclaration: false},
	})
	if err != nil {
		t.Fatalf("graph-backed references error: %v", err)
	}
	if len(refs) != 1 || refs[0].URI != rootURI {
		t.Fatalf("expected one graph-backed root ref, got %+v", refs)
	}
}

func TestDocumentHighlightHandler_SecurityScheme(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Highlight API
  version: "1.0.0"
security:
  - bearerAuth: []
paths:
  /users:
    get:
      security:
        - bearerAuth: []
      responses:
        "200":
          description: ok
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
`
	env := newCoverageEnvWithSpec(t, "file:///highlight-security.yaml", spec)
	env.cache.Get(env.uri).Document.Components.SecuritySchemes = nil
	handler := NewDocumentHighlightHandler(env.cache, nil)
	line := lineIndex(strings.Split(spec, "\n"), "  - bearerAuth: []")
	if line < 0 {
		t.Fatal("expected security usage line")
	}

	highlights, err := handler(env.ctx, &protocol.DocumentHighlightParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: uint32(line), Character: 7},
		},
	})
	if err != nil {
		t.Fatalf("document highlights error: %v", err)
	}
	if len(highlights) < 3 {
		t.Fatalf("expected definition and security usages, got %+v", highlights)
	}
	if countHighlightKind(highlights, highlightWrite) != 1 {
		t.Fatalf("expected one write highlight, got %+v", highlights)
	}
	if countHighlightKind(highlights, highlightRead) < 2 {
		t.Fatalf("expected read highlights for both security usages, got %+v", highlights)
	}
}

func TestCallHierarchyHandlers_MapData(t *testing.T) {
	env := newCoverageEnv(t)
	incoming := NewCallHierarchyIncomingHandler(env.cache, nil)
	incomingCalls, err := incoming(env.ctx, &protocol.CallHierarchyIncomingCallsParams{
		Item: protocol.CallHierarchyItem{
			Data: map[string]interface{}{
				"uri":     string(env.uri),
				"refPath": "#/components/schemas/Pet",
			},
		},
	})
	if err != nil {
		t.Fatalf("incoming call hierarchy error: %v", err)
	}
	if len(incomingCalls) != 1 || incomingCalls[0].From.Name != "GET" {
		t.Fatalf("expected GET incoming call, got %+v", incomingCalls)
	}

	outgoing := NewCallHierarchyOutgoingHandler(env.cache, nil)
	outgoingCalls, err := outgoing(env.ctx, &protocol.CallHierarchyOutgoingCallsParams{
		Item: protocol.CallHierarchyItem{
			URI: env.uri,
			Range: protocol.Range{
				Start: protocol.Position{Line: 6, Character: 0},
				End:   protocol.Position{Line: 15, Character: 80},
			},
			Data: map[string]interface{}{
				"uri": string(env.uri),
			},
		},
	})
	if err != nil {
		t.Fatalf("outgoing call hierarchy error: %v", err)
	}
	if len(outgoingCalls) != 1 || outgoingCalls[0].To.Name != "Pet" {
		t.Fatalf("expected Pet outgoing call, got %+v", outgoingCalls)
	}
}
