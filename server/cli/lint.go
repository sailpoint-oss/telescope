package cli

import (
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/LukasParke/gossip/protocol"
	"github.com/spf13/cobra"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/plugin"
	"github.com/sailpoint-oss/telescope/server/project"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/rules/analyzers"
)

var (
	outputFormat string
	minSeverity  string
	failOn       string
	noColor      bool
	reportMDPath string
	reportJSONPath string
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

	// Build all analyzers for CLI use via the collection mechanism
	allAnalyzers := rules.CollectAnalyzers(analyzers.RegisterAll)

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

	// Build project contexts for multi-file $ref resolution.
	// Discover roots among the files, build transitive project contexts.
	projectContexts := buildProjectContexts(files, logger)

	var allDiags []fileDiagnostics
	exitCode := 0

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading %s: %v\n", file, err)
			continue
		}

		diags := lintFile(file, content, cfg, allAnalyzers, projectContexts)

		// Run external plugin rules
		if pluginHost.PluginCount() > 0 {
			pluginResp := pluginHost.AnalyzeDirect(file, content)
			diags = append(diags, pluginResp...)
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

type fileDiagnostics struct {
	Path        string
	Diagnostics []protocol.Diagnostic
}

func lintFile(path string, content []byte, cfg *config.Config, allAnalyzers []rules.NamedAnalyzer, projectContexts map[string]*project.ProjectContext) []protocol.Diagnostic {
	format := openapi.FormatFromURI(path)
	if format == openapi.FormatUnknown {
		return nil
	}

	idx := openapi.ParseAndIndex(content)
	if idx == nil || idx.Document == nil {
		return nil
	}

	uri := pathToFileURI(path)

	// Run all semantic analyzers against the parsed index
	diags := rules.RunAnalyzers(allAnalyzers, idx, uri)

	// Run cross-file unresolved-ref diagnostics if a project context exists
	if pctx := findProjectContext(uri, projectContexts); pctx != nil {
		diags = append(diags, diagnoseUnresolvedRefs(uri, idx, pctx)...)
	}

	return diags
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
	// Direct match for root files
	if pctx, ok := contexts[uri]; ok {
		return pctx
	}
	// Search all projects for the URI
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
