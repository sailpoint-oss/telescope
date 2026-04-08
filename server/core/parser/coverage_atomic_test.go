package parser

import (
	"testing"
	"unsafe"

	ts_yaml "github.com/sailpoint-oss/tree-sitter-openapi/bindings/go/openapi"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	sitter "github.com/tree-sitter/go-tree-sitter"
)

func testYAMLLang() *sitter.Language {
	return sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
}

func TestNewParser_LanguageCombinations(t *testing.T) {
	yamlLang := testYAMLLang()

	tests := []struct {
		name    string
		yaml    *sitter.Language
		json    *sitter.Language
		hasYAML bool
		hasJSON bool
	}{
		{"yaml only", yamlLang, nil, true, false},
		{"no languages", nil, nil, false, false},
		{"both set", yamlLang, yamlLang, true, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := NewParser(tt.yaml, tt.json)
			defer p.Close()
			if (p.yamlParser != nil) != tt.hasYAML {
				t.Errorf("yamlParser present = %v, want %v", p.yamlParser != nil, tt.hasYAML)
			}
			if (p.jsonParser != nil) != tt.hasJSON {
				t.Errorf("jsonParser present = %v, want %v", p.jsonParser != nil, tt.hasJSON)
			}
		})
	}
}

func TestParse_FormatHandling(t *testing.T) {
	yamlLang := testYAMLLang()
	p := NewParser(yamlLang, nil)
	defer p.Close()

	tests := []struct {
		name    string
		content string
		format  string
		wantErr bool
	}{
		{"valid yaml mapping", "key: value", "yaml", false},
		{"valid yaml sequence", "- a\n- b", "yaml", false},
		{"empty yaml", "", "yaml", false},
		{"default format falls to yaml", "x: 1", "", false},
		{"no json parser configured", `{"a":1}`, "json", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tree, err := p.Parse([]byte(tt.content), tt.format)
			if (err != nil) != tt.wantErr {
				t.Fatalf("Parse() error = %v, wantErr %v", err, tt.wantErr)
			}
			if err == nil {
				if tree == nil {
					t.Fatal("Parse() returned nil tree without error")
				}
				tree.Close()
			}
		})
	}
}

func TestIncrementalParse_ReusesOldTree(t *testing.T) {
	yamlLang := testYAMLLang()
	p := NewParser(yamlLang, nil)
	defer p.Close()

	original := []byte("key: value")
	tree, err := p.Parse(original, "yaml")
	if err != nil {
		t.Fatalf("initial Parse: %v", err)
	}
	defer tree.Close()

	updated := []byte("key: updated\nextra: field")
	tree2, err := p.IncrementalParse(tree, updated, "yaml")
	if err != nil {
		t.Fatalf("IncrementalParse: %v", err)
	}
	defer tree2.Close()

	if tree2.RootNode() == nil {
		t.Fatal("incremental tree has nil root")
	}

	_, err = p.IncrementalParse(tree, updated, "json")
	if err == nil {
		t.Error("IncrementalParse with missing json parser should error")
	}
}

func TestClose_DoesNotPanic(t *testing.T) {
	t.Run("both parsers", func(t *testing.T) {
		lang := testYAMLLang()
		p := NewParser(lang, lang)
		p.Close()
	})
	t.Run("nil parsers", func(t *testing.T) {
		p := NewParser(nil, nil)
		p.Close()
	})
	t.Run("yaml only", func(t *testing.T) {
		p := NewParser(testYAMLLang(), nil)
		p.Close()
	})
}

func TestParserForFormat_Selection(t *testing.T) {
	yamlLang := testYAMLLang()
	p := NewParser(yamlLang, nil)
	defer p.Close()

	tests := []struct {
		format string
		isNil  bool
	}{
		{"yaml", false},
		{"yml", false},
		{"", false},
		{"json", true},
	}
	for _, tt := range tests {
		t.Run("format="+tt.format, func(t *testing.T) {
			got := p.parserForFormat(tt.format)
			if (got == nil) != tt.isNil {
				t.Errorf("parserForFormat(%q) nil=%v, want nil=%v", tt.format, got == nil, tt.isNil)
			}
		})
	}
}

