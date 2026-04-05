package cli

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"

	"github.com/sailpoint-oss/telescope/server/core/graph"
)

const (
	reportScopeChanged = "changed"
	reportScopeAll     = "all"
)

type ciScopeResult struct {
	Mode              string
	Files             []string
	ChangedFileCount  int
	ImpactedFileCount int
	FallbackReason    string
}

func (r ciScopeResult) Metadata(analyzedFileCount int) *ScopeMetadata {
	return &ScopeMetadata{
		Mode:              r.Mode,
		ChangedFileCount:  r.ChangedFileCount,
		ImpactedFileCount: r.ImpactedFileCount,
		AnalyzedFileCount: analyzedFileCount,
		FallbackReason:    r.FallbackReason,
	}
}

func parseReportScope(mode string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "", reportScopeChanged:
		return reportScopeChanged, nil
	case reportScopeAll:
		return reportScopeAll, nil
	default:
		return "", fmt.Errorf("invalid --report-scope %q (want %q or %q)", mode, reportScopeChanged, reportScopeAll)
	}
}

func resolveCIScope(
	ctx context.Context,
	allFiles []string,
	changedFiles []string,
	mode string,
	repoRoot string,
	workingDir string,
	logger *slog.Logger,
) (ciScopeResult, error) {
	parsedMode, err := parseReportScope(mode)
	if err != nil {
		return ciScopeResult{}, err
	}

	configuredFiles, configuredSet, err := normalizeConfiguredFiles(allFiles, workingDir)
	if err != nil {
		return ciScopeResult{}, err
	}

	result := ciScopeResult{Mode: parsedMode}
	if parsedMode == reportScopeAll {
		result.Files = configuredFiles
		result.ImpactedFileCount = len(configuredFiles)
		return result, nil
	}

	if changedFiles == nil {
		result.Files = configuredFiles
		result.ImpactedFileCount = len(configuredFiles)
		result.FallbackReason = "git diff unavailable; analyzed all configured files"
		return result, nil
	}

	seeds, err := matchChangedFiles(changedFiles, configuredSet, repoRoot, workingDir)
	if err != nil {
		return ciScopeResult{}, err
	}
	result.ChangedFileCount = len(seeds)
	if len(seeds) == 0 {
		return result, nil
	}

	impactedFiles, err := expandGraphImpactedFiles(ctx, configuredFiles, seeds, logger)
	if err != nil {
		result.Files = configuredFiles
		result.ImpactedFileCount = len(configuredFiles)
		result.FallbackReason = fmt.Sprintf("graph scope expansion failed; analyzed all configured files: %v", err)
		return result, nil
	}

	result.Files = impactedFiles
	result.ImpactedFileCount = len(impactedFiles)
	return result, nil
}

func normalizeConfiguredFiles(files []string, workingDir string) ([]string, map[string]struct{}, error) {
	var normalized []string
	index := make(map[string]struct{}, len(files))
	for _, file := range files {
		abs, err := canonicalizePath(file, workingDir)
		if err != nil {
			return nil, nil, fmt.Errorf("normalize configured file %q: %w", file, err)
		}
		if _, seen := index[abs]; seen {
			continue
		}
		index[abs] = struct{}{}
		normalized = append(normalized, abs)
	}
	return normalized, index, nil
}

func matchChangedFiles(changedFiles []string, configuredSet map[string]struct{}, repoRoot string, workingDir string) ([]string, error) {
	baseDirs := []string{}
	if repoRoot != "" {
		baseDirs = append(baseDirs, repoRoot)
	}
	if workingDir != "" && workingDir != repoRoot {
		baseDirs = append(baseDirs, workingDir)
	}

	var matched []string
	seen := make(map[string]struct{})
	for _, changed := range changedFiles {
		changed = strings.TrimSpace(changed)
		if changed == "" {
			continue
		}

		candidates := changedPathCandidates(changed, baseDirs)
		for _, candidate := range candidates {
			abs, err := canonicalizePath(candidate, "")
			if err != nil {
				return nil, fmt.Errorf("normalize changed file %q: %w", changed, err)
			}
			if _, ok := configuredSet[abs]; !ok {
				continue
			}
			if _, dup := seen[abs]; dup {
				break
			}
			seen[abs] = struct{}{}
			matched = append(matched, abs)
			break
		}
	}
	return matched, nil
}

func changedPathCandidates(path string, baseDirs []string) []string {
	if filepath.IsAbs(path) {
		return []string{path}
	}

	candidates := make([]string, 0, len(baseDirs)+1)
	for _, base := range baseDirs {
		candidates = append(candidates, filepath.Join(base, path))
	}
	candidates = append(candidates, path)
	return candidates
}

func canonicalizePath(path string, baseDir string) (string, error) {
	if !filepath.IsAbs(path) && baseDir != "" {
		path = filepath.Join(baseDir, path)
	}
	return filepath.Abs(path)
}

func expandGraphImpactedFiles(ctx context.Context, allFiles, seedFiles []string, logger *slog.Logger) ([]string, error) {
	if logger == nil {
		logger = slog.Default()
	}

	g := graph.NewWorkspaceGraph()
	uriToPath := make(map[string]string, len(allFiles))
	pathToURI := make(map[string]string, len(allFiles))

	for _, file := range allFiles {
		src := graph.NewFilesystemSource(file, scopeClassificationHint(file))
		g.AddSource(src)
		uriToPath[src.URI()] = src.Path()
		pathToURI[src.Path()] = src.URI()
	}

	runner, err := graph.NewPipelineRunner(graph.DefaultStages(), logger)
	if err != nil {
		return nil, err
	}
	for _, file := range allFiles {
		uri := pathToURI[file]
		if err := runner.RunThrough(ctx, uri, g, graph.StageBind); err != nil {
			return nil, err
		}
	}

	impacted := make(map[string]struct{}, len(seedFiles))
	for _, seed := range seedFiles {
		uri, ok := pathToURI[seed]
		if !ok {
			continue
		}
		impacted[seed] = struct{}{}
		for _, dep := range g.TransitiveDependencies(uri) {
			if path, ok := uriToPath[dep]; ok {
				impacted[path] = struct{}{}
			}
		}
		for _, dep := range g.TransitiveDependents(uri) {
			if path, ok := uriToPath[dep]; ok {
				impacted[path] = struct{}{}
			}
		}
	}

	var files []string
	for _, file := range allFiles {
		if _, ok := impacted[file]; ok {
			files = append(files, file)
		}
	}
	return files, nil
}

func scopeClassificationHint(path string) graph.ClassificationHint {
	hint := graph.ClassificationHint{IsOpenAPI: true}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".yaml", ".yml":
		hint.LanguageID = "yaml"
	case ".json":
		hint.LanguageID = "json"
	}
	return hint
}

func scopeModeLabel(scope *ScopeMetadata) string {
	if scope == nil {
		return ""
	}
	switch scope.Mode {
	case reportScopeChanged:
		return "changed (graph-expanded)"
	case reportScopeAll:
		return "all configured files"
	default:
		return scope.Mode
	}
}
