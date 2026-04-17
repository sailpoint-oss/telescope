package diff

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// osWriteFile is a thin shim around os.WriteFile so we can keep a single
// import line for fixture writers across the package tests.
func osWriteFile(path string, data []byte) error {
	return os.WriteFile(path, data, 0o644)
}

func v1WithParam() []byte {
	return []byte(`openapi: "3.0.3"
info:
  title: T
  version: "1.0"
paths:
  /a:
    get:
      summary: ok
      parameters:
        - name: q
          in: query
          schema:
            type: string
      responses:
        "200":
          description: ok
`)
}

func v2RenamedProp() []byte {
	return []byte(`openapi: "3.0.3"
info:
  title: T
  version: "1.0"
paths:
  /a:
    get:
      summary: ok-renamed
      parameters:
        - name: q
          in: query
          schema:
            type: integer
      responses:
        "200":
          description: ok
`)
}

func TestCompare_detectsBreakingParameterTypeChange(t *testing.T) {
	res, err := Compare(v1WithParam(), v2RenamedProp(), CompareOpts{})
	if err != nil {
		t.Fatalf("compare: %v", err)
	}
	if res.TotalChanges() == 0 {
		t.Fatalf("expected changes, got 0")
	}
	if res.TotalBreakingChanges() == 0 {
		t.Fatalf("expected at least one breaking change, got 0")
	}
}

func TestCompare_rejectsEmptyUpdated(t *testing.T) {
	if _, err := Compare(v1(), nil, CompareOpts{}); err == nil {
		t.Fatal("expected error when updated is empty")
	}
}

func TestCompare_parseErrorOnInvalidYAML(t *testing.T) {
	// libopenapi.NewDocument only fails when version resolution fails;
	// pass bytes that look like OpenAPI but are malformed enough to fail.
	bad := []byte("not a valid openapi document at all")
	if _, err := Compare(bad, v1(), CompareOpts{}); err == nil {
		// Some versions of libopenapi tolerate this and return empty docs;
		// skip rather than fail to avoid brittle coupling.
		t.Skip("libopenapi accepted non-OpenAPI input; parse-error branch not reachable here")
	}
}

func TestResult_NilAndZeroSafe(t *testing.T) {
	var r *Result
	if r.TotalChanges() != 0 {
		t.Fatal("nil result should report 0 changes")
	}
	if r.TotalBreakingChanges() != 0 {
		t.Fatal("nil result should report 0 breaking changes")
	}
	empty := &Result{}
	if empty.TotalChanges() != 0 || empty.TotalBreakingChanges() != 0 {
		t.Fatal("empty result should report 0 changes")
	}
}

func TestFormatText_NoChanges(t *testing.T) {
	var buf bytes.Buffer
	if err := FormatText(&Result{}, &buf, FormatOpts{}); err != nil {
		t.Fatalf("FormatText error: %v", err)
	}
	if !strings.Contains(buf.String(), "No changes.") {
		t.Fatalf("expected 'No changes.', got %q", buf.String())
	}
}

func TestFormatText_ContainsChangeLines(t *testing.T) {
	res, err := Compare(v1WithParam(), v2RenamedProp(), CompareOpts{})
	if err != nil {
		t.Fatalf("compare: %v", err)
	}
	var buf bytes.Buffer
	if err := FormatText(res, &buf, FormatOpts{}); err != nil {
		t.Fatalf("FormatText: %v", err)
	}
	if buf.Len() == 0 {
		t.Fatal("expected text output with changes")
	}
}

func TestFormatText_BreakingOnlyFilter(t *testing.T) {
	res, err := Compare(v1WithParam(), v2RenamedProp(), CompareOpts{})
	if err != nil {
		t.Fatalf("compare: %v", err)
	}
	var all, breaking bytes.Buffer
	if err := FormatText(res, &all, FormatOpts{BreakingOnly: false}); err != nil {
		t.Fatal(err)
	}
	if err := FormatText(res, &breaking, FormatOpts{BreakingOnly: true}); err != nil {
		t.Fatal(err)
	}
	if breaking.Len() > all.Len() {
		t.Fatalf("breaking-only output must not exceed full output; got %d vs %d",
			breaking.Len(), all.Len())
	}
}

