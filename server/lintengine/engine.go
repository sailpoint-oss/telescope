package lintengine

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"unsafe"

	ts_yaml "github.com/tree-sitter-grammars/tree-sitter-yaml/bindings/go"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_json "github.com/tree-sitter/tree-sitter-json/bindings/go"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/lsp"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/plugin"
	"github.com/sailpoint-oss/telescope/server/project"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/rules/analyzers"
	"github.com/sailpoint-oss/telescope/server/rules/checks"
	"github.com/sailpoint-oss/telescope/server/rulesets"
)

var (
	yamlLang = tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	jsonLang = tree_sitter.NewLanguage(unsafe.Pointer(ts_json.Language()))
)

type Options struct {
	Paths       []string
	WorkingDir  string
	ConfigPath  string
	RulesetPath string

	MinSeverity   protocol.DiagnosticSeverity
	NoExternalLSP bool

	PluginPaths   []string
	Include       []string
	Exclude       []string
	TargetVersion string
}

type FileDiagnostics struct {
	Path        string
	Diagnostics []protocol.Diagnostic
}

type RunResult struct {
	Workspace string
	Files     []string
	Results   []FileDiagnostics
}

func Run(ctx context.Context, opts Options, logger *slog.Logger) (*RunResult, error) {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	}

	cfg, err := loadConfig(opts)
	if err != nil {
		return nil, err
	}

	paths := opts.Paths
	if len(paths) == 0 {
		paths = []string{"."}
	}
	files, err := collectFiles(paths, cfg)
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return &RunResult{Workspace: opts.WorkingDir, Files: files}, nil
	}

	allAnalyzers, allChecks := rules.CollectAll(analyzers.RegisterAll, checks.RegisterAll)
	enabledRules := cfg.BuildEnabledRules()
	sevOverrides := buildSeverityOverrides(cfg)
	allAnalyzers = filterAnalyzers(allAnalyzers, enabledRules)
	allChecks = filterChecks(allChecks, enabledRules)

	pluginHost := plugin.NewHost(logger)
	pluginDir := filepath.Join(opts.WorkingDir, ".telescope", "plugins")
	if err := pluginHost.Discover(pluginDir); err != nil {
		logger.Warn("failed to discover plugins", "error", err)
	}
	for _, p := range cfg.Plugins {
		pluginPath := p
		if !filepath.IsAbs(pluginPath) {
			pluginPath = filepath.Join(opts.WorkingDir, pluginPath)
		}
		if err := pluginHost.LoadPlugin(pluginPath); err != nil {
			logger.Warn("failed to load plugin", "path", p, "error", err)
		}
	}
	for _, p := range opts.PluginPaths {
		pluginPath := p
		if !filepath.IsAbs(pluginPath) {
			pluginPath = filepath.Join(opts.WorkingDir, pluginPath)
		}
		if err := pluginHost.LoadPlugin(pluginPath); err != nil {
			logger.Warn("failed to load plugin", "path", p, "error", err)
		}
	}
	defer pluginHost.Shutdown()

	var childLinter *lsp.ChildLSPLinter
	if !opts.NoExternalLSP && lsp.NodeAvailable() {
		rootURI := pathToFileURI(opts.WorkingDir)
		childLinter = lsp.NewChildLSPLinter(logger)
		if err := childLinter.Start(ctx, rootURI); err != nil {
			logger.Warn("child language servers unavailable; continuing without external LSP diagnostics", "error", err)
			childLinter = nil
		}
	}
	if childLinter != nil {
		defer childLinter.Stop(ctx)
	}

	projectContexts := buildProjectContexts(files, logger)
	var allDiags []FileDiagnostics

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", file, err)
		}
		diags := lintFile(file, content, cfg, allAnalyzers, allChecks, projectContexts, childLinter)
		diags = filterDisabledDiagnostics(diags, enabledRules)
		if pluginHost.PluginCount() > 0 {
			pluginResp := pluginHost.AnalyzeDirect(file, content)
			diags = append(diags, pluginResp...)
		}
		diags = applySeverityOverrides(diags, sevOverrides)
		if opts.MinSeverity > 0 {
			diags = filterBySeverity(diags, opts.MinSeverity)
		}
		if len(diags) > 0 {
			allDiags = append(allDiags, FileDiagnostics{Path: file, Diagnostics: diags})
		}
	}

	return &RunResult{
		Workspace: opts.WorkingDir,
		Files:     files,
		Results:   allDiags,
	}, nil
}

