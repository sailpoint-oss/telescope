package specs_test

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// mirroredFixtures must stay byte-identical between:
// - server/testutil/specs (canonical source for Go tests)
// - test-files/openapi (sidecar workspace fixtures)
//
// Keep this list in sync with test-files/fixture-manifest.yaml.
var mirroredFixtures = []string{
	"test-valid.yaml",
	"test-errors.yaml",
	"test-warnings.yaml",
	"test-duplicate-operation-ids.yaml",
	"test-unique-operation-ids.yaml",
	"test-root-valid.yaml",
	"test-root-errors.yaml",
	"test-ascii-errors.yaml",
	"test-multi-file.yaml",
	"missing-path-parameters.yaml",
	"api-minimal.yaml",
	"api-standalone.yaml",
	"api-v1.yaml",
	"api-v2.yaml",
	"api-v3.json",
	"api-v4.yaml",
	"api-v5.yaml",
	"openapi-3.0.yaml",
	"openapi-3.1.yaml",
	"openapi-3.2.yaml",
	"OpenAPI-example.yaml",
	"Plex-API.yaml",
}

func TestMirroredFixturesStayInSync(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("unable to resolve current file path")
	}
	specsDir := filepath.Dir(thisFile)
	testFilesOpenAPIDir := filepath.Join(specsDir, "..", "..", "..", "test-files", "openapi")

	for _, name := range mirroredFixtures {
		t.Run(name, func(t *testing.T) {
			canonicalPath := filepath.Join(specsDir, name)
			sidecarPath := filepath.Join(testFilesOpenAPIDir, name)

			canonical, err := os.ReadFile(canonicalPath)
			if err != nil {
				t.Fatalf("read canonical fixture %q: %v", canonicalPath, err)
			}
			sidecar, err := os.ReadFile(sidecarPath)
			if err != nil {
				t.Fatalf("read sidecar fixture %q: %v", sidecarPath, err)
			}

			if string(canonical) != string(sidecar) {
				t.Fatalf("fixture drift detected for %q; canonical=%q sidecar=%q", name, canonicalPath, sidecarPath)
			}
		})
	}
}
