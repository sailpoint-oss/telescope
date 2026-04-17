package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/barrelman/codemod"
	"github.com/sailpoint-oss/barrelman/codemod/hints"
)

func TestNewFixCmd_Flags(t *testing.T) {
	t.Parallel()
	cmd := newFixCmd()
	for _, name := range []string{"rule", "dry-run", "write", "interactive", "format", "fail-on-unfixable", "source-hints", "stats"} {
		if cmd.Flags().Lookup(name) == nil {
			t.Fatalf("newFixCmd missing flag %q", name)
		}
	}
	if got := cmd.Flags().Lookup("dry-run").DefValue; got != "true" {
		t.Fatalf("dry-run default should be true, got %q", got)
	}
	if got := cmd.Flags().Lookup("format").DefValue; got != "text" {
		t.Fatalf("format default should be text, got %q", got)
	}
}

func TestPlural(t *testing.T) {
	t.Parallel()
	if plural(1) != "" {
		t.Fatalf("plural(1) should be empty")
	}
	if plural(0) != "es" {
		t.Fatalf("plural(0) should be 'es'")
	}
	if plural(2) != "es" {
		t.Fatalf("plural(2) should be 'es'")
	}
}

func TestIsOpenAPIExtensionFile(t *testing.T) {
	t.Parallel()
	cases := map[string]bool{
		"spec.yaml":   true,
		"spec.YAML":   true,
		"spec.yml":    true,
		"spec.json":   true,
		"spec.JSON":   true,
		"readme.md":   false,
		"notes.txt":   false,
		"archive.tar": false,
		"noext":       false,
	}
	for name, want := range cases {
		if got := isOpenAPIExtensionFile(name); got != want {
			t.Errorf("isOpenAPIExtensionFile(%q) = %v, want %v", name, got, want)
		}
	}
}

