package sdk

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/LukasParke/gossip/protocol"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/lintengine"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
)

// LintResult holds diagnostics for a single linted file.
type LintResult struct {
	File        string
	URI         string
	Diagnostics []ctypes.Diagnostic
}

// LintOptions controls linting behavior.
type LintOptions struct {
	// MinSeverity filters diagnostics. Only diagnostics with severity <=
	// this value are kept (1=error, 2=warning, 3=info, 4=hint). Zero
	// means no filtering.
	MinSeverity ctypes.Severity

	// ConfigPath points to a .telescope.yaml file.
	ConfigPath string
	// RulesetPath points to a ruleset YAML file merged into config rules.
	RulesetPath string
	// WorkspaceRoot is used for config discovery and relative plugin paths.
	WorkspaceRoot string
	// NoExternalLSP disables child YAML/JSON linter diagnostics.
	NoExternalLSP bool
	// PluginPaths loads extra plugin binaries in addition to config/discovery.
	PluginPaths []string
	// Include overrides config include globs when set.
	Include []string
	// Exclude overrides config exclude globs when set.
	Exclude []string
	// TargetVersion overrides OpenAPI target version (3.0/3.1/3.2).
	TargetVersion string
}

// LintFiles runs Telescope's full rule suite against the given spec files
// and returns diagnostics per file. No external binary or Node.js needed.
func LintFiles(files []string, opts LintOptions) ([]LintResult, error) {
	workspace := opts.WorkspaceRoot
	if workspace == "" {
		if len(files) > 0 {
			workspace = filepath.Dir(files[0])
		} else {
			workspace = "."
		}
	}
	run, err := lintengine.Run(context.Background(), lintengine.Options{
		Paths:         files,
		WorkingDir:    workspace,
		ConfigPath:    opts.ConfigPath,
		RulesetPath:   opts.RulesetPath,
		MinSeverity:   protocol.DiagnosticSeverity(opts.MinSeverity),
		NoExternalLSP: opts.NoExternalLSP,
		PluginPaths:   opts.PluginPaths,
		Include:       opts.Include,
		Exclude:       opts.Exclude,
		TargetVersion: opts.TargetVersion,
	}, slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn})))
	if err != nil {
		return nil, err
	}

	resultByPath := make(map[string][]ctypes.Diagnostic, len(run.Results))
	for _, r := range run.Results {
		resultByPath[r.Path] = adapt.DiagnosticsFromProtocol(r.Diagnostics)
	}

	results := make([]LintResult, 0, len(files))
	for _, path := range files {
		absPath, _ := filepath.Abs(path)
		results = append(results, LintResult{
			File:        path,
			URI:         "file://" + absPath,
			Diagnostics: resultByPath[path],
		})
	}

	return results, nil
}

// LintContent runs Telescope's full rule suite against in-memory content.
// The uri parameter is used for diagnostic reporting.
func LintContent(uri string, content []byte) ([]ctypes.Diagnostic, error) {
	ext := filepath.Ext(uri)
	if ext == "" {
		ext = ".yaml"
	}
	dir, err := os.MkdirTemp("", "telescope-sdk-lint-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	path := filepath.Join(dir, "spec"+ext)
	if err := os.WriteFile(path, content, 0644); err != nil {
		return nil, err
	}
	results, err := LintFiles([]string{path}, LintOptions{
		WorkspaceRoot: dir,
		NoExternalLSP: true,
	})
	if err != nil {
		return nil, err
	}
	if len(results) == 0 {
		return nil, nil
	}
	return results[0].Diagnostics, nil
}