func TestBuildFromCST_Mapping(t *testing.T) {
	p := NewParser(testYAMLLang(), nil)
	defer p.Close()

	src := []byte("name: telescope\nversion: 1")
	tree, err := p.Parse(src, "yaml")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	defer tree.Close()

	node, err := BuildFromCST(tree.RootNode(), src)
	if err != nil {
		t.Fatalf("BuildFromCST: %v", err)
	}
	if node.Kind != NodeMapping {
		t.Fatalf("Kind = %v, want NodeMapping", node.Kind)
	}

	nameNode := node.Get("name")
	if nameNode == nil || nameNode.StringValue() != "telescope" {
		t.Errorf("Get(name) = %v, want scalar 'telescope'", nameNode)
	}
	if nameNode.Key != "name" {
		t.Errorf("nameNode.Key = %q, want 'name'", nameNode.Key)
	}

	verNode := node.Get("version")
	if verNode == nil {
		t.Fatal("Get(version) = nil")
	}
}

func TestBuildFromCST_Sequence(t *testing.T) {
	p := NewParser(testYAMLLang(), nil)
	defer p.Close()

	src := []byte("- alpha\n- beta\n- gamma")
	tree, err := p.Parse(src, "yaml")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	defer tree.Close()

	node, err := BuildFromCST(tree.RootNode(), src)
	if err != nil {
		t.Fatalf("BuildFromCST: %v", err)
	}
	if node.Kind != NodeSequence {
		t.Fatalf("Kind = %v, want NodeSequence", node.Kind)
	}
	if len(node.Items) != 3 {
		t.Fatalf("len(Items) = %d, want 3", len(node.Items))
	}
	want := []string{"alpha", "beta", "gamma"}
	for i, w := range want {
		if node.Items[i].StringValue() != w {
			t.Errorf("Items[%d] = %q, want %q", i, node.Items[i].StringValue(), w)
		}
	}
}

func TestBuildFromCST_ScalarTypes(t *testing.T) {
	p := NewParser(testYAMLLang(), nil)
	defer p.Close()

	tests := []struct {
		name string
		yaml string
		key  string
		want any
	}{
		{"plain string", "k: hello", "k", "hello"},
		{"bool true", "k: true", "k", true},
		{"bool True", "k: True", "k", true},
		{"bool TRUE", "k: TRUE", "k", true},
		{"bool false", "k: false", "k", false},
		{"null keyword", "k: null", "k", nil},
		{"tilde null", "k: ~", "k", nil},
		{"double quoted", `k: "quoted"`, "k", "quoted"},
		{"single quoted", "k: 'single'", "k", "single"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tree, err := p.Parse([]byte(tt.yaml), "yaml")
			if err != nil {
				t.Fatalf("Parse: %v", err)
			}
			defer tree.Close()

			node, err := BuildFromCST(tree.RootNode(), []byte(tt.yaml))
			if err != nil {
				t.Fatalf("BuildFromCST: %v", err)
			}
			child := node.Get(tt.key)
			if child == nil {
				t.Fatal("child is nil")
			}
			if child.Value != tt.want {
				t.Errorf("Value = %v (%T), want %v (%T)", child.Value, child.Value, tt.want, tt.want)
			}
		})
	}
}

func TestBuildFromCST_Nested(t *testing.T) {
	p := NewParser(testYAMLLang(), nil)
	defer p.Close()

	src := []byte("info:\n  title: My API\n  contact:\n    name: Dev")
	tree, err := p.Parse(src, "yaml")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	defer tree.Close()

	root, err := BuildFromCST(tree.RootNode(), src)
	if err != nil {
		t.Fatalf("BuildFromCST: %v", err)
	}

	info := root.Get("info")
	if info == nil || info.Kind != NodeMapping {
		t.Fatalf("info = %v, want mapping", info)
	}
	title := info.Get("title")
	if title == nil || title.StringValue() != "My API" {
		t.Errorf("title = %v, want 'My API'", title)
	}
	contact := info.Get("contact")
	if contact == nil || contact.Kind != NodeMapping {
		t.Fatalf("contact = %v, want mapping", contact)
	}
	name := contact.Get("name")
	if name == nil || name.StringValue() != "Dev" {
		t.Errorf("name = %v, want 'Dev'", name)
	}
}

