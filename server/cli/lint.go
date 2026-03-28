package cli

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/LukasParke/gossip/protocol"
	"github.com/spf13/cobra"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/lintengine"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
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

func newLintCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "lint [files/dirs...]",
		Short: "Lint OpenAPI and Arazzo files",
		Long:  "Run structural validation plus configured spec rules against OpenAPI and Arazzo files.",
		RunE:  runLint,
	}

	addAnalysisFlags(cmd, true)
	return cmd
}

func newValidateCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "validate [files/dirs...]",
		Short: "Validate OpenAPI and Arazzo files",
		Long:  "Run structural and schema validation only against OpenAPI and Arazzo files.",
		RunE:  runValidate,
	}

	addAnalysisFlags(cmd, false)
	return cmd
}

func addAnalysisFlags(cmd *cobra.Command, includeBaselineFlags bool) {
	cmd.Flags().StringVarP(&outputFormat, "format", "f", "text", "Output format: text, json, sarif, github")
	cmd.Flags().StringVarP(&minSeverity, "severity", "s", "", "Minimum severity: error, warn, info, hint")
	cmd.Flags().StringVar(&failOn, "fail-on", "error", "Exit 1 on: error, warn")
	cmd.Flags().BoolVar(&noColor, "no-color", false, "Disable color output")
	cmd.Flags().StringVar(&reportMDPath, "report-md", "", "Write Markdown report to file")
	cmd.Flags().StringVar(&reportJSONPath, "report-json", "", "Write JSON report to file")
	cmd.Flags().BoolVar(&noExternalLSP, "no-external-lsp", false, "Skip child YAML/JSON language server diagnostics")
	if includeBaselineFlags {
		cmd.Flags().BoolVar(&saveBaseline, "save-baseline", false, "Save current diagnostics as baseline")
		cmd.Flags().BoolVar(&failOnNew, "fail-on-new", false, "Only fail if new diagnostics are introduced (compared to baseline)")
	}
}

func runLint(cmd *cobra.Command, args []string) error {
	return runAnalysis(args, nil)
}

func runValidate(cmd *cobra.Command, args []string) error {
	return runAnalysis(args, func(diag protocol.Diagnostic) bool {
		return diag.Source == "oas3-schema"
	})
}

type diagnosticFilter func(protocol.Diagnostic) bool

func runAnalysis(args []string, filter diagnosticFilter) error {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))

	// Parse minSeverity flag for output filtering.
	var minSev protocol.DiagnosticSeverity
	if minSeverity != "" {
		if s, ok := rulesets.ParseSeverity(minSeverity); ok && s > 0 {
			minSev = adapt.SeverityToProtocol(s)
		}
	}

	wd, _ := os.Getwd()
	run, err := lintengine.Run(context.Background(), lintengine.Options{
		Paths:         args,
		WorkingDir:    wd,
		ConfigPath:    cfgFile,
		RulesetPath:   rulesetArg,
		MinSeverity:   minSev,
		NoExternalLSP: noExternalLSP,
	}, logger)
	if err != nil {
		return err
	}
	if len(run.Files) == 0 {
		fmt.Fprintln(os.Stderr, "No API description files found")
		return nil
	}
	if filter != nil {
		run = filterRunResult(run, filter)
	}

	var allDiags []fileDiagnostics
	exitCode := 0
	for _, result := range run.Results {
		allDiags = append(allDiags, fileDiagnostics(result))
		for _, d := range result.Diagnostics {
			if shouldFail(d.Severity) {
				exitCode = 1
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
		report := buildLintReport(wd, "", allDiags)
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

func filterRunResult(run *lintengine.RunResult, keep diagnosticFilter) *lintengine.RunResult {
	if run == nil || keep == nil {
		return run
	}
	filtered := &lintengine.RunResult{
		Workspace: run.Workspace,
		Files:     append([]string(nil), run.Files...),
	}
	for _, result := range run.Results {
		var diags []protocol.Diagnostic
		for _, diag := range result.Diagnostics {
			if keep(diag) {
				diags = append(diags, diag)
			}
		}
		if len(diags) == 0 {
			continue
		}
		filtered.Results = append(filtered.Results, lintengine.FileDiagnostics{
			Path:        result.Path,
			Diagnostics: diags,
		})
	}
	return filtered
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
	var cfg *config.Config
	var err error

	if cfgFile != "" {
		cfg, err = config.LoadFile(cfgFile)
	} else {
		wd, wdErr := os.Getwd()
		if wdErr != nil {
			cfg = config.DefaultConfig()
		} else {
			cfg, err = config.Load(wd)
		}
	}
	if err != nil {
		return nil, err
	}

	// Apply --ruleset flag: load the specified ruleset file and merge its
	// rule overrides into the config.
	if rulesetArg != "" {
		rs, rsErr := rulesets.LoadFile(rulesetArg)
		if rsErr != nil {
			return nil, fmt.Errorf("load ruleset %s: %w", rulesetArg, rsErr)
		}
		if cfg.Rules == nil {
			cfg.Rules = make(map[string]string)
		}
		for id, def := range rs.Rules {
			cfg.Rules[id] = def.Severity
		}
	}

	return cfg, nil
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
