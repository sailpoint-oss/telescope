package cli

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

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	ts_json "github.com/tree-sitter/tree-sitter-json/bindings/go"
	ts_yaml "github.com/tree-sitter-grammars/tree-sitter-yaml/bindings/go"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/spf13/cobra"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/lsp"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/plugin"
	"github.com/sailpoint-oss/telescope/server/project"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/rules/analyzers"
	"github.com/sailpoint-oss/telescope/server/rules/checks"
	"github.com/sailpoint-oss/telescope/server/rulesets"
)

var (
	outputFormat   string
	minSeverity    string
	failOn         string
	noColor        bool
	noExternalLSP  bool
	reportMDPath   string
	reportJSONPath string
	saveBaseline   bool
	failOnNew      bool
)

var (
	yamlLang = tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	jsonLang = tree_sitter.NewLanguage(unsafe.Pointer(ts_json.Language()))
)

func newLintCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "lint [files/dirs...]",
		Short: "Lint OpenAPI files",
		Long:  "Validate OpenAPI files against configured rules and output diagnostics.",
		RunE:  runLint,
	}

	cmd.Flags().StringVarP(&outputFormat, "format", "f", "text", "Output format: text, json, sarif, github")
	cmd.Flags().StringVarP(&minSeverity, "severity", "s", "", "Minimum severity: error, warn, info, hint")
	cmd.Flags().StringVar(&failOn, "fail-on", "error", "Exit 1 on: error, warn")
	cmd.Flags().BoolVar(&noColor, "no-color", false, "Disable color output")
	cmd.Flags().StringVar(&reportMDPath, "report-md", "", "Write Markdown report to file")
	cmd.Flags().StringVar(&reportJSONPath, "report-json", "", "Write JSON report to file")
	cmd.Flags().BoolVar(&noExternalLSP, "no-external-lsp", false, "Skip child YAML/JSON language server diagnostics")
	cmd.Flags().BoolVar(&saveBaseline, "save-baseline", false, "Save current diagnostics as baseline")
	cmd.Flags().BoolVar(&failOnNew, "fail-on-new", false, "Only fail if new diagnostics are introduced (compared to baseline)")

	return cmd
}

