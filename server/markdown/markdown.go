// Package markdown provides on-demand CommonMark parsing utilities for OpenAPI
// description fields. It wraps goldmark to validate markdown structure, render
// hover previews, and extract structural information from descriptions.
package markdown

import (
	"bytes"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

var md = goldmark.New()

// Render converts CommonMark source text to HTML. Useful for hover previews
// where the editor supports HTML rendering in MarkupContent.
func Render(source string) (string, error) {
	var buf bytes.Buffer
	if err := md.Convert([]byte(source), &buf); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// Issue describes a structural problem found in a markdown document.
type Issue struct {
	Line    int
	Message string
}

// Validate checks a CommonMark description for structural issues such as
// broken link references, empty headings, and skipped heading levels.
func Validate(source string) []Issue {
	src := []byte(source)
	reader := text.NewReader(src)
	parser := md.Parser()
	tree := parser.Parse(reader)

	var issues []Issue

	// Track heading levels for skip detection.
	lastHeadingLevel := 0

	ast.Walk(tree, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}

		switch n := node.(type) {
		case *ast.Heading:
			line := lineNumber(src, n)

			// Empty heading check.
			if !n.HasChildren() || textContent(n, src) == "" {
				issues = append(issues, Issue{Line: line, Message: "Empty heading"})
			}

			// Skipped heading level (e.g., h1 -> h3).
			if lastHeadingLevel > 0 && n.Level > lastHeadingLevel+1 {
				issues = append(issues, Issue{
					Line:    line,
					Message: "Heading level skipped (expected h" + itoa(lastHeadingLevel+1) + ", got h" + itoa(n.Level) + ")",
				})
			}
			lastHeadingLevel = n.Level

		case *ast.Link:
			dest := string(n.Destination)
			if dest == "" {
				issues = append(issues, Issue{
					Line:    lineNumber(src, n),
					Message: "Link has empty destination",
				})
			}

		case *ast.Image:
			dest := string(n.Destination)
			if dest == "" {
				issues = append(issues, Issue{
					Line:    lineNumber(src, n),
					Message: "Image has empty source",
				})
			}
		}

		return ast.WalkContinue, nil
	})

	return issues
}

// Headings returns the heading texts and levels from a markdown description.
func Headings(source string) []Heading {
	src := []byte(source)
	reader := text.NewReader(src)
	parser := md.Parser()
	tree := parser.Parse(reader)

	var headings []Heading
	ast.Walk(tree, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		if h, ok := node.(*ast.Heading); ok {
			headings = append(headings, Heading{
				Level: h.Level,
				Text:  textContent(h, src),
				Line:  lineNumber(src, h),
			})
		}
		return ast.WalkContinue, nil
	})

	return headings
}

// Heading represents a parsed markdown heading.
type Heading struct {
	Level int
	Text  string
	Line  int
}

// Links returns all link destinations found in a markdown description.
func Links(source string) []Link {
	src := []byte(source)
	reader := text.NewReader(src)
	parser := md.Parser()
	tree := parser.Parse(reader)

	var links []Link
	ast.Walk(tree, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		if l, ok := node.(*ast.Link); ok {
			line, col, length := linkPosition(src, l)
			links = append(links, Link{
				Destination: string(l.Destination),
				Text:        textContent(l, src),
				Line:        line,
				Column:      col,
				Length:       length,
			})
		}
		return ast.WalkContinue, nil
	})

	return links
}

// Link represents a parsed markdown link.
type Link struct {
	Destination string
	Text        string
	Line        int
	Column      int
	Length      int // length of the full markdown link syntax [text](dest)
}

// linkPosition returns the 1-based line, 0-based column, and total length
// of a markdown link node in the source text. It scans backwards from the
// first child segment to find the opening '['.
func linkPosition(src []byte, link *ast.Link) (line, col, length int) {
	line = lineNumber(src, link)

	// Find the byte offset of the link's first child text.
	start := -1
	if link.HasChildren() {
		child := link.FirstChild()
		if t, ok := child.(*ast.Text); ok {
			start = t.Segment.Start
		}
	}

	if start < 0 {
		return line, 0, 0
	}

	// The '[' is one byte before the first text child.
	if start > 0 {
		start--
	}

	// Column = offset from the last newline (or start of source).
	lineStart := bytes.LastIndex(src[:start], []byte("\n"))
	if lineStart < 0 {
		col = start
	} else {
		col = start - lineStart - 1
	}

	// Total length: [text](dest) = 1 + len(text) + 2 + len(dest) + 1
	textLen := len(textContent(link, src))
	destLen := len(link.Destination)
	length = 1 + textLen + 2 + destLen + 1

	return line, col, length
}

func textContent(node ast.Node, src []byte) string {
	var sb strings.Builder
	for child := node.FirstChild(); child != nil; child = child.NextSibling() {
		if t, ok := child.(*ast.Text); ok {
			sb.Write(t.Segment.Value(src))
		}
	}
	return sb.String()
}

func lineNumber(src []byte, node ast.Node) int {
	if node.Type() != ast.TypeInline && node.Lines().Len() > 0 {
		seg := node.Lines().At(0)
		return bytes.Count(src[:seg.Start], []byte("\n")) + 1
	}
	// For inline nodes, find the byte offset from child text segments.
	offset := inlineOffset(node)
	if offset >= 0 && offset <= len(src) {
		return bytes.Count(src[:offset], []byte("\n")) + 1
	}
	return 0
}

// inlineOffset returns the byte offset of an inline node's first text segment,
// or -1 if no segment can be found.
func inlineOffset(node ast.Node) int {
	for child := node.FirstChild(); child != nil; child = child.NextSibling() {
		if t, ok := child.(*ast.Text); ok {
			return t.Segment.Start
		}
	}
	return -1
}

func itoa(n int) string {
	return string(rune('0' + n))
}

