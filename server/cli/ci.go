package cli

import (
	"context"
	"encoding/json"
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
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/rulesets"
)

var (
	diffBase      string
	diffHead      string
	reportMD      string
	reportJSON    string
	commentPR     bool
	ciFailOn      string
	ciSeverity    string
	ciReportScope string
	ciNoExtLSP    bool
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
	cmd.Flags().StringVar(&ciSeverity, "severity", "", "Minimum severity: error, warn, info, hint")
	cmd.Flags().StringVar(&ciReportScope, "report-scope", reportScopeChanged, "Report scope: changed (graph-expanded impact) or all")
	cmd.Flags().BoolVar(&ciNoExtLSP, "no-external-lsp", false, "Deprecated no-op; retained for compatibility")

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

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	wd, _ := os.Getwd()
	repoRoot := gitRepoRoot()

	changedFiles, err := getChangedFiles(diffBase, diffHead)
	if err != nil {
		changedFiles = nil
	}

	scope, err := resolveCIScope(context.Background(), allFiles, changedFiles, ciReportScope, repoRoot, wd, logger)
	if err != nil {
		return err
	}
	if scope.FallbackReason != "" {
		fmt.Fprintf(os.Stderr, "Warning: %s\n", scope.FallbackReason)
	}

	files := scope.Files
	fmt.Fprintf(os.Stderr, "CI mode: checking %d file(s) (scope: %s, base: %s, head: %s)\n", len(files), scope.Mode, diffBase, diffHead)

	if len(files) == 0 {
		if scope.Mode == reportScopeChanged {
			fmt.Fprintln(os.Stderr, "No changed or graph-impacted OpenAPI files to lint")
		} else {
			fmt.Fprintln(os.Stderr, "No configured OpenAPI files to lint")
		}
		return nil
	}

	var minSev protocol.DiagnosticSeverity
	if ciSeverity != "" {
		if s, ok := rulesets.ParseSeverity(ciSeverity); ok && s > 0 {
			minSev = adapt.SeverityToProtocol(s)
		}
	}

	run, err := lintengine.Run(context.Background(), lintengine.Options{
		Paths:         files,
		WorkingDir:    wd,
		ConfigPath:    cfgFile,
		RulesetPath:   rulesetArg,
		MinSeverity:   minSev,
		NoExternalLSP: ciNoExtLSP,
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
	report := buildLintReport(wd, repoRoot, allDiags)
	report.Scope = scope.Metadata(len(run.Files))
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

	// Post PR comment and inline review if requested.
	if commentPR {
		if err := postPRComment(report); err != nil {
			fmt.Fprintf(os.Stderr, "Error posting PR comment: %v\n", err)
		}
		if err := postPRReview(report); err != nil {
			fmt.Fprintf(os.Stderr, "Error posting PR review: %v\n", err)
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

// gitRepoRoot returns the git repository root, or empty string on failure.
func gitRepoRoot() string {
	out, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// githubActionsPRHeadSHA returns the PR head commit SHA from the GitHub Actions
// environment. It reads GITHUB_HEAD_SHA if set, otherwise parses the event payload
// at GITHUB_EVENT_PATH when GITHUB_EVENT_NAME is pull_request.
func githubActionsPRHeadSHA() string {
	if s := os.Getenv("GITHUB_HEAD_SHA"); s != "" {
		return s
	}
	if os.Getenv("GITHUB_EVENT_NAME") != "pull_request" {
		return ""
	}
	path := os.Getenv("GITHUB_EVENT_PATH")
	if path == "" {
		return ""
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	var event struct {
		PullRequest *struct {
			Head *struct {
				SHA string `json:"sha"`
			} `json:"head"`
		} `json:"pull_request"`
	}
	if err := json.Unmarshal(data, &event); err != nil || event.PullRequest == nil || event.PullRequest.Head == nil {
		return ""
	}
	return event.PullRequest.Head.SHA
}

// parsePRNumber extracts the PR number from environment variables.
func parsePRNumber() (int, error) {
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
		return 0, fmt.Errorf("cannot determine PR number (set GITHUB_PR_NUMBER or GITHUB_REF)")
	}
	return strconv.Atoi(prNumStr)
}

// postPRComment posts a summary comment to a GitHub PR.
func postPRComment(report *LintReport) error {
	prNum, err := parsePRNumber()
	if err != nil {
		return err
	}

	client, err := NewGitHubClient()
	if err != nil {
		return err
	}

	repo := os.Getenv("GITHUB_REPOSITORY")
	headRef := os.Getenv("GITHUB_HEAD_REF")
	if headRef == "" {
		headRef = githubActionsPRHeadSHA()
	}

	bodies := GeneratePRComment(report, repo, headRef)
	return client.UpsertComments(prNum, bodies)
}

// postPRReview posts inline review comments on error-level diagnostics.
func postPRReview(report *LintReport) error {
	if report.Counts.Error == 0 {
		return nil // nothing to annotate
	}

	headSHA := githubActionsPRHeadSHA()
	if headSHA == "" {
		return fmt.Errorf("could not determine PR head SHA (set GITHUB_HEAD_SHA or run in pull_request event with GITHUB_EVENT_PATH), skipping inline review")
	}

	prNum, err := parsePRNumber()
	if err != nil {
		return err
	}

	client, err := NewGitHubClient()
	if err != nil {
		return err
	}

	// Fetch changed files in the PR.
	prFiles, err := client.ListPRFiles(prNum)
	if err != nil {
		return fmt.Errorf("listing PR files: %w", err)
	}
	diffMap := buildDiffMap(prFiles)

	relBase := report.RepoRoot
	if relBase == "" {
		relBase = report.Workspace
	}

	// Build inline comments from error-level diagnostics.
	comments := buildInlineReviewComments(report, relBase, diffMap)
	if len(comments) == 0 {
		return nil
	}

	// Build review comments, capped at 50.
	if len(comments) > 50 {
		comments = comments[:50]
	}

	err = client.CreateReview(prNum, headSHA, "", comments)
	if err != nil {
		// 422 errors are common (e.g., line not part of diff) — log and continue.
		if strings.Contains(err.Error(), "422") {
			fmt.Fprintf(os.Stderr, "Warning: GitHub rejected some inline comments: %v\n", err)
			return nil
		}
		return err
	}

	fmt.Fprintf(os.Stderr, "Posted %d inline review comment(s)\n", len(comments))
	return nil
}

func buildInlineReviewComments(report *LintReport, relBase string, diffMap map[string]diffInfo) []reviewComment {
	type lineKey struct {
		path string
		line int
	}

	grouped := make(map[lineKey][]string)
	var order []lineKey

	for _, fd := range report.Files {
		rel, err := filepath.Rel(relBase, fd.Path)
		if err != nil {
			continue
		}
		rel = filepath.ToSlash(rel)

		info, inDiff := diffMap[rel]
		if !inDiff {
			continue
		}

		for _, d := range fd.Diagnostics {
			if d.Severity != protocol.SeverityError {
				continue
			}
			line := int(d.Range.Start.Line) + 1
			if !info.AllLines && !info.ValidLines[line] {
				continue
			}

			code := ""
			if d.Code != nil {
				code = fmt.Sprintf("%v", d.Code)
			}

			docURL := ""
			if d.CodeDescription != nil {
				docURL = string(d.CodeDescription.Href)
			}
			body := formatDiagnosticMarkdown(code, d.Message, docURL)
			key := lineKey{path: rel, line: line}
			if _, exists := grouped[key]; !exists {
				order = append(order, key)
			}
			grouped[key] = append(grouped[key], body)
		}
	}

	var comments []reviewComment
	for _, key := range order {
		body := strings.Join(grouped[key], "\n\n---\n\n")
		comments = append(comments, reviewComment{
			Path: key.path,
			Line: key.line,
			Side: "RIGHT",
			Body: body,
		})
	}
	return comments
}