func TestBuildFromCST_NilRoot(t *testing.T) {
	node, err := BuildFromCST(nil, []byte(""))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if node != nil {
		t.Errorf("BuildFromCST(nil) = %v, want nil", node)
	}
}

func TestBuildFromCST_NodeRanges(t *testing.T) {
	p := NewParser(testYAMLLang(), nil)
	defer p.Close()

	src := []byte("key: value")
	tree, err := p.Parse(src, "yaml")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	defer tree.Close()

	root := tree.RootNode()
	r := nodeRange(root)
	if r.Start.Line != 0 || r.Start.Character != 0 {
		t.Errorf("root range start = (%d,%d), want (0,0)", r.Start.Line, r.Start.Character)
	}
	if r.End.Character == 0 && r.End.Line == 0 {
		t.Error("root range end should be non-zero for non-empty content")
	}
}

func TestBuildFromRaw_Formats(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		format string
		kind   NodeKind
		check  func(*testing.T, *SemanticNode)
	}{
		{
			"yaml mapping", "key: value", "yaml", NodeMapping,
			func(t *testing.T, n *SemanticNode) {
				if c := n.Get("key"); c == nil || c.StringValue() != "value" {
					t.Errorf("expected key=value, got %v", c)
				}
			},
		},
		{
			"yaml sequence", "- one\n- two", "yaml", NodeSequence,
			func(t *testing.T, n *SemanticNode) {
				if len(n.Items) != 2 {
					t.Errorf("len(Items) = %d, want 2", len(n.Items))
				}
			},
		},
		{
			"json object", `{"a":"b"}`, "json", NodeMapping,
			func(t *testing.T, n *SemanticNode) {
				if c := n.Get("a"); c == nil || c.StringValue() != "b" {
					t.Errorf("expected a=b, got %v", c)
				}
			},
		},
		{
			"json array", `[1, 2, 3]`, "json", NodeSequence,
			func(t *testing.T, n *SemanticNode) {
				if len(n.Items) != 3 {
					t.Errorf("len(Items) = %d, want 3", len(n.Items))
				}
			},
		},
		{
			"invalid json", `{broken`, "json", NodeNull, nil,
		},
		{
			"yaml scalar string", "hello", "yaml", NodeScalar,
			func(t *testing.T, n *SemanticNode) {
				if n.StringValue() != "hello" {
					t.Errorf("value = %q, want 'hello'", n.StringValue())
				}
			},
		},
		{
			"yaml null", "~", "yaml", NodeNull, nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			node := BuildFromRaw([]byte(tt.input), tt.format)
			if node == nil {
				t.Fatal("BuildFromRaw returned nil")
			}
			if node.Kind != tt.kind {
				t.Errorf("Kind = %v, want %v", node.Kind, tt.kind)
			}
			if tt.check != nil {
				tt.check(t, node)
			}
		})
	}
}

func TestGoValueToNode_Types(t *testing.T) {
	tests := []struct {
		name string
		val  any
		kind NodeKind
	}{
		{"nil", nil, NodeNull},
		{"string", "text", NodeScalar},
		{"int", 42, NodeScalar},
		{"float", 3.14, NodeScalar},
		{"bool", true, NodeScalar},
		{"map", map[string]any{"x": "y"}, NodeMapping},
		{"slice", []any{"a", "b"}, NodeSequence},
		{"empty map", map[string]any{}, NodeMapping},
		{"empty slice", []any{}, NodeSequence},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			node := goValueToNode(tt.val)
			if node == nil {
				t.Fatal("goValueToNode returned nil")
			}
			if node.Kind != tt.kind {
				t.Errorf("Kind = %v, want %v", node.Kind, tt.kind)
			}
		})
	}

	t.Run("map children have keys set", func(t *testing.T) {
		node := goValueToNode(map[string]any{"alpha": "beta"})
		child := node.Get("alpha")
		if child == nil {
			t.Fatal("child nil")
		}
		if child.Key != "alpha" {
			t.Errorf("child.Key = %q, want 'alpha'", child.Key)
		}
		if child.StringValue() != "beta" {
			t.Errorf("child value = %q, want 'beta'", child.StringValue())
		}
	})

	t.Run("slice items", func(t *testing.T) {
		node := goValueToNode([]any{10, "str", nil})
		if len(node.Items) != 3 {
			t.Fatalf("len(Items) = %d, want 3", len(node.Items))
		}
		if node.Items[0].Kind != NodeScalar {
			t.Errorf("Items[0].Kind = %v, want NodeScalar", node.Items[0].Kind)
		}
		if node.Items[2].Kind != NodeNull {
			t.Errorf("Items[2].Kind = %v, want NodeNull", node.Items[2].Kind)
		}
	})
}