func loadConfig(opts Options) (*config.Config, error) {
	var cfg *config.Config
	var err error
	if opts.ConfigPath != "" {
		cfg, err = config.LoadFile(opts.ConfigPath)
	} else {
		cfg, err = config.Load(opts.WorkingDir)
	}
	if err != nil {
		return nil, err
	}
	if opts.RulesetPath != "" {
		rs, rsErr := rulesets.LoadFile(opts.RulesetPath)
		if rsErr != nil {
			return nil, fmt.Errorf("load ruleset %s: %w", opts.RulesetPath, rsErr)
		}
		if cfg.Rules == nil {
			cfg.Rules = make(map[string]string)
		}
		for id, def := range rs.Rules {
			cfg.Rules[id] = def.Severity
		}
	}
	if len(opts.Include) > 0 {
		cfg.Include = opts.Include
	}
	if len(opts.Exclude) > 0 {
		cfg.Exclude = opts.Exclude
	}
	if opts.TargetVersion != "" {
		cfg.OpenAPI.TargetVersion = opts.TargetVersion
	}
	return cfg, nil
}

func lintFile(path string, content []byte, cfg *config.Config, allAnalyzers []rules.NamedAnalyzer, allChecks []rules.NamedCheck, projectContexts map[string]*project.ProjectContext, childLinter *lsp.ChildLSPLinter) []protocol.Diagnostic {
	format := openapi.FormatFromURI(path)
	if format == openapi.FormatUnknown {
		return nil
	}
	uri := pathToFileURI(path)
	langID := langIDForPath(path)

	var childDiags []protocol.Diagnostic
	var childWg sync.WaitGroup
	if childLinter != nil && langID != "" {
		childWg.Add(1)
		go func() {
			defer childWg.Done()
			childDiags = childLinter.LintFile(context.Background(), protocol.DocumentURI(uri), langID, content)
		}()
	}

	idx := openapi.ParseAndIndex(content)
	tree, lang := parseTreeSitter(path, content)
	defer func() {
		if tree != nil {
			tree.Close()
		}
	}()

	var analyzerOpts []rules.AnalyzerOption
	if cfg.OpenAPI.TargetVersion != "" {
		analyzerOpts = append(analyzerOpts, rules.WithTargetVersion(openapi.Version(cfg.OpenAPI.TargetVersion)))
	}
	diags := adapt.DiagnosticsToProtocol(rules.RunAnalyzers(allAnalyzers, idx, uri, tree, analyzerOpts...))
	if tree != nil && lang != nil {
		diags = append(diags, adapt.DiagnosticsToProtocol(rules.RunChecks(allChecks, tree, lang))...)
	}
	if idx != nil && idx.Document != nil {
		if pctx := findProjectContext(uri, projectContexts); pctx != nil {
			diags = suppressResolvableUnresolvedRefs(diags, uri, pctx)
			diags = append(diags, diagnoseUnresolvedRefs(uri, idx, pctx)...)
		}
	}
	childWg.Wait()
	diags = append(diags, childDiags...)
	return diags
}

func parseTreeSitter(path string, content []byte) (*treesitter.Tree, *tree_sitter.Language) {
	ext := strings.ToLower(filepath.Ext(path))
	var lang *tree_sitter.Language
	switch ext {
	case ".yaml", ".yml":
		lang = yamlLang
	case ".json":
		lang = jsonLang
	default:
		return nil, nil
	}
	parser := tree_sitter.NewParser()
	if err := parser.SetLanguage(lang); err != nil {
		parser.Close()
		return nil, nil
	}
	raw := parser.Parse(content, nil)
	parser.Close()
	if raw == nil {
		return nil, nil
	}
	return treesitter.NewTree(raw, content), lang
}

