package checks_test

import (
	"strings"
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/rules/analyzers"
	"github.com/sailpoint-oss/telescope/server/rules/checks"
	"github.com/sailpoint-oss/telescope/server/testutil"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

// parseYAMLTree parses YAML content via tree-sitter and wraps it in a gossip
// Tree so it can be used with RunAnalyzers and RunChecks.
func parseYAMLTree(t *testing.T, content []byte) (*treesitter.Tree, *tree_sitter.Language) {
	t.Helper()
	raw := testutil.ParseYAML(t, content)
	lang := testutil.YAMLLanguage()
	return treesitter.NewTree(raw, content), lang
}

// parseJSONTree parses JSON content via tree-sitter and wraps it in a gossip Tree.
func parseJSONTree(t *testing.T, content []byte) (*treesitter.Tree, *tree_sitter.Language) {
	t.Helper()
	raw := testutil.ParseJSON(t, content)
	lang := testutil.JSONLanguage()
	return treesitter.NewTree(raw, content), lang
}

// runFullPipelineYAML runs all analyzers and checks against YAML content,
// mirroring the CLI execution path.
func runFullPipelineYAML(t *testing.T, content []byte) []protocol.Diagnostic {
	t.Helper()
	tree, lang := parseYAMLTree(t, content)
	idx := openapi.ParseAndIndex(content)
	uri := "file:///test.yaml"

	allAnalyzers, allChecks := rules.CollectAll(analyzers.RegisterAll, checks.RegisterAll)
	diags := rules.RunAnalyzers(allAnalyzers, idx, uri, tree)
	diags = append(diags, rules.RunChecks(allChecks, tree, lang)...)
	return adapt.DiagnosticsToProtocol(diags)
}

// runFullPipelineJSON runs all analyzers and checks against JSON content.
func runFullPipelineJSON(t *testing.T, content []byte) []protocol.Diagnostic {
	t.Helper()
	tree, lang := parseJSONTree(t, content)
	idx := openapi.ParseAndIndex(content)
	uri := "file:///test.json"

	allAnalyzers, allChecks := rules.CollectAll(analyzers.RegisterAll, checks.RegisterAll)
	diags := rules.RunAnalyzers(allAnalyzers, idx, uri, tree)
	diags = append(diags, rules.RunChecks(allChecks, tree, lang)...)
	return adapt.DiagnosticsToProtocol(diags)
}

func diagsByCode(diags []protocol.Diagnostic, code string) []protocol.Diagnostic {
	var out []protocol.Diagnostic
	for _, d := range diags {
		if codeStr, ok := d.Code.(string); ok && codeStr == code {
			out = append(out, d)
		}
	}
	return out
}

func diagsBySource(diags []protocol.Diagnostic, source string) []protocol.Diagnostic {
	var out []protocol.Diagnostic
	for _, d := range diags {
		if d.Source == source {
			out = append(out, d)
		}
	}
	return out
}

func diagsBySeverity(diags []protocol.Diagnostic, sev protocol.DiagnosticSeverity) []protocol.Diagnostic {
	var out []protocol.Diagnostic
	for _, d := range diags {
		if d.Severity == sev {
			out = append(out, d)
		}
	}
	return out
}

func diagsContaining(diags []protocol.Diagnostic, substr string) []protocol.Diagnostic {
	var out []protocol.Diagnostic
	for _, d := range diags {
		if strings.Contains(d.Message, substr) {
			out = append(out, d)
		}
	}
	return out
}

func dumpDiags(t *testing.T, label string, diags []protocol.Diagnostic) {
	t.Helper()
	t.Logf("--- %s (%d diagnostics) ---", label, len(diags))
	for i, d := range diags {
		code := ""
		if d.Code != nil {
			code = d.Code.(string)
		}
		t.Logf("  [%d] L%d:%d severity=%d code=%q source=%q msg=%q",
			i, d.Range.Start.Line+1, d.Range.Start.Character+1,
			d.Severity, code, d.Source, d.Message)
	}
}

// ---------------------------------------------------------------------------
// Syntax error tests
//
// Note: syntax-error and missing-token diagnostics are now provided by the
// editor's YAML/JSON language services rather than Telescope tree-sitter checks.
// Telescope integration tests only verify that malformed docs are suppressed.
// ---------------------------------------------------------------------------

func TestSyntaxErrors_InvalidYAML_DuplicateKeys(t *testing.T) {
	s := specs.ByName("invalid-yaml-syntax")
	if len(s.Content) == 0 {
		t.Fatal("fixture invalid-yaml-syntax not found")
	}

	diags := runFullPipelineYAML(t, s.Content)
	dumpDiags(t, "invalid-yaml-syntax", diags)

	dupKeys := diagsByCode(diags, "duplicate-keys")
	if len(dupKeys) < 1 {
		t.Errorf("expected at least 1 duplicate-keys diagnostic, got %d", len(dupKeys))
	}
	for _, d := range dupKeys {
		if d.Severity != protocol.SeverityError {
			t.Errorf("duplicate-keys diagnostic should be Error, got severity %d", d.Severity)
		}
		if !strings.Contains(d.Message, "Duplicate key") {
			t.Errorf("unexpected duplicate-keys message: %q", d.Message)
		}
	}
}

// ---------------------------------------------------------------------------
// Structural validation tests (oas3-schema)
// ---------------------------------------------------------------------------

func TestStructuralValidation_InvalidOpenAPI(t *testing.T) {
	s := specs.ByName("invalid-openapi-structural")
	if len(s.Content) == 0 {
		t.Fatal("fixture invalid-openapi-structural not found")
	}

	diags := runFullPipelineYAML(t, s.Content)
	dumpDiags(t, "invalid-openapi-structural", diags)

	schemaDiags := diagsByCode(diags, "oas3-schema")
	if len(schemaDiags) < 1 {
		t.Errorf("expected at least 1 oas3-schema diagnostic, got %d", len(schemaDiags))
	}

	infoMissing := diagsContaining(schemaDiags, "info")
	if len(infoMissing) < 1 {
		t.Errorf("expected oas3-schema diagnostic mentioning 'info', got %d", len(infoMissing))
	}

	for _, d := range schemaDiags {
		if d.Severity != protocol.SeverityError {
			t.Errorf("oas3-schema diagnostic should be Error, got severity %d for: %q", d.Severity, d.Message)
		}
	}
}

func TestStructuralValidation_InvalidOpenAPI_JSON(t *testing.T) {
	content := []byte(`{
  "openapi": "3.1.0",
  "paths": {}
}`)

	diags := runFullPipelineJSON(t, content)
	dumpDiags(t, "invalid-openapi-structural-json", diags)

	schemaDiags := diagsByCode(diags, "oas3-schema")
	if len(schemaDiags) < 1 {
		t.Fatalf("expected at least 1 oas3-schema diagnostic, got %d", len(schemaDiags))
	}
	for _, d := range schemaDiags {
		if d.Severity != protocol.SeverityError {
			t.Errorf("oas3-schema diagnostic should be Error, got severity %d for: %q", d.Severity, d.Message)
		}
	}
}

func TestStructuralValidation_FragmentSchema_IsError(t *testing.T) {
	content := []byte(`
type: object
required: id
`)

	diags := runFullPipelineYAML(t, content)
	dumpDiags(t, "invalid-openapi-fragment-schema", diags)

	schemaDiags := diagsByCode(diags, "oas3-schema")
	if len(schemaDiags) < 1 {
		t.Fatalf("expected at least 1 oas3-schema diagnostic for fragment schema, got %d", len(schemaDiags))
	}
	for _, d := range schemaDiags {
		if d.Severity != protocol.SeverityError {
			t.Errorf("fragment oas3-schema diagnostic should be Error, got severity %d for: %q", d.Severity, d.Message)
		}
	}
}

// ---------------------------------------------------------------------------
// Semantic validation tests (analyzer rules)
// ---------------------------------------------------------------------------

func TestSemanticValidation_InvalidOpenAPI(t *testing.T) {
	s := specs.ByName("invalid-openapi-semantic")
	if len(s.Content) == 0 {
		t.Fatal("fixture invalid-openapi-semantic not found")
	}

	diags := runFullPipelineYAML(t, s.Content)
	dumpDiags(t, "invalid-openapi-semantic", diags)

	expectedRules := []struct {
		code    string
		minHits int
	}{
		{"operation-description", 1},
		{"operation-operationId", 1},
		{"tag-description", 1},
		{"info-contact", 1},
		{"info-license", 1},
		{"kebab-case", 1},
		{"no-http-verbs", 1},
		{"operation-operationId-unique", 1},
	}

	for _, exp := range expectedRules {
		hits := diagsByCode(diags, exp.code)
		if len(hits) < exp.minHits {
			t.Errorf("rule %q: expected at least %d diagnostic(s), got %d", exp.code, exp.minHits, len(hits))
		}
	}
}

// ---------------------------------------------------------------------------
// Valid spec baseline
// ---------------------------------------------------------------------------

func TestValidSpec_NoDiagnostics(t *testing.T) {
	s := specs.ByName("valid-minimal")
	if len(s.Content) == 0 {
		t.Fatal("fixture valid-minimal not found")
	}

	diags := runFullPipelineYAML(t, s.Content)

	errors := diagsBySeverity(diags, protocol.SeverityError)
	if len(errors) > 0 {
		dumpDiags(t, "valid-minimal (unexpected errors)", errors)
		t.Errorf("expected 0 error diagnostics on valid spec, got %d", len(errors))
	}
}

// ---------------------------------------------------------------------------
// Focused duplicate-keys tests
// ---------------------------------------------------------------------------

func TestDuplicateKeys_YAML(t *testing.T) {
	content := []byte(`
openapi: "3.1.0"
info:
  title: Dup Test
  version: "1.0"
paths:
  /test:
    get:
      summary: First
    get:
      summary: Second
`)
	diags := runFullPipelineYAML(t, content)
	dumpDiags(t, "duplicate-keys-yaml", diags)

	dups := diagsByCode(diags, "duplicate-keys")
	if len(dups) != 1 {
		t.Fatalf("expected exactly 1 duplicate-keys diagnostic, got %d", len(dups))
	}
	if !strings.Contains(dups[0].Message, "Duplicate key 'get'") {
		t.Errorf("expected message to mention 'get', got: %q", dups[0].Message)
	}
	if !strings.Contains(dups[0].Message, "first defined at line") {
		t.Errorf("expected message to mention first definition line, got: %q", dups[0].Message)
	}
}

func TestDuplicateKeys_JSON(t *testing.T) {
	content := []byte(`{
  "openapi": "3.1.0",
  "info": {
    "title": "Dup Test",
    "version": "1.0"
  },
  "paths": {
    "/test": {
      "get": {"summary": "First"},
      "get": {"summary": "Second"}
    }
  }
}`)
	diags := runFullPipelineJSON(t, content)
	dumpDiags(t, "duplicate-keys-json", diags)

	dups := diagsByCode(diags, "duplicate-keys")
	if len(dups) != 1 {
		t.Fatalf("expected exactly 1 duplicate-keys diagnostic, got %d", len(dups))
	}
	if !strings.Contains(dups[0].Message, "Duplicate key") {
		t.Errorf("unexpected message: %q", dups[0].Message)
	}
}

// Missing-token tests removed: syntax diagnostics now come from the editor.

// ---------------------------------------------------------------------------
// Focused ASCII tests
// ---------------------------------------------------------------------------

func TestASCII_NonASCIICharacters(t *testing.T) {
	content := []byte("openapi: \"3.1.0\"\ninfo:\n  title: Test \xe2\x80\x94 API\n  version: \"1.0\"\n")

	diags := runFullPipelineYAML(t, content)
	dumpDiags(t, "ascii-check", diags)

	ascii := diagsByCode(diags, "ascii")
	if len(ascii) < 1 {
		t.Fatalf("expected at least 1 ascii diagnostic, got %d", len(ascii))
	}
	for _, d := range ascii {
		if d.Severity != protocol.SeverityWarning {
			t.Errorf("ascii diagnostic should be Warning, got severity %d", d.Severity)
		}
		if !strings.Contains(d.Message, "Non-ASCII character") {
			t.Errorf("unexpected ascii message: %q", d.Message)
		}
	}
}

func TestASCII_UTF16Columns(t *testing.T) {
	// "café" contains 'é' (U+00E9, 2 UTF-8 bytes, 1 UTF-16 code unit).
	// 🚀 (U+1F680) is 4 UTF-8 bytes, 2 UTF-16 code units.
	// The first non-ASCII byte 'é' starts at byte column 14 but UTF-16 column 14
	// (all preceding characters are ASCII). The 🚀 after "café " starts at
	// byte 20 but UTF-16 column 19 (é collapsed from 2 bytes to 1 unit).
	content := []byte("openapi: \"3.1.0\"\ninfo:\n  title: caf\xc3\xa9 \xf0\x9f\x9a\x80\n  version: \"1.0\"\npaths: {}\n")

	diags := runFullPipelineYAML(t, content)
	ascii := diagsByCode(diags, "ascii")
	if len(ascii) < 2 {
		dumpDiags(t, "ascii-utf16", diags)
		t.Fatalf("expected at least 2 ascii diagnostics (é and 🚀), got %d", len(ascii))
	}

	// 'é' at line 2, after "  title: caf" = 12 ASCII chars => col 12
	found := false
	for _, d := range ascii {
		if d.Range.Start.Line == 2 && d.Range.Start.Character == 12 {
			found = true
			// é = 1 UTF-16 code unit, so end = 13
			if d.Range.End.Character != 13 {
				t.Errorf("é end character = %d, want 13", d.Range.End.Character)
			}
			break
		}
	}
	if !found {
		dumpDiags(t, "ascii-utf16", ascii)
		t.Error("did not find ascii diagnostic for 'é' at line 2, col 12")
	}
}

func TestDuplicateKeys_UTF16Columns(t *testing.T) {
	// Place a duplicate key after non-ASCII text to verify column positions
	// use UTF-16 code units. "café" has é = 2 UTF-8 bytes but 1 UTF-16 unit.
	content := []byte("openapi: \"3.1.0\"\ninfo:\n  title: Test\n  version: \"1.0\"\npaths:\n  /caf\xc3\xa9:\n    get:\n      summary: First\n    get:\n      summary: Second\n")

	diags := runFullPipelineYAML(t, content)
	dups := diagsByCode(diags, "duplicate-keys")
	if len(dups) != 1 {
		dumpDiags(t, "dup-keys-utf16", diags)
		t.Fatalf("expected 1 duplicate-keys diagnostic, got %d", len(dups))
	}

	d := dups[0]
	// The second "get" is on line 8 (0-based), col 4 (indented 4 spaces).
	// This is all ASCII so the column should simply be 4.
	if d.Range.Start.Line != 8 {
		t.Errorf("duplicate key line = %d, want 8", d.Range.Start.Line)
	}
	if d.Range.Start.Character != 4 {
		t.Errorf("duplicate key start character = %d, want 4", d.Range.Start.Character)
	}
}

// ---------------------------------------------------------------------------
// Cross-cutting severity tests
// ---------------------------------------------------------------------------

func TestDiagnosticSeverities_AreCorrect(t *testing.T) {
	s := specs.ByName("invalid-openapi-semantic")
	if len(s.Content) == 0 {
		t.Fatal("fixture not found")
	}

	diags := runFullPipelineYAML(t, s.Content)

	warningCodes := map[string]bool{
		"operation-description": true,
		"operation-operationId": true,
		"tag-description":       true,
		"info-contact":          true,
		"info-license":          true,
		"kebab-case":            true,
		"no-http-verbs":         true,
	}

	for _, d := range diags {
		code, ok := d.Code.(string)
		if !ok {
			continue
		}
		if warningCodes[code] && d.Severity != protocol.SeverityWarning {
			t.Errorf("rule %q should produce Warning, got severity %d: %q", code, d.Severity, d.Message)
		}
	}

	errorCodes := map[string]bool{
		"duplicate-keys":               true,
		"oas3-schema":                  true,
		"operation-operationId-unique": true,
	}

	for _, d := range diags {
		code, ok := d.Code.(string)
		if !ok {
			continue
		}
		if errorCodes[code] && d.Severity != protocol.SeverityError {
			t.Errorf("rule %q should produce Error, got severity %d: %q", code, d.Severity, d.Message)
		}
	}
}