func TestParseScalarValue_Conversions(t *testing.T) {
	tests := []struct {
		input string
		want  any
	}{
		{"true", true},
		{"True", true},
		{"TRUE", true},
		{"false", false},
		{"False", false},
		{"FALSE", false},
		{"null", nil},
		{"Null", nil},
		{"NULL", nil},
		{"~", nil},
		{"hello", "hello"},
		{"123", "123"},
		{"", ""},
		{"some string with spaces", "some string with spaces"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := parseScalarValue(tt.input)
			if got != tt.want {
				t.Errorf("parseScalarValue(%q) = %v (%T), want %v (%T)",
					tt.input, got, got, tt.want, tt.want)
			}
		})
	}
}

func TestFoldedBlockMapper(t *testing.T) {
	m := &FoldedBlockMapper{StartLine: 3, IndentCols: 4}

	t.Run("ToSource round-trips", func(t *testing.T) {
		tests := []struct {
			virtual ctypes.Position
			source  ctypes.Position
		}{
			{ctypes.Position{Line: 0, Character: 0}, ctypes.Position{Line: 3, Character: 4}},
			{ctypes.Position{Line: 0, Character: 5}, ctypes.Position{Line: 3, Character: 9}},
			{ctypes.Position{Line: 2, Character: 1}, ctypes.Position{Line: 5, Character: 5}},
		}
		for _, tt := range tests {
			got := m.ToSource(tt.virtual)
			if got != tt.source {
				t.Errorf("ToSource(%v) = %v, want %v", tt.virtual, got, tt.source)
			}
			back := m.ToVirtual(tt.source)
			if back != tt.virtual {
				t.Errorf("ToVirtual(%v) = %v, want %v", tt.source, back, tt.virtual)
			}
		}
	})

	t.Run("ToVirtual before start line", func(t *testing.T) {
		got := m.ToVirtual(ctypes.Position{Line: 1, Character: 10})
		if got.Line != 0 || got.Character != 0 {
			t.Errorf("ToVirtual(before start) = %v, want (0,0)", got)
		}
	})

	t.Run("ToVirtual char before indent", func(t *testing.T) {
		got := m.ToVirtual(ctypes.Position{Line: 3, Character: 2})
		if got.Character != 0 {
			t.Errorf("char = %d, want 0 (clamped)", got.Character)
		}
	})
}

func TestQuotedStringMapper(t *testing.T) {
	m := &QuotedStringMapper{StartLine: 5, StartCol: 10}

	t.Run("ToSource first line", func(t *testing.T) {
		got := m.ToSource(ctypes.Position{Line: 0, Character: 3})
		want := ctypes.Position{Line: 5, Character: 13}
		if got != want {
			t.Errorf("ToSource(0,3) = %v, want %v", got, want)
		}
	})

	t.Run("ToSource subsequent line", func(t *testing.T) {
		got := m.ToSource(ctypes.Position{Line: 2, Character: 7})
		want := ctypes.Position{Line: 7, Character: 7}
		if got != want {
			t.Errorf("ToSource(2,7) = %v, want %v", got, want)
		}
	})

	t.Run("ToVirtual before start line", func(t *testing.T) {
		got := m.ToVirtual(ctypes.Position{Line: 3, Character: 0})
		if got.Line != 0 || got.Character != 0 {
			t.Errorf("ToVirtual(before start) = %v, want (0,0)", got)
		}
	})

	t.Run("ToVirtual at start line", func(t *testing.T) {
		got := m.ToVirtual(ctypes.Position{Line: 5, Character: 14})
		want := ctypes.Position{Line: 0, Character: 4}
		if got != want {
			t.Errorf("ToVirtual(5,14) = %v, want %v", got, want)
		}
	})

	t.Run("ToVirtual at start line before col", func(t *testing.T) {
		got := m.ToVirtual(ctypes.Position{Line: 5, Character: 5})
		if got.Character != 0 {
			t.Errorf("char = %d, want 0 (clamped)", got.Character)
		}
	})

	t.Run("ToVirtual after start line", func(t *testing.T) {
		got := m.ToVirtual(ctypes.Position{Line: 8, Character: 3})
		want := ctypes.Position{Line: 3, Character: 3}
		if got != want {
			t.Errorf("ToVirtual(8,3) = %v, want %v", got, want)
		}
	})
}