func buildProjectContexts(files []string, logger *slog.Logger) map[string]*project.ProjectContext {
	contexts := make(map[string]*project.ProjectContext)
	for _, file := range files {
		abs, _ := filepath.Abs(file)
		data, err := os.ReadFile(abs)
		if err != nil {
			continue
		}
		idx := openapi.ParseAndIndex(data)
		if idx == nil || idx.Document == nil || idx.Document.DocType != openapi.DocTypeRoot {
			continue
		}
		uri := pathToFileURI(abs)
		pctx, err := project.BuildProjectContext(uri, nil, logger)
		if err != nil {
			logger.Warn("failed to build project context", "root", uri, "error", err)
			continue
		}
		contexts[uri] = pctx
	}
	return contexts
}

func findProjectContext(uri string, contexts map[string]*project.ProjectContext) *project.ProjectContext {
	if pctx, ok := contexts[uri]; ok {
		return pctx
	}
	for _, pctx := range contexts {
		if pctx.ContainsFile(uri) {
			return pctx
		}
	}
	return nil
}

func diagnoseUnresolvedRefs(uri string, idx *openapi.Index, pctx *project.ProjectContext) []protocol.Diagnostic {
	var diags []protocol.Diagnostic
	for target, usages := range idx.Refs {
		if _, err := idx.Resolve(target); err == nil {
			continue
		}
		if strings.HasPrefix(target, "#") {
			for _, usage := range usages {
				diags = append(diags, protocol.Diagnostic{
					Range:    adapt.RangeToProtocol(usage.Loc.Range),
					Severity: protocol.SeverityError,
					Source:   "unresolved-ref",
					Message:  "Cannot resolve $ref: " + target,
					Code:     "unresolved-ref",
				})
			}
			continue
		}
		if pctx.Resolver.CanResolve(uri, target) {
			continue
		}
		for _, usage := range usages {
			diags = append(diags, protocol.Diagnostic{
				Range:    adapt.RangeToProtocol(usage.Loc.Range),
				Severity: protocol.SeverityError,
				Source:   "unresolved-ref",
				Message:  "Cannot resolve $ref: " + target,
				Code:     "unresolved-ref",
			})
		}
	}
	return diags
}

func collectFiles(args []string, cfg *config.Config) ([]string, error) {
	var files []string
	for _, arg := range args {
		info, err := os.Stat(arg)
		if err != nil {
			return nil, fmt.Errorf("cannot access %s: %w", arg, err)
		}
		if info.IsDir() {
			err := filepath.Walk(arg, func(path string, info os.FileInfo, err error) error {
				if err != nil {
					return err
				}
				if info.IsDir() {
					if matchesAnyPattern(path, cfg.Exclude) {
						return filepath.SkipDir
					}
					base := filepath.Base(path)
					if base == "node_modules" || base == "vendor" || base == ".git" {
						return filepath.SkipDir
					}
					return nil
				}
				if isOpenAPIExtension(path) {
					files = append(files, path)
				}
				return nil
			})
			if err != nil {
				return nil, err
			}
		} else {
			files = append(files, arg)
		}
	}

	if len(cfg.Exclude) > 0 {
		files = filterExcluded(files, cfg.Exclude)
	}
	if len(cfg.Include) > 0 {
		files = filterIncluded(files, cfg.Include)
	}
	return files, nil
}

func isOpenAPIExtension(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".yaml" || ext == ".yml" || ext == ".json"
}

func pathToFileURI(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	u := &url.URL{Scheme: "file", Path: abs}
	return u.String()
}

func langIDForPath(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".yaml", ".yml":
		return "yaml"
	case ".json":
		return "json"
	default:
		return ""
	}
}

func filterAnalyzers(all []rules.NamedAnalyzer, enabled map[string]bool) []rules.NamedAnalyzer {
	if len(enabled) == 0 {
		return all
	}
	var out []rules.NamedAnalyzer
	for _, a := range all {
		if v, ok := enabled[a.ID]; ok && !v {
			continue
		}
		out = append(out, a)
	}
	return out
}

func filterChecks(all []rules.NamedCheck, enabled map[string]bool) []rules.NamedCheck {
	if len(enabled) == 0 {
		return all
	}
	var out []rules.NamedCheck
	for _, c := range all {
		if v, ok := enabled[c.Name]; ok && !v {
			continue
		}
		out = append(out, c)
	}
	return out
}

