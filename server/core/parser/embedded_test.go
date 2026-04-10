package parser

import (
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

func vpos(line, char uint32) ctypes.Position {
	return ctypes.Position{Line: line, Character: char}
}

func vrng(startLine, startChar, endLine, endChar uint32) ctypes.Range {
	return ctypes.Range{
		Start: vpos(startLine, startChar),
		End:   vpos(endLine, endChar),
	}
}

func TestMarkdownProvider_Extract(t *testing.T) {
	root := &SemanticNode{
		Kind:  NodeMapping,
		Range: vrng(0, 0, 10, 0),
		Children: map[string]*SemanticNode{
			"info": {
				Kind:  NodeMapping,
				Range: vrng(1, 0, 5, 0),
				Children: map[string]*SemanticNode{
					"description": {
						Kind:     NodeScalar,
						Value:    "API overview with **markdown**",
						Range:    vrng(2, 2, 2, 30),
						Key:      "description",
						Children: nil,
					},
				},
			},
			"paths": {
				Kind:  NodeMapping,
				Range: vrng(6, 0, 10, 0),
				Children: map[string]*SemanticNode{
					"/users": {
						Kind:  NodeMapping,
						Range: vrng(7, 0, 10, 0),
						Children: map[string]*SemanticNode{
							"get": {
								Kind:  NodeMapping,
								Range: vrng(8, 0, 10, 0),
								Children: map[string]*SemanticNode{
									"description": {
										Kind:     NodeScalar,
										Value:    "List users\n\nReturns all users.",
										Range:    vrng(9, 4, 10, 20),
										Key:      "description",
										Children: nil,
									},
								},
							},
						},
					},
				},
			},
		},
	}

	provider := &MarkdownProvider{}
	docs := provider.Extract(root, "file:///spec.yaml")

	if len(docs) != 2 {
		t.Fatalf("Extract returned %d docs, want 2", len(docs))
	}

	// First: /info/description (flow scalar)
	d0 := docs[0]
	if d0.URI != "vdoc:file:///spec.yaml#/info/description" {
		t.Errorf("doc[0].URI = %q, want vdoc:file:///spec.yaml#/info/description", d0.URI)
	}
	if d0.Content != "API overview with **markdown**" {
		t.Errorf("doc[0].Content = %q", d0.Content)
	}
	if _, ok := d0.Mapper.(*IdentityMapper); !ok {
		t.Errorf("doc[0] should use IdentityMapper for flow scalar")
	}

	// Second: /paths/~1users/get/description (block scalar - multi-line)
	d1 := docs[1]
	if d1.URI != "vdoc:file:///spec.yaml#/paths/~1users/get/description" {
		t.Errorf("doc[1].URI = %q", d1.URI)
	}
	if d1.Content != "List users\n\nReturns all users." {
		t.Errorf("doc[1].Content = %q", d1.Content)
	}
	if _, ok := d1.Mapper.(*LiteralBlockMapper); !ok {
		t.Errorf("doc[1] should use LiteralBlockMapper for block scalar")
	}
}

func TestMarkdownProvider_Extract_EmptyDescription(t *testing.T) {
	root := &SemanticNode{
		Kind:  NodeMapping,
		Range: vrng(0, 0, 2, 0),
		Children: map[string]*SemanticNode{
			"description": {
				Kind:     NodeScalar,
				Value:    "",
				Range:    vrng(1, 2, 1, 2),
				Key:      "description",
				Children: nil,
			},
		},
	}
	provider := &MarkdownProvider{}
	docs := provider.Extract(root, "file:///empty.yaml")
	if len(docs) != 0 {
		t.Errorf("Extract returned %d docs for empty description, want 0", len(docs))
	}
}

func TestVirtualDocumentManager_Update_Get(t *testing.T) {
	root := &SemanticNode{
		Kind:  NodeMapping,
		Range: vrng(0, 0, 2, 0),
		Children: map[string]*SemanticNode{
			"description": {
				Kind:     NodeScalar,
				Value:    "Hello",
				Range:    vrng(1, 2, 1, 7),
				Key:      "description",
				Children: nil,
			},
		},
	}

	m := NewVirtualDocumentManager(&MarkdownProvider{})
	m.Update("file:///a.yaml", root)

	docs := m.ForParent("file:///a.yaml")
	if len(docs) != 1 {
		t.Fatalf("ForParent returned %d docs, want 1", len(docs))
	}

	got := m.Get("vdoc:file:///a.yaml#/description")
	if got == nil {
		t.Fatal("Get returned nil")
	}
	if got.Content != "Hello" {
		t.Errorf("Get().Content = %q, want Hello", got.Content)
	}
}

func TestVirtualDocumentManager_FindAtPosition(t *testing.T) {
	root := &SemanticNode{
		Kind:  NodeMapping,
		Range: vrng(0, 0, 5, 0),
		Children: map[string]*SemanticNode{
			"info": {
				Kind:  NodeMapping,
				Range: vrng(1, 0, 3, 0),
				Children: map[string]*SemanticNode{
					"description": {
						Kind:     NodeScalar,
						Value:    "Info desc",
						Range:    vrng(2, 2, 2, 11),
						Key:      "description",
						Children: nil,
					},
				},
			},
			"paths": {
				Kind:  NodeMapping,
				Range: vrng(4, 0, 5, 0),
				Children: map[string]*SemanticNode{
					"/x": {
						Kind:  NodeMapping,
						Range: vrng(5, 0, 5, 0),
						Children: map[string]*SemanticNode{
							"get": {
								Kind:  NodeMapping,
								Range: vrng(5, 0, 5, 0),
								Children: map[string]*SemanticNode{
									"description": {
										Kind:     NodeScalar,
										Value:    "Op desc",
										Range:    vrng(5, 4, 5, 12),
										Key:      "description",
										Children: nil,
									},
								},
							},
						},
					},
				},
			},
		},
	}

	m := NewVirtualDocumentManager(&MarkdownProvider{})
	m.Update("file:///spec.yaml", root)

	tests := []struct {
		pos  ctypes.Position
		want string
	}{
		{vpos(2, 5), "/info/description"},
		{vpos(5, 8), "/paths/~1x/get/description"},
		{vpos(0, 0), ""}, // not in any description
		{vpos(3, 0), ""},
	}
	for _, tt := range tests {
		vd := m.FindAtPosition("file:///spec.yaml", tt.pos)
		if tt.want == "" {
			if vd != nil {
				t.Errorf("FindAtPosition(%v) = %q, want nil", tt.pos, vd.URI)
			}
			continue
		}
		if vd == nil {
			t.Errorf("FindAtPosition(%v) = nil, want doc with path %s", tt.pos, tt.want)
			continue
		}
		if !ctypes.ContainsPosition(vd.SourceRange, tt.pos) {
			t.Errorf("FindAtPosition(%v) returned doc whose SourceRange %v does not contain pos", tt.pos, vd.SourceRange)
		}
	}
}

func TestVirtualDocumentManager_Remove(t *testing.T) {
	root := &SemanticNode{
		Kind:  NodeMapping,
		Children: map[string]*SemanticNode{
			"description": {
				Kind:     NodeScalar,
				Value:    "x",
				Range:    vrng(1, 2, 1, 3),
				Key:      "description",
				Children: nil,
			},
		},
	}

	m := NewVirtualDocumentManager(&MarkdownProvider{})
	m.Update("file:///x.yaml", root)

	if m.Get("vdoc:file:///x.yaml#/description") == nil {
		t.Fatal("Get before Remove returned nil")
	}

	m.Remove("file:///x.yaml")

	if m.Get("vdoc:file:///x.yaml#/description") != nil {
		t.Error("Get after Remove returned non-nil")
	}
	if len(m.ForParent("file:///x.yaml")) != 0 {
		t.Error("ForParent after Remove returned non-empty")
	}
}

func TestExampleProvider_ExtractAndNoOpMethods(t *testing.T) {
	root := &SemanticNode{
		Kind:  NodeMapping,
		Range: vrng(0, 0, 12, 0),
		Children: map[string]*SemanticNode{
			"components": {
				Kind:  NodeMapping,
				Range: vrng(1, 0, 10, 0),
				Children: map[string]*SemanticNode{
					"schemas": {
						Kind:  NodeMapping,
						Range: vrng(2, 0, 10, 0),
						Children: map[string]*SemanticNode{
							"Pet": {
								Kind:  NodeMapping,
								Range: vrng(3, 0, 8, 0),
								Children: map[string]*SemanticNode{
									"type": {
										Kind:  NodeScalar,
										Value: "string",
										Range: vrng(4, 2, 4, 8),
									},
									"example": {
										Kind:  NodeScalar,
										Value: "pet-123",
										Range: vrng(5, 2, 5, 11),
									},
								},
							},
						},
					},
				},
			},
			"info": {
				Kind:  NodeMapping,
				Range: vrng(11, 0, 12, 0),
				Children: map[string]*SemanticNode{
					"example": {
						Kind:  NodeScalar,
						Value: "ignored",
						Range: vrng(11, 2, 11, 9),
					},
				},
			},
		},
	}

	provider := &ExampleProvider{}
	if provider.LanguageID() != "json" {
		t.Fatalf("LanguageID() = %q, want json", provider.LanguageID())
	}
	if hover, err := provider.Hover(VirtualDocument{}, ctypes.Position{}); err != nil || hover != nil {
		t.Fatalf("Hover() = (%v, %v), want (nil, nil)", hover, err)
	}
	if items, err := provider.Complete(VirtualDocument{}, ctypes.Position{}); err != nil || items != nil {
		t.Fatalf("Complete() = (%v, %v), want (nil, nil)", items, err)
	}
	if diags, err := provider.Diagnostics(VirtualDocument{}); err != nil || diags != nil {
		t.Fatalf("Diagnostics() = (%v, %v), want (nil, nil)", diags, err)
	}

	docs := provider.Extract(root, "file:///spec.yaml")
	if len(docs) != 1 {
		t.Fatalf("Extract returned %d docs, want 1", len(docs))
	}
	doc := docs[0]
	if doc.URI != "vdoc:file:///spec.yaml#/components/schemas/Pet/example" {
		t.Fatalf("doc.URI = %q", doc.URI)
	}
	if doc.Content != "pet-123" {
		t.Fatalf("doc.Content = %q, want pet-123", doc.Content)
	}
	if _, ok := doc.Mapper.(*IdentityMapper); !ok {
		t.Fatalf("expected IdentityMapper, got %T", doc.Mapper)
	}
}

func TestIsExampleContext(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{"/components/schemas/Pet", true},
		{"/components/parameters/Limit", true},
		{"/paths/~1users/get/responses/200/content/application~1json", true},
		{"/components/schemas/Pet/properties/id", true},
		{"/info", false},
		{"/paths/~1users/get", false},
	}
	for _, tt := range tests {
		if got := isExampleContext(tt.path); got != tt.want {
			t.Errorf("isExampleContext(%q) = %v, want %v", tt.path, got, tt.want)
		}
	}
}

