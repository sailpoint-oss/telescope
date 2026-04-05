package markdown

import (
	"strings"
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestValidate_EmptyHeading(t *testing.T) {
	issues := Validate("# \n\nSome text")
	if len(issues) == 0 {
		t.Fatal("expected issue for empty heading")
	}
	if !strings.Contains(issues[0].Message, "Empty heading") {
		t.Errorf("unexpected message: %s", issues[0].Message)
	}
}

func TestValidate_SkippedHeading(t *testing.T) {
	issues := Validate("# Title\n\n### Skipped")
	var found bool
	for _, iss := range issues {
		if strings.Contains(iss.Message, "Heading level skipped") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected skipped heading level issue")
	}
}

func TestValidate_EmptyLinkDestination(t *testing.T) {
	issues := Validate("Check [this link]() for more info")
	var found bool
	for _, iss := range issues {
		if strings.Contains(iss.Message, "Link has empty destination") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected empty link destination issue")
	}
}

func TestValidate_EmptyImageSource(t *testing.T) {
	issues := Validate("![alt text]()")
	var found bool
	for _, iss := range issues {
		if strings.Contains(iss.Message, "Image has empty source") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected empty image source issue")
	}
}

func TestValidate_ValidMarkdown(t *testing.T) {
	issues := Validate("# Title\n\n## Subtitle\n\nSome text with [a link](https://example.com).")
	if len(issues) != 0 {
		t.Errorf("expected no issues, got %d: %v", len(issues), issues)
	}
}

func TestRender(t *testing.T) {
	html, err := Render("**bold** and *italic*")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(html, "<strong>bold</strong>") {
		t.Errorf("expected <strong>, got: %s", html)
	}
	if !strings.Contains(html, "<em>italic</em>") {
		t.Errorf("expected <em>, got: %s", html)
	}
}

func TestHeadings(t *testing.T) {
	src := "# Title\n\n## Section 1\n\n### Sub\n\n## Section 2\n"
	headings := Headings(src)
	if len(headings) != 4 {
		t.Fatalf("expected 4 headings, got %d", len(headings))
	}

	expected := []struct {
		level int
		text  string
	}{
		{1, "Title"},
		{2, "Section 1"},
		{3, "Sub"},
		{2, "Section 2"},
	}
	for i, h := range headings {
		if h.Level != expected[i].level {
			t.Errorf("heading %d: expected level %d, got %d", i, expected[i].level, h.Level)
		}
		if h.Text != expected[i].text {
			t.Errorf("heading %d: expected text %q, got %q", i, expected[i].text, h.Text)
		}
	}
}

func TestLinks(t *testing.T) {
	src := "See [Google](https://google.com) and [GitHub](https://github.com)."
	links := Links(src)
	if len(links) != 2 {
		t.Fatalf("expected 2 links, got %d", len(links))
	}

	if links[0].Destination != "https://google.com" {
		t.Errorf("link 0: expected https://google.com, got %s", links[0].Destination)
	}
	if links[0].Text != "Google" {
		t.Errorf("link 0: expected text 'Google', got %q", links[0].Text)
	}
	if links[1].Destination != "https://github.com" {
		t.Errorf("link 1: expected https://github.com, got %s", links[1].Destination)
	}
}

func TestLinks_ColumnAndLength(t *testing.T) {
	src := "See [Google](https://google.com) for more."
	links := Links(src)
	if len(links) != 1 {
		t.Fatalf("expected 1 link, got %d", len(links))
	}
	if links[0].Column != 4 {
		t.Errorf("expected column 4, got %d", links[0].Column)
	}
	// [Google](https://google.com) = 1 + 6 + 2 + 18 + 1 = 28
	if links[0].Length != 28 {
		t.Errorf("expected length 28, got %d", links[0].Length)
	}
}

func TestTranslatePosition(t *testing.T) {
	desc := openapi.DescriptionValue{
		Text: "# Title\n\nSome text",
		Loc: openapi.Loc{
			Range: ctypes.Range{
				Start: ctypes.Position{Line: 10, Character: 4},
				End:   ctypes.Position{Line: 15, Character: 0},
			},
		},
		LineOffset: 0,
		IndentCols: 0,
	}

	r := TranslatePosition(desc, 1)
	if r.Start.Line != 10 {
		t.Errorf("expected line 10, got %d", r.Start.Line)
	}

	r = TranslatePosition(desc, 3)
	if r.Start.Line != 12 {
		t.Errorf("expected line 12, got %d", r.Start.Line)
	}
}

func TestTranslatePosition_BlockScalar(t *testing.T) {
	desc := openapi.DescriptionValue{
		Text: "# Title\n\nSome text",
		Loc: openapi.Loc{
			Range: ctypes.Range{
				Start: ctypes.Position{Line: 10, Character: 4},
				End:   ctypes.Position{Line: 15, Character: 0},
			},
		},
		LineOffset: 1,
		IndentCols: 4,
	}

	r := TranslatePosition(desc, 1)
	if r.Start.Line != 11 {
		t.Errorf("expected line 11 (10 + 1 offset), got %d", r.Start.Line)
	}

	r = TranslatePosition(desc, 3)
	if r.Start.Line != 13 {
		t.Errorf("expected line 13, got %d", r.Start.Line)
	}
}

func TestTranslateRange(t *testing.T) {
	desc := openapi.DescriptionValue{
		Text: "Some content here",
		Loc: openapi.Loc{
			Range: ctypes.Range{
				Start: ctypes.Position{Line: 5, Character: 2},
				End:   ctypes.Position{Line: 10, Character: 0},
			},
		},
		LineOffset: 0,
		IndentCols: 0,
	}

	r := TranslateRange(desc, 2, 8, 15)
	if r.Start.Line != 6 {
		t.Errorf("expected line 6, got %d", r.Start.Line)
	}
	if r.Start.Character != 8 {
		t.Errorf("expected character 8, got %d", r.Start.Character)
	}
	if r.End.Character != 23 {
		t.Errorf("expected end character 23, got %d", r.End.Character)
	}
}

func TestTranslateRange_BlockScalar(t *testing.T) {
	desc := openapi.DescriptionValue{
		Text: "See [link](https://example.com) for details.",
		Loc: openapi.Loc{
			Range: ctypes.Range{
				Start: ctypes.Position{Line: 5, Character: 2},
				End:   ctypes.Position{Line: 10, Character: 0},
			},
		},
		LineOffset: 1,
		IndentCols: 4,
	}

	r := TranslateRange(desc, 1, 4, 28)
	if r.Start.Line != 6 {
		t.Errorf("expected line 6 (5 + 1), got %d", r.Start.Line)
	}
	if r.Start.Character != 8 {
		t.Errorf("expected character 8 (4 + 4 indent), got %d", r.Start.Character)
	}
	if r.End.Character != 36 {
		t.Errorf("expected end character 36 (8 + 28), got %d", r.End.Character)
	}
}
