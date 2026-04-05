package parser

import (
	"fmt"
	"sort"
	"strings"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// HoverResult is a hover response from an embedded language provider.
type HoverResult struct {
	Contents string // Markdown contents
	Range    ctypes.Range
}

// CompletionItem is a completion suggestion from an embedded language provider.
type CompletionItem struct {
	Label      string
	Detail     string
	InsertText string
	Kind       int // maps to LSP CompletionItemKind
}

// EmbeddedLanguageProvider detects and extracts embedded content from a semantic node.
type EmbeddedLanguageProvider interface {
	// LanguageID returns the embedded language identifier (e.g. "markdown").
	LanguageID() string

	// Extract finds all embedded content regions in the given node tree.
	Extract(root *SemanticNode, parentURI string) []VirtualDocument

	// Hover returns hover information for a position within a virtual document.
	Hover(vdoc VirtualDocument, pos ctypes.Position) (*HoverResult, error)

	// Complete returns completion items for a position within a virtual document.
	Complete(vdoc VirtualDocument, pos ctypes.Position) ([]CompletionItem, error)

	// Diagnostics validates the virtual document content and returns diagnostics.
	Diagnostics(vdoc VirtualDocument) ([]ctypes.Diagnostic, error)
}

// ExtractVirtualDocuments aggregates results from all providers into a single sorted slice.
func ExtractVirtualDocuments(node *SemanticNode, uri string, providers []EmbeddedLanguageProvider) []VirtualDocument {
	var all []VirtualDocument
	for _, p := range providers {
		all = append(all, p.Extract(node, uri)...)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].URI < all[j].URI })
	return all
}

// MarkdownProvider extracts Markdown content from description fields.
type MarkdownProvider struct{}

func (p *MarkdownProvider) LanguageID() string { return "markdown" }

func (p *MarkdownProvider) Hover(vdoc VirtualDocument, _ ctypes.Position) (*HoverResult, error) {
	return nil, nil
}

func (p *MarkdownProvider) Complete(vdoc VirtualDocument, _ ctypes.Position) ([]CompletionItem, error) {
	return nil, nil
}

func (p *MarkdownProvider) Diagnostics(vdoc VirtualDocument) ([]ctypes.Diagnostic, error) {
	var diags []ctypes.Diagnostic
	content := vdoc.Content
	lines := strings.Split(content, "\n")

	for i, line := range lines {
		// Check for broken markdown link references: [text](url) where url is empty
		if strings.Contains(line, "[]()") || strings.Contains(line, "]()")  {
			pos := vdoc.Mapper.ToSource(ctypes.Position{Line: uint32(i), Character: 0})
			diags = append(diags, ctypes.Diagnostic{
				URI: vdoc.SourceURI,
				Range: ctypes.Range{
					Start: pos,
					End:   ctypes.Position{Line: pos.Line, Character: pos.Character + uint32(len(line))},
				},
				Severity: ctypes.SeverityWarning,
				Code:     "markdown/broken-link",
				Source:   "telescope",
				Message:  "Markdown link has empty URL",
			})
		}

		// Check heading levels: warn on h4+ in descriptions (too deep for API docs)
		trimmed := strings.TrimLeft(line, " \t")
		if strings.HasPrefix(trimmed, "#### ") {
			pos := vdoc.Mapper.ToSource(ctypes.Position{Line: uint32(i), Character: 0})
			diags = append(diags, ctypes.Diagnostic{
				URI: vdoc.SourceURI,
				Range: ctypes.Range{
					Start: pos,
					End:   ctypes.Position{Line: pos.Line, Character: pos.Character + uint32(len(line))},
				},
				Severity: ctypes.SeverityInfo,
				Code:     "markdown/deep-heading",
				Source:   "telescope",
				Message:  "Heading level 4+ may be too deep for API documentation",
			})
		}
	}

	return diags, nil
}

func (p *MarkdownProvider) Extract(root *SemanticNode, parentURI string) []VirtualDocument {
	var out []VirtualDocument
	if root == nil {
		return out
	}
	root.Walk(func(path string, node *SemanticNode) {
		if node == nil || node.Kind != NodeScalar {
			return
		}
		content := node.StringValue()
		if content == "" {
			return
		}
		// Match "description" keys: path ends with /description or equals /description
		jsonPtr := path
		if !strings.HasSuffix(path, "/description") && path != "/description" {
			return
		}
		uri := "vdoc:" + parentURI + "#" + jsonPtr
		vdoc := VirtualDocument{
			URI:        uri,
			LanguageID: "markdown",
			Content:    content,
			SourceURI:  parentURI,
			SourceRange: node.Range,
		}
		// Block scalar: multi-line content. Use LiteralBlockMapper.
		// Flow scalar: single line. Use IdentityMapper.
		if node.Range.Start.Line < node.Range.End.Line {
			vdoc.Mapper = &LiteralBlockMapper{
				StartLine:  node.Range.Start.Line,
				IndentCols: node.Range.Start.Character,
			}
		} else {
			vdoc.Mapper = &IdentityMapper{Offset: node.Range.Start}
		}
		out = append(out, vdoc)
	})
	sort.Slice(out, func(i, j int) bool { return out[i].URI < out[j].URI })
	return out
}

