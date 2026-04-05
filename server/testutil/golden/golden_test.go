package golden

import (
	"path/filepath"
	"runtime"
	"testing"
)

func testdataDir(t *testing.T) string {
	t.Helper()
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "testdata")
}

func TestLoadAll(t *testing.T) {
	fixtures := LoadAll(t, testdataDir(t))
	if len(fixtures) < 2 {
		t.Fatalf("expected at least 2 fixtures, got %d", len(fixtures))
	}
	for _, f := range fixtures {
		t.Run(f.Name, func(t *testing.T) {
			if len(f.Specs) == 0 {
				t.Error("no specs loaded")
			}
			t.Logf("fixture %s: %d specs, %d expected files", f.Name, len(f.Specs), len(f.Expected))
		})
	}
}

func TestParseDiagnostics(t *testing.T) {
	fixtures := LoadAll(t, testdataDir(t))
	for _, f := range fixtures {
		t.Run(f.Name, func(t *testing.T) {
			diags := f.ParseDiagnostics(t)
			t.Logf("fixture %s: %d expected diagnostics", f.Name, len(diags))
		})
	}
}
