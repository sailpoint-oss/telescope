package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
)

// GitHubClient posts comments and reviews to GitHub PRs.
type GitHubClient struct {
	token string
	repo  string
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
	url := fmt.Sprintf("https://api.github.com/repos/%s/issues/%d/comments", c.repo, prNumber)
	payload, _ := json.Marshal(map[string]string{"body": body})

	req, err := http.NewRequest("POST", url, bytes.NewReader(payload))
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

// GeneratePRComment creates a markdown comment body from lint results.
func GeneratePRComment(results []fileDiagnostics) string {
	if len(results) == 0 {
		return "## Telescope Lint\n\nNo OpenAPI issues found."
	}

	var sb strings.Builder
	sb.WriteString("## Telescope Lint\n\n")

	total := 0
	for _, fd := range results {
		total += len(fd.Diagnostics)
	}
	sb.WriteString(fmt.Sprintf("Found **%d issue(s)** in %d file(s).\n\n", total, len(results)))

	sb.WriteString("<details><summary>Details</summary>\n\n")
	for _, fd := range results {
		sb.WriteString(fmt.Sprintf("### %s\n", fd.Path))
		for _, d := range fd.Diagnostics {
			code := ""
			if d.Code != nil {
				code = fmt.Sprintf(" `%v`", d.Code)
			}
			sb.WriteString(fmt.Sprintf("- **L%d:** %s %s%s\n",
				d.Range.Start.Line+1, severityIcon(d.Severity), d.Message, code))
		}
		sb.WriteString("\n")
	}
	sb.WriteString("</details>\n")

	return sb.String()
}
