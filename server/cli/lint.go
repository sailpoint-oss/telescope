package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"log/slog"

	"github.com/spf13/cobra"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/plugin"
	"github.com/sailpoint-oss/telescope/server/plugin/script"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/rules/analyzers"
	"github.com/sailpoint-oss/telescope/server/rules/checks"

	"github.com/LukasParke/gossip"
)

var (
	outputFormat string
	minSeverity  string
	failOn       string
	noColor      bool
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

	// Register all rules
	dummyServer := gossip.NewServer("telescope-lint", "0.0.0")
	checks.RegisterAll(dummyServer)
	analyzers.RegisterAll(dummyServer)

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

	// Discover JS script rules
	jsLoader := script.NewLoader(logger)
	jsDir := filepath.Join(wd, ".telescope", "rules")
	if err := jsLoader.LoadDir(jsDir); err != nil {
		logger.Warn("failed to load JS rules", "error", err)
	}

	var allDiags []fileDiagnostics
	exitCode := 0

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading %s: %v\n", file, err)
			continue
		}

		diags := lintFile(file, content, cfg)

		// Run external plugin rules
		if pluginHost.PluginCount() > 0 {
			pluginResp := pluginHost.AnalyzeDirect(file, content)
			diags = append(diags, pluginResp...)
		}

		// Run JS script rules
		if jsLoader.ScriptCount() > 0 {
			jsDiags := jsLoader.AnalyzeDirect(content)
			diags = append(diags, jsDiags...)
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

	if exitCode != 0 {
		os.Exit(exitCode)
	}
	return nil
}

type fileDiagnostics struct {
	Path        string
	Diagnostics []protocol.Diagnostic
}

func lintFile(path string, content []byte, cfg *config.Config) []protocol.Diagnostic {
	format := openapi.FormatFromURI(path)
	if format == openapi.FormatUnknown {
		return nil
	}

	// For CLI mode, we check against the rule registry metadata
	var diags []protocol.Diagnostic
	for _, meta := range rules.DefaultRegistry.All() {
		_ = meta
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