func runLint(cmd *cobra.Command, args []string) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}

	if len(args) == 0 {
		args = []string{"."}
	}

	files, err := collectFiles(args, cfg)
	if err != nil {
		return err
	}

	if len(files) == 0 {
		fmt.Fprintln(os.Stderr, "No OpenAPI files found")
		return nil
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))

	allAnalyzers, allChecks := rules.CollectAll(analyzers.RegisterAll, checks.RegisterAll)

	// Apply config rule overrides: filter out disabled rules and build
	// severity overrides.
	enabledRules := cfg.BuildEnabledRules()
	sevOverrides := buildSeverityOverrides(cfg)

	allAnalyzers = filterAnalyzers(allAnalyzers, enabledRules)
	allChecks = filterChecks(allChecks, enabledRules)

	// Parse minSeverity flag for output filtering.
	var minSev protocol.DiagnosticSeverity
	if minSeverity != "" {
		if s, ok := rulesets.ParseSeverity(minSeverity); ok && s > 0 {
			minSev = s
		}
	}

	// Discover external plugins
	pluginHost := plugin.NewHost(logger)
	wd, _ := os.Getwd()
	pluginDir := filepath.Join(wd, ".telescope", "plugins")
	if err := pluginHost.Discover(pluginDir); err != nil {
		logger.Warn("failed to discover plugins", "error", err)
	}
	for _, p := range cfg.Plugins {
		pluginPath := p
		if !filepath.IsAbs(pluginPath) {
			pluginPath = filepath.Join(wd, pluginPath)
		}
		if err := pluginHost.LoadPlugin(pluginPath); err != nil {
			logger.Warn("failed to load plugin", "path", p, "error", err)
		}
	}
	defer pluginHost.Shutdown()

	// Start child YAML/JSON language servers for enhanced diagnostics.
	var childLinter *lsp.ChildLSPLinter
	if !noExternalLSP && lsp.NodeAvailable() {
		rootURI := pathToFileURI(wd)
		childLinter = lsp.NewChildLSPLinter(logger)
		if err := childLinter.Start(context.Background(), rootURI); err != nil {
			logger.Warn("child language servers unavailable; continuing without external LSP diagnostics", "error", err)
			childLinter = nil
		}
	}
	if childLinter != nil {
		defer childLinter.Stop(context.Background())
	}

	// Build project contexts for multi-file $ref resolution.
	projectContexts := buildProjectContexts(files, logger)

	var allDiags []fileDiagnostics
	exitCode := 0

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading %s: %v\n", file, err)
			continue
		}

		diags := lintFile(file, content, cfg, allAnalyzers, allChecks, projectContexts, childLinter)

		// Run external plugin rules
		if pluginHost.PluginCount() > 0 {
			pluginResp := pluginHost.AnalyzeDirect(file, content)
			diags = append(diags, pluginResp...)
		}

		// Apply severity overrides from config.
		diags = applySeverityOverrides(diags, sevOverrides)

		// Filter by minimum severity if set.
		if minSev > 0 {
			diags = filterBySeverity(diags, minSev)
		}

		if len(diags) > 0 {
			allDiags = append(allDiags, fileDiagnostics{Path: file, Diagnostics: diags})
			for _, d := range diags {
				if shouldFail(d.Severity) {
					exitCode = 1
				}
			}
		}
	}

	// Baseline comparison
	if saveBaseline {
		if err := SaveBaseline(allDiags); err != nil {
			return fmt.Errorf("saving baseline: %w", err)
		}
		fmt.Fprintf(os.Stderr, "Baseline saved with %d diagnostics across %d files\n", countDiags(allDiags), len(allDiags))
	}

	if failOnNew {
		baseline, err := LoadBaseline()
		if err != nil {
			fmt.Fprintf(os.Stderr, "No baseline found (%v); comparing against empty baseline\n", err)
			baseline = &Baseline{Diagnostics: make(map[string][]DiagFingerprint)}
		}
		comp := CompareBaseline(baseline, allDiags)
		fmt.Fprintf(os.Stderr, "Baseline: %d | Current: %d | New: %d | Fixed: %d (net: %+d)\n",
			comp.BaselineCount, comp.CurrentCount, comp.NewCount, comp.FixedCount,
			comp.CurrentCount-comp.BaselineCount)

		if comp.NewCount > 0 {
			outputResults(comp.NewDiags, outputFormat)
			os.Exit(1)
		}
		fmt.Fprintln(os.Stderr, "No new diagnostics introduced")
		return nil
	}

	outputResults(allDiags, outputFormat)

	// Write reports if requested
	if reportJSONPath != "" || reportMDPath != "" {
		report := buildLintReport(wd, files, allDiags)
		if reportJSONPath != "" {
			if err := writeJSONReport(reportJSONPath, report); err != nil {
				fmt.Fprintf(os.Stderr, "Error writing JSON report: %v\n", err)
			}
		}
		if reportMDPath != "" {
			if err := writeMDReport(reportMDPath, report); err != nil {
				fmt.Fprintf(os.Stderr, "Error writing Markdown report: %v\n", err)
			}
		}
	}

	if exitCode != 0 {
		os.Exit(exitCode)
	}
	return nil
}

func countDiags(allDiags []fileDiagnostics) int {
	total := 0
	for _, fd := range allDiags {
		total += len(fd.Diagnostics)
	}
	return total
}

type fileDiagnostics struct {
	Path        string
	Diagnostics []protocol.Diagnostic
}

func lintFile(path string, content []byte, cfg *config.Config, allAnalyzers []rules.NamedAnalyzer, allChecks []rules.NamedCheck, projectContexts map[string]*project.ProjectContext, childLinter *lsp.ChildLSPLinter) []protocol.Diagnostic {
	format := openapi.FormatFromURI(path)
	if format == openapi.FormatUnknown {
		return nil
	}

	uri := pathToFileURI(path)
	langID := langIDForPath(path)

	// Start child LSP analysis in the background so it runs concurrently
	// with telescope's own analyzers and checks.
	var childDiags []protocol.Diagnostic
	var childWg sync.WaitGroup
	if childLinter != nil && langID != "" {
		childWg.Add(1)
		go func() {
			defer childWg.Done()
			childDiags = childLinter.LintFile(
				context.Background(),
				protocol.DocumentURI(uri),
				langID,
				content,
			)
		}()
	}

	var diags []protocol.Diagnostic

	idx := openapi.ParseAndIndex(content)

	tree, lang := parseTreeSitter(path, content)
	defer func() {
		if tree != nil {
			tree.Close()
		}
	}()

	// Always run analyzers -- the oas3-schema analyzer handles both root
	// documents (version-based) and fragments (heuristic-based).
	var analyzerOpts []rules.AnalyzerOption
	if cfg.OpenAPI.TargetVersion != "" {
		analyzerOpts = append(analyzerOpts, rules.WithTargetVersion(openapi.Version(cfg.OpenAPI.TargetVersion)))
	}
	diags = rules.RunAnalyzers(allAnalyzers, idx, uri, tree, analyzerOpts...)
	diags = append(diags, rules.RunChecks(allChecks, tree, lang)...)

	if idx != nil && idx.Document != nil {
		if pctx := findProjectContext(uri, projectContexts); pctx != nil {
			diags = append(diags, diagnoseUnresolvedRefs(uri, idx, pctx)...)
		}
	}

	childWg.Wait()
	diags = append(diags, childDiags...)
	return diags
}