func TestCodeSampleProvider_ExtractAndNoOpMethods(t *testing.T) {
	root := &SemanticNode{
		Kind:  NodeMapping,
		Range: vrng(0, 0, 20, 0),
		Children: map[string]*SemanticNode{
			"paths": {
				Kind:  NodeMapping,
				Range: vrng(1, 0, 20, 0),
				Children: map[string]*SemanticNode{
					"/users": {
						Kind:  NodeMapping,
						Range: vrng(2, 0, 20, 0),
						Children: map[string]*SemanticNode{
							"get": {
								Kind:  NodeMapping,
								Range: vrng(3, 0, 20, 0),
								Children: map[string]*SemanticNode{
									"x-codeSamples": {
										Kind:  NodeSequence,
										Range: vrng(4, 2, 12, 0),
										Items: []*SemanticNode{
											{
												Kind:  NodeMapping,
												Range: vrng(5, 4, 8, 0),
												Children: map[string]*SemanticNode{
													"lang": {
														Kind:  NodeScalar,
														Value: "Go",
														Range: vrng(5, 6, 5, 8),
													},
													"source": {
														Kind:  NodeScalar,
														Value: "fmt.Println(\"hi\")\nfmt.Println(\"bye\")",
														Range: vrng(6, 6, 7, 24),
													},
												},
											},
											{
												Kind:  NodeMapping,
												Range: vrng(9, 4, 10, 0),
												Children: map[string]*SemanticNode{
													"source": {
														Kind:  NodeScalar,
														Value: "curl /users",
														Range: vrng(9, 6, 9, 17),
													},
												},
											},
											{
												Kind:  NodeMapping,
												Range: vrng(11, 4, 11, 8),
												Children: map[string]*SemanticNode{
													"lang": {
														Kind:  NodeScalar,
														Value: "python",
														Range: vrng(11, 6, 11, 12),
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	provider := &CodeSampleProvider{}
	if provider.LanguageID() != "code" {
		t.Fatalf("LanguageID() = %q, want code", provider.LanguageID())
	}
	if hover, err := provider.Hover(VirtualDocument{}, ctypes.Position{}); err != nil || hover != nil {
		t.Fatalf("Hover() = (%v, %v), want (nil, nil)", hover, err)
	}
	if items, err := provider.Complete(VirtualDocument{}, ctypes.Position{}); err != nil || items != nil {
		t.Fatalf("Complete() = (%v, %v), want (nil, nil)", items, err)
	}
	if diags, err := provider.Diagnostics(VirtualDocument{}); err != nil || diags != nil {
		t.Fatalf("Diagnostics() = (%v, %v), want (nil, nil)", diags, err)
	}

	docs := provider.Extract(root, "file:///spec.yaml")
	if len(docs) != 2 {
		t.Fatalf("Extract returned %d docs, want 2", len(docs))
	}

	first := docs[0]
	if first.LanguageID != "go" {
		t.Fatalf("first.LanguageID = %q, want go", first.LanguageID)
	}
	if _, ok := first.Mapper.(*LiteralBlockMapper); !ok {
		t.Fatalf("expected LiteralBlockMapper for multiline source, got %T", first.Mapper)
	}

	second := docs[1]
	if second.LanguageID != "text" {
		t.Fatalf("second.LanguageID = %q, want text", second.LanguageID)
	}
	if _, ok := second.Mapper.(*IdentityMapper); !ok {
		t.Fatalf("expected IdentityMapper for single-line source, got %T", second.Mapper)
	}
}