func TestResolveFixInputs_SingleFileAndDirectoryWalk(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	// Mix of matching and non-matching files, plus a nested dir.
	files := map[string]string{
		"a.yaml":      "x",
		"b.yml":       "x",
		"c.json":      "x",
		"readme.md":   "x",
		"nested/d.yaml": "x",
		"nested/skip.ts": "x",
	}
	for rel, body := range files {
		full := filepath.Join(dir, rel)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	got, err := resolveFixInputs([]string{dir})
	if err != nil {
		t.Fatalf("resolveFixInputs: %v", err)
	}
	// Only the yaml/yml/json files should show up, sorted.
	wantSuffixes := []string{"a.yaml", "b.yml", "c.json", filepath.Join("nested", "d.yaml")}
	if len(got) != len(wantSuffixes) {
		t.Fatalf("expected %d matches, got %d: %v", len(wantSuffixes), len(got), got)
	}
	for i, w := range wantSuffixes {
		if !strings.HasSuffix(got[i], w) {
			t.Errorf("match %d: got %q, want suffix %q", i, got[i], w)
		}
	}

	// Explicit file argument bypasses extension filtering.
	single, err := resolveFixInputs([]string{filepath.Join(dir, "readme.md")})
	if err != nil {
		t.Fatalf("explicit file: %v", err)
	}
	if len(single) != 1 {
		t.Fatalf("expected 1 explicit file, got %d", len(single))
	}
}

func TestResolveFixInputs_StatErrorBubbles(t *testing.T) {
	t.Parallel()
	_, err := resolveFixInputs([]string{filepath.Join(t.TempDir(), "does", "not", "exist")})
	if err == nil {
		t.Fatal("expected error for non-existent path")
	}
}

func TestDefaultFixInputs_UsesWD(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.yaml"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "b.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	withWorkingDir(t, dir)

	got, err := defaultFixInputs()
	if err != nil {
		t.Fatalf("defaultFixInputs: %v", err)
	}
	if len(got) != 1 || !strings.HasSuffix(got[0], "a.yaml") {
		t.Fatalf("expected only a.yaml, got %v", got)
	}
}

func TestResolveSourceHints(t *testing.T) {
	// Ensure the package-level lookup slot is in a known state and
	// restore it afterwards; parallelism with TestResolveSourceHints_Cartographer
	// is avoided because both mutate the same global.
	origLookup := cartographerLookup
	t.Cleanup(func() { cartographerLookup = origLookup })

	cartographerLookup = nil
	if got, err := resolveSourceHints(""); err != nil || got != nil {
		t.Fatalf("empty: want (nil, nil), got (%v, %v)", got, err)
	}
	if got, err := resolveSourceHints("synth"); err != nil {
		t.Fatalf("synth: %v", err)
	} else if _, ok := got.(hints.Synth); !ok {
		t.Fatalf("synth: expected hints.Synth, got %T", got)
	}
	// cartographer without a lookup degrades to synth silently.
	if got, err := resolveSourceHints("cartographer"); err != nil {
		t.Fatalf("cartographer: %v", err)
	} else if _, ok := got.(hints.Synth); !ok {
		t.Fatalf("cartographer fallback: expected hints.Synth, got %T", got)
	}
	// all without a lookup should still return a Composite.
	if got, err := resolveSourceHints("all"); err != nil {
		t.Fatalf("all: %v", err)
	} else if _, ok := got.(hints.Composite); !ok {
		t.Fatalf("all: expected hints.Composite, got %T", got)
	}
	// unknown value rejected.
	if _, err := resolveSourceHints("bogus"); err == nil {
		t.Fatalf("bogus: expected error")
	}
}

type stubCartoLookup struct{}

func (stubCartoLookup) DocCommentFor(pointer string) (string, bool) { return "", false }
func (stubCartoLookup) SampleValueFor(pointer string) (any, bool)   { return nil, false }

func TestResolveSourceHints_WithLookup(t *testing.T) {
	// Mutates the package-level lookup; cannot be t.Parallel().
	origLookup := cartographerLookup
	t.Cleanup(func() { cartographerLookup = origLookup })
	cartographerLookup = stubCartoLookup{}

	got, err := resolveSourceHints("cartographer")
	if err != nil {
		t.Fatalf("cartographer: %v", err)
	}
	if _, ok := got.(hints.Composite); !ok {
		t.Fatalf("cartographer with lookup: expected hints.Composite, got %T", got)
	}
	got, err = resolveSourceHints("all")
	if err != nil {
		t.Fatalf("all: %v", err)
	}
	if _, ok := got.(hints.Composite); !ok {
		t.Fatalf("all with lookup: expected hints.Composite, got %T", got)
	}
}

func TestLoadFixWaivers_Missing(t *testing.T) {
	dir := t.TempDir()
	withWorkingDir(t, dir)
	// LoadWaivers returns an empty (but non-nil) WaiverSet when no
	// file is present; the important contract is that no error is
	// surfaced and subsequent Filter/Allows calls are safe.
	got := loadFixWaivers()
	if got != nil && got.Allows("any-rule", "#/paths/~1x") {
		t.Fatalf("empty WaiverSet should allow no rules")
	}
}

func TestLoadFixWaivers_Present(t *testing.T) {
	dir := t.TempDir()
	waiverDir := filepath.Join(dir, ".telescope")
	if err := os.MkdirAll(waiverDir, 0o755); err != nil {
		t.Fatal(err)
	}
	waiverBody := `waivers:
  - rule: sailpoint-foo
    pointer: "#/paths/~1x"
    reason: "needed"
    expires: "2030-01-01"
`
	if err := os.WriteFile(filepath.Join(waiverDir, "waivers.yaml"), []byte(waiverBody), 0o644); err != nil {
		t.Fatal(err)
	}
	withWorkingDir(t, dir)
	got := loadFixWaivers()
	if got == nil {
		t.Fatalf("expected non-nil WaiverSet when file present")
	}
}

func TestWriteFixText(t *testing.T) {
	patch := codemod.Patch{RuleID: "sailpoint-foo", Description: "insert description"}
	r1 := barrelman.FixResult{File: "a.yaml", Original: []byte("a"), Patched: []byte("b"), Patches: []codemod.Patch{patch}}
	r2 := barrelman.FixResult{File: "b.yaml", Original: []byte("a"), Patched: []byte("a")}

	out := captureStdout(t, func() { writeFixText([]barrelman.FixResult{r1, r2}) })
	if !strings.Contains(out, "=== a.yaml") {
		t.Errorf("expected file header for a.yaml, got: %s", out)
	}
	if !strings.Contains(out, "sailpoint-foo") {
		t.Errorf("expected rule id in output, got: %s", out)
	}
	if strings.Contains(out, "b.yaml") {
		t.Errorf("unchanged file should be skipped, got: %s", out)
	}

	// All-unchanged prints the "no fixes" footer.
	empty := captureStdout(t, func() { writeFixText([]barrelman.FixResult{r2}) })
	if !strings.Contains(empty, "No fixes available.") {
		t.Errorf("expected 'No fixes available.' footer, got: %s", empty)
	}
}

func TestWriteFixPatch(t *testing.T) {
	r := barrelman.FixResult{File: "a.yaml", Original: []byte("a"), Patched: []byte("post"), Patches: []codemod.Patch{{RuleID: "r"}}}
	out := captureStdout(t, func() { writeFixPatch([]barrelman.FixResult{r}) })
	if !strings.Contains(out, "### a.yaml") {
		t.Errorf("expected ### header, got: %s", out)
	}
	if !strings.Contains(out, "post") {
		t.Errorf("expected patched body, got: %s", out)
	}
	// Unchanged results are skipped.
	r2 := barrelman.FixResult{File: "b.yaml", Original: []byte("a"), Patched: []byte("a")}
	out2 := captureStdout(t, func() { writeFixPatch([]barrelman.FixResult{r2}) })
	if strings.Contains(out2, "b.yaml") {
		t.Errorf("unchanged should be skipped, got: %s", out2)
	}
}

func TestWriteFixJSON(t *testing.T) {
	r := barrelman.FixResult{File: "a.yaml", Patches: []codemod.Patch{{RuleID: "r"}}}
	out := captureStdout(t, func() {
		if err := writeFixJSON([]barrelman.FixResult{r}); err != nil {
			t.Fatalf("writeFixJSON: %v", err)
		}
	})
	var decoded []map[string]any
	if err := json.Unmarshal([]byte(out), &decoded); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(decoded) != 1 {
		t.Fatalf("expected 1 result, got %d", len(decoded))
	}
	if decoded[0]["File"] != "a.yaml" {
		t.Errorf("expected File=a.yaml, got %v", decoded[0]["File"])
	}
}

func TestPrintFixStats(t *testing.T) {
	r := barrelman.FixResult{
		File:        "a.yaml",
		Diagnostics: []barrelman.Diagnostic{{Code: "rule-1"}, {Code: "rule-1"}, {Code: "rule-2"}},
		Patches:     []codemod.Patch{{RuleID: "rule-1"}, {RuleID: "rule-3"}},
		Unfixable:   []barrelman.Diagnostic{{Code: "rule-2"}},
	}
	out := captureStdout(t, func() { printFixStats([]barrelman.FixResult{r}) })
	// Header row present, emitted counts correct (rule-1: 2, rule-2: 1).
	if !strings.Contains(out, "rule") || !strings.Contains(out, "emitted") {
		t.Errorf("expected stats header, got: %s", out)
	}
	if !strings.Contains(out, "rule-1") || !strings.Contains(out, "rule-2") {
		t.Errorf("expected rule rows, got: %s", out)
	}
	// rule-3 appears from a patch with no emitted diagnostic; the
	// row should still materialize.
	if !strings.Contains(out, "rule-3") {
		t.Errorf("expected rule-3 row (patch-only), got: %s", out)
	}
}

func TestRunFix_NoMatches(t *testing.T) {
	dir := t.TempDir()
	withWorkingDir(t, dir)
	// Reset globals so the function signature matches a typical
	// invocation and we don't carry state from other tests.
	origRules := fixRules
	origFormat := fixFormat
	origDryRun := fixDryRun
	origWrite := fixWrite
	origInteractive := fixInteractive
	origFail := fixFailOnUnfixed
	origHints := fixSourceHints
	origStats := fixStats
	t.Cleanup(func() {
		fixRules = origRules
		fixFormat = origFormat
		fixDryRun = origDryRun
		fixWrite = origWrite
		fixInteractive = origInteractive
		fixFailOnUnfixed = origFail
		fixSourceHints = origHints
		fixStats = origStats
	})
	fixRules = nil
	fixFormat = "text"
	fixDryRun = true
	fixWrite = false
	fixInteractive = false
	fixFailOnUnfixed = false
	fixSourceHints = ""
	fixStats = false

	err := runFix(nil, []string{filepath.Join(dir, "nope.yaml")})
	if err == nil {
		t.Fatal("expected error for non-existent path")
	}

	// Empty directory: no matches -> error.
	err = runFix(nil, []string{dir})
	if err == nil || !strings.Contains(err.Error(), "no OpenAPI files") {
		t.Fatalf("expected 'no OpenAPI files' error, got %v", err)
	}
}

func TestRunFix_UnknownSourceHint(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "spec.yaml"), []byte("openapi: 3.0.0\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	withWorkingDir(t, dir)
	orig := fixSourceHints
	t.Cleanup(func() { fixSourceHints = orig })
	fixSourceHints = "unknown-provider"
	err := runFix(nil, []string{dir})
	if err == nil || !strings.Contains(err.Error(), "unknown --source-hints") {
		t.Fatalf("expected unknown source-hints error, got %v", err)
	}
}

// saveFixFlags snapshots every mutable fix-command global and returns
// a restorer suitable for t.Cleanup, so tests can set flags without
// leaking state across the suite.
func saveFixFlags(t *testing.T) {
	t.Helper()
	or, oFmt, oDry, oWrite, oInter, oFail, oHints, oStats := fixRules, fixFormat, fixDryRun, fixWrite, fixInteractive, fixFailOnUnfixed, fixSourceHints, fixStats
	t.Cleanup(func() {
		fixRules = or
		fixFormat = oFmt
		fixDryRun = oDry
		fixWrite = oWrite
		fixInteractive = oInter
		fixFailOnUnfixed = oFail
		fixSourceHints = oHints
		fixStats = oStats
	})
}

// TestRunFix_FormatsAndStats exercises the main runFix paths that
// don't require diagnostics with attached Fixes: text, patch, and
// json output, plus the --stats printer. With an empty registry
// there are no Patches to apply, so these paths land squarely in
// the formatter branches.
func TestRunFix_FormatsAndStats(t *testing.T) {
	dir := t.TempDir()
	spec := `openapi: 3.0.3
info:
  title: T
  version: "1.0"
paths: {}
`
	if err := os.WriteFile(filepath.Join(dir, "spec.yaml"), []byte(spec), 0o644); err != nil {
		t.Fatal(err)
	}
	withWorkingDir(t, dir)

	for _, format := range []string{"text", "patch", "json"} {
		t.Run(format, func(t *testing.T) {
			saveFixFlags(t)
			fixFormat = format
			fixStats = (format == "text")
			fixDryRun = true
			fixWrite = false
			out := captureStdout(t, func() {
				if err := runFix(nil, []string{dir}); err != nil {
					t.Fatalf("runFix(%s): %v", format, err)
				}
			})
			// JSON output must at minimum be a valid JSON array.
			if format == "json" {
				var v any
				if err := json.Unmarshal([]byte(out), &v); err != nil {
					t.Errorf("json output did not decode: %v\n%s", err, out)
				}
			}
		})
	}
}