func buildSeverityOverrides(cfg *config.Config) map[string]protocol.DiagnosticSeverity {
	rs := rulesets.GetBuiltin(cfg.Extends)
	if rs == nil {
		rs = &rulesets.RuleSet{Rules: make(map[string]rulesets.RuleDefinition)}
	}
	for id, sev := range cfg.Rules {
		rs.Rules[id] = rulesets.RuleDefinition{Severity: sev}
	}
	overrides := rulesets.BuildSeverityOverrides(rs)
	m := make(map[string]protocol.DiagnosticSeverity, len(overrides))
	for _, o := range overrides {
		if !o.Disabled && o.Severity > 0 {
			m[o.RuleID] = protocol.DiagnosticSeverity(o.Severity)
		}
	}
	return m
}

func applySeverityOverrides(diags []protocol.Diagnostic, overrides map[string]protocol.DiagnosticSeverity) []protocol.Diagnostic {
	if len(overrides) == 0 {
		return diags
	}
	for i := range diags {
		code, _ := diags[i].Code.(string)
		if code == "" {
			continue
		}
		if sev, ok := overrides[code]; ok {
			diags[i].Severity = sev
		}
	}
	return diags
}

func filterDisabledDiagnostics(diags []protocol.Diagnostic, enabled map[string]bool) []protocol.Diagnostic {
	if len(enabled) == 0 {
		return diags
	}
	out := make([]protocol.Diagnostic, 0, len(diags))
	for _, d := range diags {
		code, _ := d.Code.(string)
		if code != "" {
			if v, ok := enabled[code]; ok && !v {
				continue
			}
		}
		out = append(out, d)
	}
	return out
}

func suppressResolvableUnresolvedRefs(diags []protocol.Diagnostic, uri string, pctx *project.ProjectContext) []protocol.Diagnostic {
	if pctx == nil {
		return diags
	}
	const prefix = "Cannot resolve $ref: "
	out := make([]protocol.Diagnostic, 0, len(diags))
	for _, d := range diags {
		code, _ := d.Code.(string)
		if code == "unresolved-ref" && strings.HasPrefix(d.Message, prefix) {
			target := strings.TrimSpace(strings.TrimPrefix(d.Message, prefix))
			if target != "" && !strings.HasPrefix(target, "#") && pctx.Resolver.CanResolve(uri, target) {
				continue
			}
		}
		out = append(out, d)
	}
	return out
}

func filterBySeverity(diags []protocol.Diagnostic, minSev protocol.DiagnosticSeverity) []protocol.Diagnostic {
	var out []protocol.Diagnostic
	for _, d := range diags {
		if d.Severity <= minSev {
			out = append(out, d)
		}
	}
	return out
}

func matchesAnyPattern(path string, patterns []string) bool {
	for _, pat := range patterns {
		if matched, _ := filepath.Match(pat, path); matched {
			return true
		}
		if matched, _ := filepath.Match(pat, filepath.Base(path)); matched {
			return true
		}
	}
	return false
}

func filterExcluded(files []string, patterns []string) []string {
	var out []string
	for _, f := range files {
		excluded := false
		for _, pat := range patterns {
			if matchGlob(pat, f) {
				excluded = true
				break
			}
		}
		if !excluded {
			out = append(out, f)
		}
	}
	return out
}

func filterIncluded(files []string, patterns []string) []string {
	var out []string
	for _, f := range files {
		for _, pat := range patterns {
			if matchGlob(pat, f) {
				out = append(out, f)
				break
			}
		}
	}
	return out
}

func matchGlob(pattern, path string) bool {
	if strings.Contains(pattern, "**") {
		basePat := strings.TrimPrefix(pattern, "**/")
		basePat = strings.TrimPrefix(basePat, "**/")
		if matched, _ := filepath.Match(basePat, filepath.Base(path)); matched {
			return true
		}
	}
	if matched, _ := filepath.Match(pattern, path); matched {
		return true
	}
	if matched, _ := filepath.Match(pattern, filepath.Base(path)); matched {
		return true
	}
	return false
}
