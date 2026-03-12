package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/LukasParke/gossip/protocol"
)

const commentMarker = "<!-- telescope-lint -->"

// GitHubClient posts comments and reviews to GitHub PRs.
type GitHubClient struct {
	token string
	repo  string
}

type ghComment struct {
	ID   int64  `json:"id"`
	Body string `json:"body"`
}

// prFile represents a file changed in a pull request.
type prFile struct {
	Filename string `json:"filename"`
	Status   string `json:"status"` // added, modified, removed, renamed
	Patch    string `json:"patch"`
}

// reviewComment is a single inline comment in a PR review.
type reviewComment struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Side string `json:"side"` // always "RIGHT"
	Body string `json:"body"`
}

// diffInfo tracks which lines are valid for inline comments.
type diffInfo struct {
	AllLines   bool        // true for added files (all lines valid)
	ValidLines map[int]bool // valid new-side line numbers from patch
}

// NewGitHubClient creates a client from environment variables.
func NewGitHubClient() (*GitHubClient, error) {
	token := os.Getenv("GITHUB_TOKEN")
	if token == "" {
		return nil, fmt.Errorf("GITHUB_TOKEN not set")
	}
	repo := os.Getenv("GITHUB_REPOSITORY")
	if repo == "" {
		return nil, fmt.Errorf("GITHUB_REPOSITORY not set")
	}
	return &GitHubClient{token: token, repo: repo}, nil
}

// PostComment posts a comment on a PR.
func (c *GitHubClient) PostComment(prNumber int, body string) error {
	reqURL := fmt.Sprintf("https://api.github.com/repos/%s/issues/%d/comments", c.repo, prNumber)
	payload, _ := json.Marshal(map[string]string{"body": body})

	req, err := http.NewRequest("POST", reqURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("GitHub API error: %s", resp.Status)
	}
	return nil
}

// ListComments retrieves comments on a PR, following pagination up to 5 pages.
func (c *GitHubClient) ListComments(prNumber int) ([]ghComment, error) {
	var all []ghComment
	for page := 1; page <= 5; page++ {
		reqURL := fmt.Sprintf("https://api.github.com/repos/%s/issues/%d/comments?per_page=100&page=%d",
			c.repo, prNumber, page)
		req, err := http.NewRequest("GET", reqURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+c.token)
		req.Header.Set("Accept", "application/vnd.github+json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode >= 400 {
			resp.Body.Close()
			return nil, fmt.Errorf("GitHub API error: %s", resp.Status)
		}
		var comments []ghComment
		if err := json.NewDecoder(resp.Body).Decode(&comments); err != nil {
			resp.Body.Close()
			return nil, err
		}
		resp.Body.Close()

		all = append(all, comments...)
		if len(comments) < 100 {
			break
		}
	}
	return all, nil
}

// UpdateComment updates an existing comment by ID.
func (c *GitHubClient) UpdateComment(commentID int64, body string) error {
	reqURL := fmt.Sprintf("https://api.github.com/repos/%s/issues/comments/%d", c.repo, commentID)
	payload, _ := json.Marshal(map[string]string{"body": body})

	req, err := http.NewRequest("PATCH", reqURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("GitHub API error: %s", resp.Status)
	}
	return nil
}

// UpsertComment creates or updates a Telescope comment on a PR.
// It searches for an existing comment with the telescope marker and updates it,
// or creates a new one if none exists.
func (c *GitHubClient) UpsertComment(prNumber int, body string) error {
	comments, err := c.ListComments(prNumber)
	if err != nil {
		// Fall back to creating a new comment if listing fails.
		return c.PostComment(prNumber, body)
	}
	for _, comment := range comments {
		if strings.Contains(comment.Body, commentMarker) {
			return c.UpdateComment(comment.ID, body)
		}
	}
	return c.PostComment(prNumber, body)
}

