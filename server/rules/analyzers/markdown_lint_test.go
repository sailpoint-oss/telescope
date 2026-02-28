package analyzers_test

import (
	"regexp"
	"strings"
	"testing"

	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/markdown"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

const markdownBrokenSpec = `openapi: "3.1.0"
info:
  title: Markdown Test API
  version: "1.0.0"
  description: |
    # Title

    ### Skipped Level

    #

    See [empty link]() for details.
paths:
  /pets:
    get:
      operationId: listPets
      summary: List pets
      description: |
        # Operations Guide

        Check out <b>bold HTML</b> for more.
      responses:
        "200":
          description: A list of pets
components:
  schemas:
    Pet:
      type: object
      description: |
        # Pet Schema

        ## Overview

        A pet object.

        ![missing image]()
      properties:
        name:
          type: string
          description: "The pet name"
  securitySchemes:
    ApiKey:
      type: apiKey
      in: header
      name: X-API-Key
      description: |
        Use this key to authenticate.

        See [docs](https://example.com/docs) for more.
tags:
  - name: pets
    description: |
      # Pets

      ## Endpoints

      All pet-related endpoints.
`

func buildMarkdownIndex(t *testing.T, content string) *openapi.Index {
	t.Helper()
	return buildIndexFromContent(t, content)
}

func buildIndexFromContent(t *testing.T, content string) *openapi.Index {
	t.Helper()
	store := document.NewStore()
	lang := yamlLang()
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	t.Cleanup(mgr.Close)

	uri := protocol.DocumentURI("file:///test/markdown-test.yaml")
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: "yaml",
			Version:    1,
			Text:       content,
		},
	})

	tree := mgr.GetTree(uri)
	if tree == nil {
		t.Fatal("nil tree")
	}
	doc := store.Get(uri)
	if doc == nil {
		t.Fatal("nil doc")
	}
	return openapi.BuildIndex(tree, doc)
}

// collectAllDescriptions gathers all DescriptionValues from a parsed index,
// mirroring what the actual analyzer does internally.
func collectAllDescriptions(idx *openapi.Index) []openapi.DescriptionValue {
	if idx == nil || idx.Document == nil {
		return nil
	}
	doc := idx.Document
	var entries []openapi.DescriptionValue
	add := func(dv openapi.DescriptionValue) {
		if dv.Text != "" {
			entries = append(entries, dv)
		}
	}

	if doc.Info != nil {
		add(doc.Info.Description)
	}
	for i := range doc.Servers {
		add(doc.Servers[i].Description)
	}
	for i := range doc.Tags {
		add(doc.Tags[i].Description)
	}
	for _, item := range doc.Paths {
		add(item.Description)
		for _, mo := range item.Operations() {
			op := mo.Operation
			add(op.Description)
			for _, p := range op.Parameters {
				add(p.Description)
			}
			if op.RequestBody != nil {
				add(op.RequestBody.Description)
			}
			for _, resp := range op.Responses {
				add(resp.Description)
			}
		}
	}
	if doc.Components != nil {
		for _, schema := range doc.Components.Schemas {
			collectSchemaDescs(schema, &entries)
		}
		for _, ss := range doc.Components.SecuritySchemes {
			add(ss.Description)
		}
		for _, ex := range doc.Components.Examples {
			add(ex.Description)
		}
	}
	return entries
}

func collectSchemaDescs(schema *openapi.Schema, entries *[]openapi.DescriptionValue) {
	if schema == nil {
		return
	}
	if schema.Description.Text != "" {
		*entries = append(*entries, schema.Description)
	}
	for _, prop := range schema.Properties {
		collectSchemaDescs(prop, entries)
	}
	if schema.Items != nil {
		collectSchemaDescs(schema.Items, entries)
	}
}

func TestMarkdownValidation_EmptyHeading(t *testing.T) {
	idx := buildMarkdownIndex(t, markdownBrokenSpec)
	descs := collectAllDescriptions(idx)

	var found bool
	for _, d := range descs {
		for _, iss := range markdown.Validate(d.Text) {
			if strings.Contains(iss.Message, "Empty heading") {
				rng := markdown.TranslatePosition(d, iss.Line)
				if rng.Start.Line > 0 {
					found = true
				}
			}
		}
	}
	if !found {
		t.Error("expected 'Empty heading' issue from info.description")
	}
}

func TestMarkdownValidation_SkippedHeading(t *testing.T) {
	idx := buildMarkdownIndex(t, markdownBrokenSpec)
	descs := collectAllDescriptions(idx)

	var found bool
	for _, d := range descs {
		for _, iss := range markdown.Validate(d.Text) {
			if strings.Contains(iss.Message, "Heading level skipped") {
				found = true
			}
		}
	}
	if !found {
		t.Error("expected 'Heading level skipped' issue from info.description")
	}
}

