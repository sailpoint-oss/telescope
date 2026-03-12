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

	"github.com/sailpoint-oss/telescope/server/lintengine"
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
	wd, _ := os.Getwd()

	run, err := lintengine.Run(context.Background(), lintengine.Options{
		Paths:      files,
		WorkingDir: wd,
		ConfigPath: cfgFile,
	}, logger)
	if err != nil {
		return err
	}

	var allDiags []fileDiagnostics
	exitCode := 0
	for _, result := range run.Results {
		allDiags = append(allDiags, fileDiagnostics(result))
		for _, d := range result.Diagnostics {
			if ciShouldFail(d.Severity) {
				exitCode = 1
			}
		}
	}

	outputResults(allDiags, "text")

	// Emit GitHub annotations when running in GitHub Actions.
	if os.Getenv("GITHUB_ACTIONS") == "true" {
		outputGitHub(allDiags)
	}

	// Write reports.
	report := buildLintReport(wd, allDiags)
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

	// Write GitHub step summary if available.
	if summaryPath := os.Getenv("GITHUB_STEP_SUMMARY"); summaryPath != "" {
		f, err := os.OpenFile(summaryPath, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
		if err == nil {
			_ = writeMDReportTo(f, report)
			f.Close()
		}
	}

	// Post PR comment if requested.
	if commentPR {
		if err := postPRComment(report); err != nil {
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
func postPRComment(report *LintReport) error {
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

	body := GeneratePRComment(report)
	return client.UpsertComment(prNum, body)
}