func TestExtractVirtualDocuments_Aggregation(t *testing.T) {
	root := &SemanticNode{
		Kind: NodeMapping,
		Children: map[string]*SemanticNode{
			"info": {
				Kind: NodeMapping,
				Children: map[string]*SemanticNode{
					"description": {
						Kind:  NodeScalar,
						Value: "API desc",
						Range: ctypes.Range{
							Start: ctypes.Position{Line: 1, Character: 2},
							End:   ctypes.Position{Line: 1, Character: 10},
						},
						Key: "description",
					},
				},
			},
		},
	}

	providers := []EmbeddedLanguageProvider{&MarkdownProvider{}}
	docs := ExtractVirtualDocuments(root, "file:///api.yaml", providers)

	if len(docs) != 1 {
		t.Fatalf("len(docs) = %d, want 1", len(docs))
	}
	if docs[0].LanguageID != "markdown" {
		t.Errorf("LanguageID = %q, want 'markdown'", docs[0].LanguageID)
	}
	if docs[0].Content != "API desc" {
		t.Errorf("Content = %q, want 'API desc'", docs[0].Content)
	}

	t.Run("empty providers", func(t *testing.T) {
		docs := ExtractVirtualDocuments(root, "file:///x.yaml", nil)
		if len(docs) != 0 {
			t.Errorf("len(docs) = %d, want 0", len(docs))
		}
	})

	t.Run("nil root", func(t *testing.T) {
		docs := ExtractVirtualDocuments(nil, "file:///x.yaml", providers)
		if len(docs) != 0 {
			t.Errorf("len(docs) = %d, want 0", len(docs))
		}
	})

	t.Run("sorted output", func(t *testing.T) {
		multi := &SemanticNode{
			Kind: NodeMapping,
			Children: map[string]*SemanticNode{
				"paths": {
					Kind: NodeMapping,
					Children: map[string]*SemanticNode{
						"/z": {
							Kind: NodeMapping,
							Children: map[string]*SemanticNode{
								"description": {
									Kind:  NodeScalar,
									Value: "z-desc",
									Range: ctypes.Range{
										Start: ctypes.Position{Line: 5, Character: 0},
										End:   ctypes.Position{Line: 5, Character: 6},
									},
									Key: "description",
								},
							},
						},
						"/a": {
							Kind: NodeMapping,
							Children: map[string]*SemanticNode{
								"description": {
									Kind:  NodeScalar,
									Value: "a-desc",
									Range: ctypes.Range{
										Start: ctypes.Position{Line: 3, Character: 0},
										End:   ctypes.Position{Line: 3, Character: 6},
									},
									Key: "description",
								},
							},
						},
					},
				},
			},
		}
		docs := ExtractVirtualDocuments(multi, "file:///m.yaml", providers)
		for i := 1; i < len(docs); i++ {
			if docs[i].URI < docs[i-1].URI {
				t.Errorf("docs not sorted: %q < %q at index %d", docs[i].URI, docs[i-1].URI, i)
			}
		}
	})
}

func TestMarkdownProvider_LanguageID(t *testing.T) {
	p := &MarkdownProvider{}
	if got := p.LanguageID(); got != "markdown" {
		t.Errorf("LanguageID() = %q, want 'markdown'", got)
	}
}