// ListPRFiles retrieves files changed in a PR with pagination.
func (c *GitHubClient) ListPRFiles(prNumber int) ([]prFile, error) {
	var all []prFile
	for page := 1; page <= 10; page++ {
		reqURL := fmt.Sprintf("https://api.github.com/repos/%s/pulls/%d/files?per_page=100&page=%d",
			c.repo, prNumber, page)
		req, err := http.NewRequest("GET", reqURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+c.token)
		req.Header.Set("Accept", "application/vnd.github+json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode >= 400 {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return nil, fmt.Errorf("GitHub API error: %s: %s", resp.Status, body)
		}
		var files []prFile
		if err := json.NewDecoder(resp.Body).Decode(&files); err != nil {
			resp.Body.Close()
			return nil, err
		}
		resp.Body.Close()

		all = append(all, files...)
		if len(files) < 100 {
			break
		}
	}
	return all, nil
}

// CreateReview posts a pull request review with inline comments.
func (c *GitHubClient) CreateReview(prNumber int, commitSHA, body string, comments []reviewComment) error {
	type reviewPayload struct {
		CommitID string          `json:"commit_id"`
		Body     string          `json:"body"`
		Event    string          `json:"event"`
		Comments []reviewComment `json:"comments"`
	}
	payload, err := json.Marshal(reviewPayload{
		CommitID: commitSHA,
		Body:     body,
		Event:    "COMMENT",
		Comments: comments,
	})
	if err != nil {
		return err
	}

	reqURL := fmt.Sprintf("https://api.github.com/repos/%s/pulls/%d/reviews", c.repo, prNumber)
	req, err := http.NewRequest("POST", reqURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GitHub API error: %s: %s", resp.Status, respBody)
	}
	return nil
}

// hunkRe matches unified diff hunk headers: @@ -a,b +c,d @@
var hunkRe = regexp.MustCompile(`^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@`)

// parsePatchLines parses a unified diff patch and returns the set of valid
// new-side line numbers (lines that appear in the diff as context or additions).
func parsePatchLines(patch string) map[int]bool {
	valid := make(map[int]bool)
	lines := strings.Split(patch, "\n")
	lineNum := 0
	inHunk := false

	for _, line := range lines {
		if m := hunkRe.FindStringSubmatch(line); m != nil {
			start, _ := strconv.Atoi(m[1])
			lineNum = start
			inHunk = true
			continue
		}
		if !inHunk {
			continue
		}
		if strings.HasPrefix(line, "-") {
			// Removed line — does not exist on new side.
			continue
		}
		if strings.HasPrefix(line, "+") || strings.HasPrefix(line, " ") {
			valid[lineNum] = true
			lineNum++
		} else if line == "" {
			// Empty line in diff context.
			valid[lineNum] = true
			lineNum++
		}
	}
	return valid
}

// buildDiffMap creates a map from filename to diff info for all changed files.
func buildDiffMap(files []prFile) map[string]diffInfo {
	m := make(map[string]diffInfo, len(files))
	for _, f := range files {
		if f.Status == "removed" {
			continue
		}
		if f.Status == "added" {
			m[f.Filename] = diffInfo{AllLines: true}
		} else {
			m[f.Filename] = diffInfo{ValidLines: parsePatchLines(f.Patch)}
		}
	}
	return m
}

