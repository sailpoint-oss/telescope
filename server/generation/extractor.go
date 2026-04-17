// Package generation hosts the telescope-side OpenAPI generation loop.
//
// The loop wraps cartographer's in-process extraction API, debounces source
// file change notifications, caches the last-good result per workspace root,
// and materialises the spec to disk only when the user's config permits.
//
// Downstream consumers (LSP features, the telescope CLI, the VS Code
// extension) read from Loop.Current to obtain the authoritative in-memory
// spec bytes and its SourceMap.
package generation

import (
	"bytes"
	"context"
	"fmt"
	"time"

	"github.com/sailpoint-oss/cartographer/extraction"
	"github.com/sailpoint-oss/cartographer/sourcemap"
	"gopkg.in/yaml.v3"
)

// ExtractorOptions configures a single extraction run. Fields map onto
// cartographer's ProjectOptions plus a couple of telescope-side knobs.
type ExtractorOptions struct {
	RootDir     string
	ConfigDir   string
	Lang        string
	Template    string
	Title       string
	Version     string
	Description string
	OutputPath  string
}

// ExtractResult is the in-memory output of a single extraction.
type ExtractResult struct {
	SpecBytes   []byte
	SpecMap     map[string]interface{}
	SourceMap   *sourcemap.SourceMap
	OutputPath  string
	Operations  int
	Types       int
	GeneratedAt time.Time
	Duration    time.Duration
}

// Extractor is a thin adapter around cartographer/extraction.ExtractProject.
type Extractor struct{}

// NewExtractor constructs a new Extractor.
func NewExtractor() *Extractor { return &Extractor{} }

// Extract runs cartographer extraction and renders the result as YAML bytes,
// plus a SourceMap derived from the spec's x-source-* extensions.
//
// ctx is accepted for future cancellation support; cartographer's current API
// is synchronous so ctx is used only to abort before the run and to bound any
// post-processing.
func (e *Extractor) Extract(ctx context.Context, opts ExtractorOptions) (*ExtractResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	started := time.Now()

	projectResult, err := extraction.ExtractProject(extraction.ProjectOptions{
		ConfigDir:   opts.ConfigDir,
		RootDir:     opts.RootDir,
		OutputPath:  opts.OutputPath,
		Lang:        opts.Lang,
		Template:    opts.Template,
		Title:       opts.Title,
		Version:     opts.Version,
		Description: opts.Description,
	})
	if err != nil {
		return nil, fmt.Errorf("cartographer extract: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if projectResult == nil || projectResult.Result == nil {
		return nil, fmt.Errorf("cartographer returned empty result")
	}

	specBytes, err := marshalYAML(projectResult.SpecMap)
	if err != nil {
		return nil, fmt.Errorf("render spec yaml: %w", err)
	}
	sm := sourcemap.BuildFromSpec(projectResult.SpecMap)

	return &ExtractResult{
		SpecBytes:   specBytes,
		SpecMap:     projectResult.SpecMap,
		SourceMap:   sm,
		OutputPath:  projectResult.OutputPath,
		Operations:  projectResult.Operations,
		Types:       projectResult.Types,
		GeneratedAt: started,
		Duration:    time.Since(started),
	}, nil
}

// marshalYAML emits deterministic two-space YAML matching cartographer's own
// on-disk format.
func marshalYAML(spec map[string]interface{}) ([]byte, error) {
	var buf bytes.Buffer
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	if err := enc.Encode(spec); err != nil {
		_ = enc.Close()
		return nil, err
	}
	if err := enc.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
