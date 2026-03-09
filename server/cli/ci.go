package cli

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/LukasParke/gossip/protocol"
	"github.com/spf13/cobra"

	"github.com/sailpoint-oss/telescope/server/lsp"
	"github.com/sailpoint-oss/telescope/server/plugin"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/rules/analyzers"
	"github.com/sailpoint-oss/telescope/server/rules/checks"
)

var (
	diffBase   string
	diffHead   string
	reportMD   string
	reportJSON string
	commentPR  bool
	ciFailOn   string
)

func newCICmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "ci",
		Short: "Run CI-mode linting with diff awareness",
		Long:  "Lint OpenAPI files with diff-aware checking, quality gating, and optional GitHub PR integration.",
		RunE:  runCI,
	}

	cmd.Flags().StringVar(&diffBase, "diff-base", "main", "Git ref for base")
	cmd.Flags().StringVar(&diffHead, "diff-head", "HEAD", "Git ref for head")
	cmd.Flags().StringVar(&reportMD, "report-md", "", "Write markdown report to file")
	cmd.Flags().StringVar(&reportJSON, "report-json", "", "Write JSON report to file")
	cmd.Flags().BoolVar(&commentPR, "comment-pr", false, "Post comment to GitHub PR (requires GITHUB_TOKEN)")
	cmd.Flags().StringVar(&ciFailOn, "fail-on", "error", "Quality gate severity")

	return cmd
}

func runCI(cmd *cobra.Command, args []string) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}

	roots := args
	if len(roots) == 0 {
		roots = []string{"."}
	}

	// Collect all OpenAPI files in the workspace.
	allFiles, err := collectFiles(roots, cfg)
	if err != nil {
		return err
	}

	if len(allFiles) == 0 {
		fmt.Fprintln(os.Stderr, "No OpenAPI files found")
		return nil
	}

	// Get changed files between diff-base and diff-head.
	changedFiles, err := getChangedFiles(diffBase, diffHead)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: could not get git diff, linting all files: %v\n", err)
		changedFiles = nil // lint all files
	}

	// Intersect changed files with OpenAPI files.
	var files []string
	if changedFiles != nil {
		changedSet := make(map[string]bool, len(changedFiles))
		for _, f := range changedFiles {
			abs, _ := filepath.Abs(f)
			changedSet[abs] = true
		}
		for _, f := range allFiles {
			abs, _ := filepath.Abs(f)
			if changedSet[abs] {
				files = append(files, f)
			}
		}
	} else {
		files = allFiles
	}

	fmt.Fprintf(os.Stderr, "CI mode: checking %d file(s) (base: %s, head: %s)\n", len(files), diffBase, diffHead)

	if len(files) == 0 {
		fmt.Fprintln(os.Stderr, "No changed OpenAPI files to lint")
		return nil
	}

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))

	allAnalyzers, allChecks := rules.CollectAll(analyzers.RegisterAll, checks.RegisterAll)

	// Apply config rule overrides.
	enabledRules := cfg.BuildEnabledRules()
	sevOverrides := buildSeverityOverrides(cfg)
	allAnalyzers = filterAnalyzers(allAnalyzers, enabledRules)
	allChecks = filterChecks(allChecks, enabledRules)

	// Discover external plugins.
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

	// Start child YAML/JSON language servers.
	var childLinter *lsp.ChildLSPLinter
	if lsp.NodeAvailable() {
		rootURI := pathToFileURI(wd)
		childLinter = lsp.NewChildLSPLinter(logger)
		if err := childLinter.Start(context.Background(), rootURI); err != nil {
			logger.Warn("child language servers unavailable", "error", err)
			childLinter = nil
		}
	}
	if childLinter != nil {
		defer childLinter.Stop(context.Background())
	}

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

		if pluginHost.PluginCount() > 0 {
			pluginResp := pluginHost.AnalyzeDirect(file, content)
			diags = append(diags, pluginResp...)
		}

		diags = applySeverityOverrides(diags, sevOverrides)

		if len(diags) > 0 {
			allDiags = append(allDiags, fileDiagnostics{Path: file, Diagnostics: diags})
			for _, d := range diags {
				if ciShouldFail(d.Severity) {
					exitCode = 1
				}
			}
		}
	}

	outputResults(allDiags, "text")

	// Write reports.
	report := buildLintReport(wd, files, allDiags)
	if reportJSON != "" {
		if err := writeJSONReport(reportJSON, report); err != nil {
			fmt.Fprintf(os.Stderr, "Error writing JSON report: %v\n", err)
		}
	}
	if reportMD != "" {
		if err := writeMDReport(reportMD, report); err != nil {
			fmt.Fprintf(os.Stderr, "Error writing Markdown report: %v\n", err)
		}
	}

	// Post PR comment if requested.
	if commentPR {
		if err := postPRComment(allDiags); err != nil {
			fmt.Fprintf(os.Stderr, "Error posting PR comment: %v\n", err)
		}
	}

	if exitCode != 0 {
		os.Exit(exitCode)
	}
	return nil
}

// getChangedFiles returns files changed between two git refs.
func getChangedFiles(base, head string) ([]string, error) {
	out, err := exec.Command("git", "diff", "--name-only", "--diff-filter=ACMR", base+"..."+head).Output()
	if err != nil {
		// Try without the merge-base syntax (works when on the same branch).
		out, err = exec.Command("git", "diff", "--name-only", "--diff-filter=ACMR", base, head).Output()
		if err != nil {
			return nil, fmt.Errorf("git diff failed: %w", err)
		}
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var files []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			files = append(files, line)
		}
	}
	return files, nil
}

func ciShouldFail(sev protocol.DiagnosticSeverity) bool {
	switch ciFailOn {
	case "error":
		return sev == protocol.SeverityError
	case "warn", "warning":
		return sev == protocol.SeverityError || sev == protocol.SeverityWarning
	default:
		return sev == protocol.SeverityError
	}
}

// postPRComment posts a summary comment to a GitHub PR.
func postPRComment(allDiags []fileDiagnostics) error {
	prNumStr := os.Getenv("GITHUB_PR_NUMBER")
	if prNumStr == "" {
		// Try to extract from GITHUB_REF (refs/pull/<num>/merge).
		ref := os.Getenv("GITHUB_REF")
		if strings.HasPrefix(ref, "refs/pull/") {
			parts := strings.Split(ref, "/")
			if len(parts) >= 3 {
				prNumStr = parts[2]
			}
		}
	}
	if prNumStr == "" {
		return fmt.Errorf("cannot determine PR number (set GITHUB_PR_NUMBER or GITHUB_REF)")
	}

	prNum, err := strconv.Atoi(prNumStr)
	if err != nil {
		return fmt.Errorf("invalid PR number %q: %w", prNumStr, err)
	}

	client, err := NewGitHubClient()
	if err != nil {
		return err
	}

	body := GeneratePRComment(allDiags)
	return client.PostComment(prNum, body)
}
