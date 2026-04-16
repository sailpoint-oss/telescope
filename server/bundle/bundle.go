package bundle

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/pb33f/libopenapi/bundler"
	"github.com/pb33f/libopenapi/datamodel"
	"gopkg.in/yaml.v3"
)

type Mode string

const (
	ModeComposed Mode = "composed"
	ModeInline   Mode = "inline"
)

type Options struct {
	RootPath  string
	RootBytes []byte
	Files     map[string][]byte
	Mode      Mode
	JSON      bool
}

type Result struct {
	Content  []byte
	Warnings []string
}

func Bundle(opts Options) (*Result, error) {
	rootPath := strings.TrimSpace(opts.RootPath)
	if rootPath == "" {
		return nil, fmt.Errorf("bundle: root path is required")
	}
	absRoot, err := filepath.Abs(rootPath)
	if err != nil {
		return nil, fmt.Errorf("bundle: resolve root path: %w", err)
	}
	rootBytes := opts.RootBytes
	if len(rootBytes) == 0 {
		rootBytes, err = os.ReadFile(absRoot)
		if err != nil {
			return nil, fmt.Errorf("bundle: read root spec: %w", err)
		}
	}

	basePath := filepath.Dir(absRoot)
	specFilePath := filepath.Base(absRoot)
	cleanup := func() {}
	if len(opts.Files) > 0 {
		basePath, specFilePath, cleanup, err = stageFiles(absRoot, rootBytes, opts.Files)
		if err != nil {
			return nil, err
		}
	}
	defer cleanup()

	cfg := datamodel.NewDocumentConfiguration()
	cfg.BasePath = basePath
	cfg.SpecFilePath = specFilePath
	cfg.AllowFileReferences = true
	cfg.ExtractRefsSequentially = true

	mode := opts.Mode
	if mode == "" {
		mode = ModeComposed
	}

	var (
		bundled  []byte
		warnings []string
	)
	switch mode {
	case ModeComposed:
		bundled, err = bundler.BundleBytesComposed(rootBytes, cfg, nil)
	case ModeInline:
		bundled, err = bundler.BundleBytes(rootBytes, cfg)
	default:
		return nil, fmt.Errorf("bundle: unsupported mode %q", mode)
	}
	if len(bundled) == 0 && err != nil {
		return nil, err
	}
	if err != nil {
		warnings = append(warnings, err.Error())
	}

	if opts.JSON {
		bundled, err = toJSON(bundled)
		if err != nil {
			return nil, fmt.Errorf("bundle: convert bundled output to json: %w", err)
		}
	}
	return &Result{Content: bundled, Warnings: warnings}, nil
}

func stageFiles(rootPath string, rootBytes []byte, files map[string][]byte) (string, string, func(), error) {
	staged := map[string][]byte{
		rootPath: rootBytes,
	}
	paths := []string{rootPath}
	for path, raw := range files {
		absPath, err := filepath.Abs(path)
		if err != nil {
			return "", "", nil, fmt.Errorf("bundle: resolve staged path %q: %w", path, err)
		}
		staged[absPath] = raw
		paths = append(paths, absPath)
	}

	base := commonBase(paths)
	tmpDir, err := os.MkdirTemp("", "telescope-bundle-*")
	if err != nil {
		return "", "", nil, fmt.Errorf("bundle: create staging dir: %w", err)
	}

	for path, raw := range staged {
		rel, err := filepath.Rel(base, path)
		if err != nil {
			os.RemoveAll(tmpDir)
			return "", "", nil, fmt.Errorf("bundle: compute staged path: %w", err)
		}
		target := filepath.Join(tmpDir, rel)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			os.RemoveAll(tmpDir)
			return "", "", nil, fmt.Errorf("bundle: create staged directory: %w", err)
		}
		if err := os.WriteFile(target, raw, 0o644); err != nil {
			os.RemoveAll(tmpDir)
			return "", "", nil, fmt.Errorf("bundle: write staged file: %w", err)
		}
	}

	rootRel, err := filepath.Rel(base, rootPath)
	if err != nil {
		os.RemoveAll(tmpDir)
		return "", "", nil, fmt.Errorf("bundle: compute staged root path: %w", err)
	}
	stagedRoot := filepath.Join(tmpDir, rootRel)
	return filepath.Dir(stagedRoot), filepath.Base(stagedRoot), func() { _ = os.RemoveAll(tmpDir) }, nil
}

func commonBase(paths []string) string {
	if len(paths) == 0 {
		return ""
	}
	base := filepath.Dir(paths[0])
	for _, path := range paths[1:] {
		for !containsPath(base, path) {
			parent := filepath.Dir(base)
			if parent == base {
				return base
			}
			base = parent
		}
	}
	return base
}

func containsPath(base, target string) bool {
	rel, err := filepath.Rel(base, target)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator))
}

func toJSON(data []byte) ([]byte, error) {
	var doc any
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, err
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, err
	}
	if len(out) == 0 || out[len(out)-1] != '\n' {
		out = append(out, '\n')
	}
	return out, nil
}
