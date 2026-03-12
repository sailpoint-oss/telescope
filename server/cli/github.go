package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
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

// GeneratePRComment creates a markdown comment body from a lint report.
func GeneratePRComment(report *LintReport) string {
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
	sb.WriteString(fmt.Sprintf("| %d | %d | %d | %d |\n\n",
		report.Counts.Error, report.Counts.Warning,
		report.Counts.Info+report.Counts.Hint, report.DiagnosticCount))

	// Group diagnostics by file.
	type fileGroup struct {
		relPath string
		diags   []protocol.Diagnostic
	}
	var groups []fileGroup
	for _, fd := range report.Files {
		rel, err := filepath.Rel(report.Workspace, fd.Path)
		if err != nil {
			rel = fd.Path
		}
		groups = append(groups, fileGroup{relPath: rel, diags: fd.Diagnostics})
	}
	sort.Slice(groups, func(i, j int) bool {
		return len(groups[i].diags) > len(groups[j].diags)
	})

	for _, fg := range groups {
		sb.WriteString(fmt.Sprintf("<details>\n<summary>📄 <b>%s</b> — %d issue(s)</summary>\n\n",
			fg.relPath, len(fg.diags)))
		sb.WriteString("| | Rule | Line | Message |\n")
		sb.WriteString("| --- | --- | ---: | --- |\n")
		for _, d := range fg.diags {
			emoji := severityEmoji(d.Severity)
			code := ""
			if d.Code != nil {
				code = fmt.Sprintf("`%v`", d.Code)
			}
			msg := strings.ReplaceAll(d.Message, "|", "\\|")
			msg = strings.ReplaceAll(msg, "\n", " ")
			sb.WriteString(fmt.Sprintf("| %s | %s | L%d | %s |\n",
				emoji, code, d.Range.Start.Line+1, msg))
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