func TestMarkdownProvider_HoverAndComplete(t *testing.T) {
	p := &MarkdownProvider{}
	vdoc := VirtualDocument{Content: "test", SourceURI: "file:///x.yaml"}

	hover, err := p.Hover(vdoc, ctypes.Position{})
	if hover != nil || err != nil {
		t.Errorf("Hover() = (%v, %v), want (nil, nil)", hover, err)
	}

	items, err := p.Complete(vdoc, ctypes.Position{})
	if items != nil || err != nil {
		t.Errorf("Complete() = (%v, %v), want (nil, nil)", items, err)
	}
}

func TestMarkdownProvider_Diagnostics(t *testing.T) {
	p := &MarkdownProvider{}
	mapper := &IdentityMapper{Offset: ctypes.Position{Line: 0, Character: 0}}

	tests := []struct {
		name      string
		content   string
		wantCodes []string
	}{
		{
			"broken link",
			"Click [here]() for info",
			[]string{"markdown/broken-link"},
		},
		{
			"empty link reference",
			"See []() for details",
			[]string{"markdown/broken-link"},
		},
		{
			"deep heading",
			"#### Too Deep",
			[]string{"markdown/deep-heading"},
		},
		{
			"both issues",
			"#### Heading\n[link]()",
			[]string{"markdown/deep-heading", "markdown/broken-link"},
		},
		{
			"clean content",
			"# Good Heading\n\nParagraph with [link](https://example.com).",
			nil,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			vdoc := VirtualDocument{
				Content:   tt.content,
				SourceURI: "file:///test.yaml",
				Mapper:    mapper,
			}
			diags, err := p.Diagnostics(vdoc)
			if err != nil {
				t.Fatalf("Diagnostics: %v", err)
			}
			if len(diags) != len(tt.wantCodes) {
				t.Fatalf("got %d diagnostics, want %d: %v", len(diags), len(tt.wantCodes), diags)
			}
			for i, code := range tt.wantCodes {
				if diags[i].Code != code {
					t.Errorf("diags[%d].Code = %q, want %q", i, diags[i].Code, code)
				}
			}
		})
	}
}

func TestVirtualDocumentManager_Providers(t *testing.T) {
	md := &MarkdownProvider{}
	ex := &ExampleProvider{}
	m := NewVirtualDocumentManager(md, ex)

	got := m.Providers()
	if len(got) != 2 {
		t.Fatalf("len(Providers()) = %d, want 2", len(got))
	}
	if got[0].LanguageID() != "markdown" {
		t.Errorf("Providers()[0] = %q, want 'markdown'", got[0].LanguageID())
	}
	if got[1].LanguageID() != "json" {
		t.Errorf("Providers()[1] = %q, want 'json'", got[1].LanguageID())
	}

	t.Run("empty manager", func(t *testing.T) {
		empty := NewVirtualDocumentManager()
		if len(empty.Providers()) != 0 {
			t.Errorf("empty manager has %d providers", len(empty.Providers()))
		}
	})
}

func TestBuildFromCST_FlowMapping(t *testing.T) {
	p := NewParser(testYAMLLang(), nil)
	defer p.Close()

	src := []byte("{a: 1, b: 2}")
	tree, err := p.Parse(src, "yaml")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	defer tree.Close()

	node, err := BuildFromCST(tree.RootNode(), src)
	if err != nil {
		t.Fatalf("BuildFromCST: %v", err)
	}
	if node.Kind != NodeMapping {
		t.Errorf("Kind = %v, want NodeMapping", node.Kind)
	}
	if a := node.Get("a"); a == nil {
		t.Error("Get(a) = nil")
	}
	if b := node.Get("b"); b == nil {
		t.Error("Get(b) = nil")
	}
}

func TestBuildFromCST_FlowSequence(t *testing.T) {
	p := NewParser(testYAMLLang(), nil)
	defer p.Close()

	src := []byte("[x, y, z]")
	tree, err := p.Parse(src, "yaml")
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	defer tree.Close()

	node, err := BuildFromCST(tree.RootNode(), src)
	if err != nil {
		t.Fatalf("BuildFromCST: %v", err)
	}
	if node.Kind != NodeSequence {
		t.Errorf("Kind = %v, want NodeSequence", node.Kind)
	}
	if len(node.Items) != 3 {
		t.Errorf("len(Items) = %d, want 3", len(node.Items))
	}
}