func TestMarkdownValidation_EmptyLinkDest(t *testing.T) {
	idx := buildMarkdownIndex(t, markdownBrokenSpec)
	descs := collectAllDescriptions(idx)

	var found bool
	for _, d := range descs {
		for _, iss := range markdown.Validate(d.Text) {
			if strings.Contains(iss.Message, "Link has empty destination") {
				found = true
			}
		}
	}
	if !found {
		t.Error("expected 'Link has empty destination' issue")
	}
}

func TestMarkdownValidation_EmptyImageSource(t *testing.T) {
	idx := buildMarkdownIndex(t, markdownBrokenSpec)
	descs := collectAllDescriptions(idx)

	var found bool
	for _, d := range descs {
		for _, iss := range markdown.Validate(d.Text) {
			if strings.Contains(iss.Message, "Image has empty source") {
				found = true
			}
		}
	}
	if !found {
		t.Error("expected 'Image has empty source' issue from Pet schema description")
	}
}

func TestMarkdownValidation_ValidMarkdown(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Clean API
  version: "1.0.0"
  description: |
    # Clean API

    ## Overview

    This API is well-documented with [valid links](https://example.com).
paths: {}
`
	idx := buildMarkdownIndex(t, spec)
	descs := collectAllDescriptions(idx)

	for _, d := range descs {
		issues := markdown.Validate(d.Text)
		if len(issues) != 0 {
			preview := d.Text
			if len(preview) > 30 {
				preview = preview[:30]
			}
			t.Errorf("expected no issues for %q, got %d", preview, len(issues))
		}
	}
}

func TestDescriptionHTML_Detected(t *testing.T) {
	idx := buildMarkdownIndex(t, markdownBrokenSpec)
	descs := collectAllDescriptions(idx)

	htmlPattern := regexp.MustCompile(`<[a-zA-Z][^>]*>`)
	var found bool
	for _, d := range descs {
		if htmlPattern.MatchString(d.Text) {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected to detect raw HTML in operation description")
	}
}

func TestDescriptionHTML_NoFalsePositive(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Clean API
  version: "1.0.0"
  description: "A simple API without any HTML."
paths: {}
`
	idx := buildMarkdownIndex(t, spec)
	descs := collectAllDescriptions(idx)

	htmlPattern := regexp.MustCompile(`<[a-zA-Z][^>]*>`)
	for _, d := range descs {
		if htmlPattern.MatchString(d.Text) {
			t.Errorf("false positive HTML detection in %q", d.Text)
		}
	}
}

func TestDescriptionLoc_Populated(t *testing.T) {
	idx := buildMarkdownIndex(t, markdownBrokenSpec)
	if idx == nil || idx.Document == nil {
		t.Fatal("nil index")
	}

	if idx.Document.Info != nil && idx.Document.Info.Description.Text != "" {
		loc := idx.Document.Info.Description.Loc
		if loc.Range.Start.Line == 0 && loc.Range.Start.Character == 0 &&
			loc.Range.End.Line == 0 && loc.Range.End.Character == 0 {
			t.Error("Info.Description.Loc not populated")
		}
	}

	for _, item := range idx.Document.Paths {
		for _, mo := range item.Operations() {
			if mo.Operation.Description.Text != "" {
				loc := mo.Operation.Description.Loc
				if loc.Range == (protocol.Range{}) {
					t.Errorf("Operation %s Description.Loc not populated", mo.Operation.OperationID)
				}
			}
		}
	}

	if idx.Document.Components != nil {
		for name, schema := range idx.Document.Components.Schemas {
			if schema.Description.Text != "" {
				if schema.Description.Loc.Range == (protocol.Range{}) {
					t.Errorf("Schema %s Description.Loc not populated", name)
				}
			}
		}
	}
}

func TestTranslatePosition_Integration(t *testing.T) {
	idx := buildMarkdownIndex(t, markdownBrokenSpec)
	if idx == nil || idx.Document == nil || idx.Document.Info == nil {
		t.Fatal("nil index")
	}

	desc := idx.Document.Info.Description
	issues := markdown.Validate(desc.Text)
	if len(issues) == 0 {
		t.Fatal("expected issues from info description")
	}

	for _, iss := range issues {
		rng := markdown.TranslatePosition(desc, iss.Line)
		if rng.Start.Line < desc.Loc.Range.Start.Line {
			t.Errorf("translated line %d is before description start %d",
				rng.Start.Line, desc.Loc.Range.Start.Line)
		}
	}
}