// GeneratePRComment creates a markdown comment body from a lint report,
// grouped by rule with clickable GitHub links.
func GeneratePRComment(report *LintReport, repo, headRef string) string {
	var sb strings.Builder
	sb.WriteString(commentMarker + "\n")
	sb.WriteString("## 🔭 Telescope\n\n")

	if report.DiagnosticCount == 0 {
		sb.WriteString("✅ **No issues found** — all OpenAPI files pass validation.\n\n")
		sb.WriteString("---\n")
		sb.WriteString("<sub>🔭 <a href=\"https://github.com/sailpoint-oss/telescope\">Telescope</a></sub>\n")
		return sb.String()
	}

	// Summary table.
	sb.WriteString("| 🔴 Errors | 🟡 Warnings | 🔵 Info | Total |\n")
	sb.WriteString("| :---: | :---: | :---: | :---: |\n")
	fmt.Fprintf(&sb, "| %d | %d | %d | %d |\n\n",
		report.Counts.Error, report.Counts.Warning,
		report.Counts.Info+report.Counts.Hint, report.DiagnosticCount)

	// Determine the base path for relativization.
	relBase := report.RepoRoot
	if relBase == "" {
		relBase = report.Workspace
	}

	canLink := repo != "" && headRef != ""

	// Group diagnostics by rule.
	type ruleDiag struct {
		severity protocol.DiagnosticSeverity
		relPath  string
		line     int
		message  string
	}
	byRule := make(map[string][]ruleDiag)
	for _, fd := range report.Files {
		rel, err := filepath.Rel(relBase, fd.Path)
		if err != nil {
			rel = fd.Path
		}
		rel = filepath.ToSlash(rel)
		for _, d := range fd.Diagnostics {
			code := ""
			if d.Code != nil {
				code = fmt.Sprintf("%v", d.Code)
			}
			byRule[code] = append(byRule[code], ruleDiag{
				severity: d.Severity,
				relPath:  rel,
				line:     int(d.Range.Start.Line) + 1,
				message:  d.Message,
			})
		}
	}

	// Sort rules: errors-first, then by count descending.
	type ruleGroup struct {
		code    string
		diags   []ruleDiag
		errors  int
		warns   int
		infos   int
	}
	var groups []ruleGroup
	for code, diags := range byRule {
		g := ruleGroup{code: code, diags: diags}
		for _, d := range diags {
			switch d.severity {
			case protocol.SeverityError:
				g.errors++
			case protocol.SeverityWarning:
				g.warns++
			default:
				g.infos++
			}
		}
		groups = append(groups, g)
	}
	sort.Slice(groups, func(i, j int) bool {
		// Errors first.
		if groups[i].errors != groups[j].errors {
			return groups[i].errors > groups[j].errors
		}
		return len(groups[i].diags) > len(groups[j].diags)
	})

	for _, g := range groups {
		label := g.code
		if label == "" {
			label = "(no rule)"
		}
		fmt.Fprintf(&sb, "<details>\n<summary>%s <code>%s</code> — %d issue(s)",
			severityEmoji(g.diags[0].severity), label, len(g.diags))
		if g.errors > 0 || g.warns > 0 {
			sb.WriteString(" (")
			parts := []string{}
			if g.errors > 0 {
				parts = append(parts, fmt.Sprintf("%d errors", g.errors))
			}
			if g.warns > 0 {
				parts = append(parts, fmt.Sprintf("%d warnings", g.warns))
			}
			if g.infos > 0 {
				parts = append(parts, fmt.Sprintf("%d info", g.infos))
			}
			sb.WriteString(strings.Join(parts, ", "))
			sb.WriteString(")")
		}
		sb.WriteString("</summary>\n\n")

		sb.WriteString("| | File | Line | Message |\n")
		sb.WriteString("| --- | --- | ---: | --- |\n")
		for _, d := range g.diags {
			emoji := severityEmoji(d.severity)
			msg := strings.ReplaceAll(d.message, "|", "\\|")
			msg = strings.ReplaceAll(msg, "\n", " ")

			fileRef := fmt.Sprintf("`%s`", d.relPath)
			lineRef := fmt.Sprintf("L%d", d.line)
			if canLink {
				blobURL := fmt.Sprintf("https://github.com/%s/blob/%s/%s", repo, headRef, d.relPath)
				fileRef = fmt.Sprintf("[`%s`](%s)", d.relPath, blobURL)
				lineRef = fmt.Sprintf("[L%d](%s#L%d)", d.line, blobURL, d.line)
			}

			fmt.Fprintf(&sb, "| %s | %s | %s | %s |\n", emoji, fileRef, lineRef, msg)
		}
		sb.WriteString("\n</details>\n\n")
	}

	sb.WriteString("---\n")
	sb.WriteString("<sub>🔭 <a href=\"https://github.com/sailpoint-oss/telescope\">Telescope</a></sub>\n")

	return sb.String()
}

func severityEmoji(s protocol.DiagnosticSeverity) string {
	switch s {
	case protocol.SeverityError:
		return "🔴"
	case protocol.SeverityWarning:
		return "🟡"
	case protocol.SeverityInformation:
		return "🔵"
	case protocol.SeverityHint:
		return "⚪"
	default:
		return "⚪"
	}
}
