package overlay

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/pb33f/libopenapi"
	"github.com/pb33f/libopenapi/datamodel"
)

type DocumentInput struct {
	Path  string
	Bytes []byte
}

type ApplyOptions struct {
	Spec     DocumentInput
	Overlays []DocumentInput
}

type ApplyResult struct {
	Content  []byte
	Warnings []string
}

func Apply(opts ApplyOptions) (*ApplyResult, error) {
	specPath := strings.TrimSpace(opts.Spec.Path)
	if specPath == "" {
		return nil, fmt.Errorf("overlay: spec path is required")
	}
	if len(opts.Overlays) == 0 {
		return nil, fmt.Errorf("overlay: at least one overlay is required")
	}

	absSpecPath, err := filepath.Abs(specPath)
	if err != nil {
		return nil, fmt.Errorf("overlay: resolve spec path: %w", err)
	}
	specBytes := opts.Spec.Bytes
	if len(specBytes) == 0 {
		specBytes, err = os.ReadFile(absSpecPath)
		if err != nil {
			return nil, fmt.Errorf("overlay: read spec: %w", err)
		}
	}

	cfg := datamodel.NewDocumentConfiguration()
	cfg.BasePath = filepath.Dir(absSpecPath)
	cfg.SpecFilePath = filepath.Base(absSpecPath)
	cfg.AllowFileReferences = true
	cfg.ExtractRefsSequentially = true

	current := specBytes
	var warnings []string
	for _, overlayInput := range opts.Overlays {
		overlayPath := strings.TrimSpace(overlayInput.Path)
		if overlayPath == "" {
			return nil, fmt.Errorf("overlay: overlay path is required")
		}
		overlayBytes := overlayInput.Bytes
		if len(overlayBytes) == 0 {
			overlayBytes, err = os.ReadFile(overlayPath)
			if err != nil {
				return nil, fmt.Errorf("overlay: read %s: %w", overlayPath, err)
			}
		}

		doc, err := libopenapi.NewDocumentWithConfiguration(current, cfg)
		if err != nil {
			return nil, fmt.Errorf("overlay: parse target spec: %w", err)
		}
		overlayDoc, err := libopenapi.NewOverlayDocument(overlayBytes)
		if err != nil {
			return nil, fmt.Errorf("overlay: parse %s: %w", overlayPath, err)
		}
		result, err := libopenapi.ApplyOverlay(doc, overlayDoc)
		if err != nil {
			return nil, fmt.Errorf("overlay: apply %s: %w", overlayPath, err)
		}
		current = result.Bytes
		for _, warning := range result.Warnings {
			if warning == nil {
				continue
			}
			warnings = append(warnings, fmt.Sprintf("%s: %s", overlayPath, warning.String()))
		}
	}

	return &ApplyResult{
		Content:  current,
		Warnings: warnings,
	}, nil
}
