package golden

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Fixture represents a test fixture directory with input specs and expected outputs.
type Fixture struct {
	Name     string
	Dir      string                 // absolute path to fixture directory
	Specs    map[string][]byte      // filename -> content
	Expected map[string]json.RawMessage // expected output files
}

// LoadFixture loads a fixture from the given directory.
// The directory structure should be:
//
//	fixture-name/
//	  specs/           — input OpenAPI files
//	  expected/        — expected output JSON files (diagnostics.json, etc.)
func LoadFixture(t *testing.T, dir string) *Fixture {
	t.Helper()
	f := &Fixture{
		Name:     filepath.Base(dir),
		Dir:      dir,
		Specs:    make(map[string][]byte),
		Expected: make(map[string]json.RawMessage),
	}

	specsDir := filepath.Join(dir, "specs")
	if entries, err := os.ReadDir(specsDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			content, err := os.ReadFile(filepath.Join(specsDir, e.Name()))
			if err != nil {
				t.Fatalf("golden: read spec %s: %v", e.Name(), err)
			}
			f.Specs[e.Name()] = content
		}
	}

	expectedDir := filepath.Join(dir, "expected")
	if entries, err := os.ReadDir(expectedDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			content, err := os.ReadFile(filepath.Join(expectedDir, e.Name()))
			if err != nil {
				t.Fatalf("golden: read expected %s: %v", e.Name(), err)
			}
			f.Expected[e.Name()] = json.RawMessage(content)
		}
	}

	return f
}

// LoadAll loads all fixtures from the given directory.
func LoadAll(t *testing.T, dir string) []*Fixture {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("golden: read fixtures dir: %v", err)
	}
	var fixtures []*Fixture
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		fixtures = append(fixtures, LoadFixture(t, filepath.Join(dir, e.Name())))
	}
	return fixtures
}

// DiagnosticExpectation is the expected format for diagnostics in golden files.
type DiagnosticExpectation struct {
	File     string `json:"file"`
	Line     int    `json:"line"`
	Code     string `json:"code"`
	Severity string `json:"severity"` // "error", "warning", "info", "hint"
	Message  string `json:"message,omitempty"` // substring match
}

// ParseDiagnostics parses the expected diagnostics from the fixture.
func (f *Fixture) ParseDiagnostics(t *testing.T) []DiagnosticExpectation {
	t.Helper()
	raw, ok := f.Expected["diagnostics.json"]
	if !ok {
		return nil
	}
	var expectations []DiagnosticExpectation
	if err := json.Unmarshal(raw, &expectations); err != nil {
		t.Fatalf("golden: parse diagnostics.json: %v", err)
	}
	return expectations
}

// Update overwrites the expected file with actual output. Used with -update flag.
func (f *Fixture) Update(t *testing.T, name string, data interface{}) {
	t.Helper()
	content, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		t.Fatalf("golden: marshal %s: %v", name, err)
	}
	content = append(content, '\n')
	expectedDir := filepath.Join(f.Dir, "expected")
	if err := os.MkdirAll(expectedDir, 0o755); err != nil {
		t.Fatalf("golden: mkdir expected: %v", err)
	}
	if err := os.WriteFile(filepath.Join(expectedDir, name), content, 0o644); err != nil {
		t.Fatalf("golden: write %s: %v", name, err)
	}
}