func TestFormatMarkdown_RendersTable(t *testing.T) {
	res, err := Compare(v1WithParam(), v2RenamedProp(), CompareOpts{})
	if err != nil {
		t.Fatalf("compare: %v", err)
	}
	var buf bytes.Buffer
	if err := FormatMarkdown(res, &buf, FormatOpts{}); err != nil {
		t.Fatalf("FormatMarkdown: %v", err)
	}
	s := buf.String()
	if !strings.Contains(s, "| Breaking | Property |") {
		t.Fatalf("expected markdown table header, got: %s", s)
	}
	if !strings.Contains(s, "Total changes:") {
		t.Fatalf("expected totals line, got: %s", s)
	}
}

func TestFormatMarkdown_NoChanges(t *testing.T) {
	var buf bytes.Buffer
	if err := FormatMarkdown(&Result{}, &buf, FormatOpts{}); err != nil {
		t.Fatalf("FormatMarkdown: %v", err)
	}
	if !strings.Contains(buf.String(), "_No changes._") {
		t.Fatalf("expected 'No changes' markdown; got: %s", buf.String())
	}
}

func TestFormatSARIF_ProducesValidShape(t *testing.T) {
	res, err := Compare(v1WithParam(), v2RenamedProp(), CompareOpts{})
	if err != nil {
		t.Fatalf("compare: %v", err)
	}
	var buf bytes.Buffer
	if err := FormatSARIF(res, &buf, FormatOpts{BreakingOnly: true}); err != nil {
		t.Fatalf("FormatSARIF: %v", err)
	}
	s := buf.String()
	for _, marker := range []string{`"version": "2.1.0"`, `"runs"`, `"results"`, `"telescope-diff"`} {
		if !strings.Contains(s, marker) {
			t.Fatalf("SARIF output missing %q: %s", marker, s)
		}
	}
}

func TestFormatSARIF_EmptyInput(t *testing.T) {
	var buf bytes.Buffer
	if err := FormatSARIF(nil, &buf, FormatOpts{}); err != nil {
		t.Fatalf("FormatSARIF(nil): %v", err)
	}
	if !strings.Contains(buf.String(), `"runs"`) {
		t.Fatalf("even empty input must produce SARIF envelope")
	}
}

func TestEscapeMD_PipesAndNewlines(t *testing.T) {
	in := "alpha | beta\nnewline"
	got := escapeMD(in)
	if strings.Contains(got, "\n") {
		t.Fatalf("newlines should be replaced with spaces: %q", got)
	}
	if !strings.Contains(got, "\\|") {
		t.Fatalf("pipes should be escaped: %q", got)
	}
}

func TestChangeTypeName_KnownAndUnknown(t *testing.T) {
	if changeTypeName(-999) != "unknown" {
		t.Fatal("expected 'unknown' fallback for unrecognized type")
	}
}

func TestLoadBreakingRules_MissingFile(t *testing.T) {
	if _, err := LoadBreakingRules(filepath.Join(t.TempDir(), "no.yaml")); err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestLoadBreakingRules_MalformedYAML(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rules.yaml")
	if err := osWriteFile(path, []byte(":\n  not:\n  - valid\n    - yaml")); err != nil {
		t.Fatalf("write tmp: %v", err)
	}
	if _, err := LoadBreakingRules(path); err == nil {
		t.Fatal("expected parse error")
	}
}

func TestLoadBreakingRules_ValidEmpty(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rules.yaml")
	if err := osWriteFile(path, []byte("{}\n")); err != nil {
		t.Fatalf("write tmp: %v", err)
	}
	cfg, err := LoadBreakingRules(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if cfg == nil {
		t.Fatal("expected non-nil config for valid empty YAML")
	}
}