// ExampleProvider validates example values embedded in OpenAPI specs against
// their surrounding schema context.
type ExampleProvider struct{}

func (p *ExampleProvider) LanguageID() string { return "json" }

func (p *ExampleProvider) Hover(_ VirtualDocument, _ ctypes.Position) (*HoverResult, error) {
	return nil, nil
}
func (p *ExampleProvider) Complete(_ VirtualDocument, _ ctypes.Position) ([]CompletionItem, error) {
	return nil, nil
}
func (p *ExampleProvider) Diagnostics(_ VirtualDocument) ([]ctypes.Diagnostic, error) {
	return nil, nil
}

func (p *ExampleProvider) Extract(root *SemanticNode, parentURI string) []VirtualDocument {
	var out []VirtualDocument
	if root == nil {
		return out
	}
	root.Walk(func(path string, node *SemanticNode) {
		if node == nil || node.Kind != NodeMapping {
			return
		}
		// "example" key within a schema/parameter/media-type
		exampleNode := node.Get("example")
		if exampleNode == nil || exampleNode.Kind == NodeNull {
			return
		}
		// Only extract if this is inside a schema or media-type context
		if !isExampleContext(path) {
			return
		}
		content := exampleNode.StringValue()
		if content == "" {
			return
		}
		uri := fmt.Sprintf("vdoc:%s#%s/example", parentURI, path)
		vdoc := VirtualDocument{
			URI:         uri,
			LanguageID:  "json",
			Content:     content,
			SourceURI:   parentURI,
			SourceRange: exampleNode.Range,
			Mapper:      &IdentityMapper{Offset: exampleNode.Range.Start},
		}
		out = append(out, vdoc)
	})
	sort.Slice(out, func(i, j int) bool { return out[i].URI < out[j].URI })
	return out
}

func isExampleContext(path string) bool {
	return strings.Contains(path, "/schemas/") ||
		strings.Contains(path, "/parameters/") ||
		strings.Contains(path, "/content/") ||
		strings.Contains(path, "/properties/")
}

// CodeSampleProvider extracts x-codeSamples source content for syntax validation.
type CodeSampleProvider struct{}

func (p *CodeSampleProvider) LanguageID() string { return "code" }

func (p *CodeSampleProvider) Hover(_ VirtualDocument, _ ctypes.Position) (*HoverResult, error) {
	return nil, nil
}
func (p *CodeSampleProvider) Complete(_ VirtualDocument, _ ctypes.Position) ([]CompletionItem, error) {
	return nil, nil
}
func (p *CodeSampleProvider) Diagnostics(_ VirtualDocument) ([]ctypes.Diagnostic, error) {
	return nil, nil
}

func (p *CodeSampleProvider) Extract(root *SemanticNode, parentURI string) []VirtualDocument {
	var out []VirtualDocument
	if root == nil {
		return out
	}
	root.Walk(func(path string, node *SemanticNode) {
		if node == nil {
			return
		}
		if !strings.HasSuffix(path, "/x-codeSamples") || node.Kind != NodeSequence {
			return
		}
		for i, sample := range node.Items {
			if sample == nil || sample.Kind != NodeMapping {
				continue
			}
			source := sample.Get("source")
			if source == nil || source.Kind != NodeScalar {
				continue
			}
			content := source.StringValue()
			if content == "" {
				continue
			}
			lang := "text"
			if langNode := sample.Get("lang"); langNode != nil {
				if l := langNode.StringValue(); l != "" {
					lang = strings.ToLower(l)
				}
			}
			uri := fmt.Sprintf("vdoc:%s#%s/x-codeSamples/%d/source", parentURI, path, i)
			vdoc := VirtualDocument{
				URI:         uri,
				LanguageID:  lang,
				Content:     content,
				SourceURI:   parentURI,
				SourceRange: source.Range,
			}
			if source.Range.Start.Line < source.Range.End.Line {
				vdoc.Mapper = &LiteralBlockMapper{
					StartLine:  source.Range.Start.Line,
					IndentCols: source.Range.Start.Character,
				}
			} else {
				vdoc.Mapper = &IdentityMapper{Offset: source.Range.Start}
			}
			out = append(out, vdoc)
		}
	})
	sort.Slice(out, func(i, j int) bool { return out[i].URI < out[j].URI })
	return out
}
