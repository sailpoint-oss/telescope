package overlay

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestApply_UpdatesSpec(t *testing.T) {
	dir := t.TempDir()
	specPath := filepath.Join(dir, "spec.yaml")
	overlayPath := filepath.Join(dir, "title.overlay.yaml")

	spec := `openapi: 3.0.0
info:
  title: Original Title
  version: 1.0.0
paths: {}
`
	overlay := `overlay: 1.0.0
info:
  title: Title Overlay
  version: 1.0.0
actions:
  - target: $.info
    update:
      title: Updated Title
`

	if err := os.WriteFile(specPath, []byte(spec), 0o644); err != nil {
		t.Fatalf("write spec: %v", err)
	}
	if err := os.WriteFile(overlayPath, []byte(overlay), 0o644); err != nil {
		t.Fatalf("write overlay: %v", err)
	}

	result, err := Apply(ApplyOptions{
		Spec:     DocumentInput{Path: specPath},
		Overlays: []DocumentInput{{Path: overlayPath}},
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if !strings.Contains(string(result.Content), "Updated Title") {
		t.Fatalf("expected overlay-applied output, got:\n%s", result.Content)
	}
}

func TestApply_MultipleOverlaysApplyInOrder(t *testing.T) {
	dir := t.TempDir()
	specPath := filepath.Join(dir, "spec.yaml")
	titleOverlayPath := filepath.Join(dir, "title.overlay.yaml")
	versionOverlayPath := filepath.Join(dir, "version.overlay.yaml")

	spec := `openapi: 3.0.0
info:
  title: Original Title
  version: 1.0.0
paths: {}
`
	titleOverlay := `overlay: 1.0.0
info:
  title: Title Overlay
  version: 1.0.0
actions:
  - target: $.info
    update:
      title: Updated Title
`
	versionOverlay := `overlay: 1.0.0
info:
  title: Version Overlay
  version: 1.0.0
actions:
  - target: $.info
    update:
      version: 2.0.0
`

	for path, content := range map[string]string{
		specPath:           spec,
		titleOverlayPath:   titleOverlay,
		versionOverlayPath: versionOverlay,
	} {
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}

	result, err := Apply(ApplyOptions{
		Spec: DocumentInput{Path: specPath},
		Overlays: []DocumentInput{
			{Path: titleOverlayPath},
			{Path: versionOverlayPath},
		},
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	text := string(result.Content)
	if !strings.Contains(text, "Updated Title") || !strings.Contains(text, "2.0.0") {
		t.Fatalf("expected both overlays to be applied in order, got:\n%s", text)
	}
}