// parseTreeSitter parses content into a tree-sitter tree based on file extension.
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

// buildProjectContexts creates ProjectContexts for root files among the
// collected files, enabling cross-file $ref resolution.
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

// findProjectContext returns the ProjectContext that contains the given URI.
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

// diagnoseUnresolvedRefs checks for $ref values that cannot be resolved within
// the project context.
func diagnoseUnresolvedRefs(uri string, idx *openapi.Index, pctx *project.ProjectContext) []protocol.Diagnostic {
	var diags []protocol.Diagnostic
	for target, usages := range idx.Refs {
		if _, err := idx.Resolve(target); err == nil {
			continue
		}
		if strings.HasPrefix(target, "#") {
			for _, usage := range usages {
				diags = append(diags, protocol.Diagnostic{
					Range:    usage.Loc.Range,
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
				Range:    usage.Loc.Range,
				Severity: protocol.SeverityError,
				Source:   "unresolved-ref",
				Message:  "Cannot resolve $ref: " + target,
				Code:     "unresolved-ref",
			})
		}
	}
	return diags
}

func shouldFail(sev protocol.DiagnosticSeverity) bool {
	switch failOn {
	case "error":
		return sev == protocol.SeverityError
	case "warn", "warning":
		return sev == protocol.SeverityError || sev == protocol.SeverityWarning
	default:
		return sev == protocol.SeverityError
	}
}

func loadConfig() (*config.Config, error) {
	if cfgFile != "" {
		return config.LoadFile(cfgFile)
	}
	wd, err := os.Getwd()
	if err != nil {
		return config.DefaultConfig(), nil
	}
	return config.Load(wd)
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

	// Apply include/exclude patterns when configured.
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

// filterAnalyzers removes analyzers whose rule ID is explicitly disabled.
func filterAnalyzers(all []rules.NamedAnalyzer, enabled map[string]bool) []rules.NamedAnalyzer {
	if len(enabled) == 0 {
		return all
	}
	var out []rules.NamedAnalyzer
	for _, a := range all {
		if v, ok := enabled[a.ID]; ok && !v {
			continue // explicitly disabled
		}
		out = append(out, a)
	}
	return out
}

// filterChecks removes checks whose name is explicitly disabled.
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

// buildSeverityOverrides creates a map of rule ID to overridden severity
// from the config's extends + rules fields.
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
			m[o.RuleID] = o.Severity
		}
	}
	return m
}

// applySeverityOverrides adjusts diagnostic severities based on config overrides.
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

// filterBySeverity keeps only diagnostics at or above the given severity.
// LSP severities are: 1=Error, 2=Warning, 3=Info, 4=Hint (lower = more severe).
func filterBySeverity(diags []protocol.Diagnostic, minSev protocol.DiagnosticSeverity) []protocol.Diagnostic {
	var out []protocol.Diagnostic
	for _, d := range diags {
		if d.Severity <= minSev {
			out = append(out, d)
		}
	}
	return out
}

// matchesAnyPattern checks if a path matches any of the given glob patterns.
func matchesAnyPattern(path string, patterns []string) bool {
	for _, pat := range patterns {
		if matched, _ := filepath.Match(pat, path); matched {
			return true
		}
		// Also try matching against just the relative path components.
		if matched, _ := filepath.Match(pat, filepath.Base(path)); matched {
			return true
		}
	}
	return false
}

// filterExcluded removes files that match any exclude pattern.
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

// filterIncluded keeps only files that match at least one include pattern.
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

// matchGlob matches a file path against a glob pattern, handling ** (double star)
// which filepath.Match doesn't support.
func matchGlob(pattern, path string) bool {
	// filepath.Match doesn't support **; strip it and match the base name
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
