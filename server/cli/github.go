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

const (
	commentMarkerPrefix = "<!-- telescope-lint-"
	commentMarkerSuffix = " -->"
	maxCommentSize      = 60000 // safe margin under GitHub's 65536 limit
)

// commentMarkerN returns the HTML comment marker for chunk index n (1-based).
func commentMarkerN(n int) string {
	return fmt.Sprintf("%s%d%s", commentMarkerPrefix, n, commentMarkerSuffix)
}

// telescopeCommentIndexRe extracts the chunk index from a comment body.
var telescopeCommentIndexRe = regexp.MustCompile(`<!-- telescope-lint-(\d+) -->`)

// parseMarkerIndex returns the 1-based chunk index from a comment body, and false if not found.
func parseMarkerIndex(body string) (int, bool) {
	m := telescopeCommentIndexRe.FindStringSubmatch(body)
	if len(m) < 2 {
		return 0, false
	}
	n, err := strconv.Atoi(m[1])
	if err != nil || n < 1 {
		return 0, false
	}
	return n, true
}

// isTelescopeComment reports whether the comment body is a Telescope lint comment (any chunk).
func isTelescopeComment(body string) bool {
	return strings.Contains(body, commentMarkerPrefix)
}

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

// DeleteComment deletes an issue comment by ID.
func (c *GitHubClient) DeleteComment(commentID int64) error {
	reqURL := fmt.Sprintf("https://api.github.com/repos/%s/issues/comments/%d", c.repo, commentID)
	req, err := http.NewRequest("DELETE", reqURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/vnd.github+json")

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

// indexedComment pairs a comment ID with its 1-based chunk index.
type indexedComment struct {
	id    int64
	index int
}

// UpsertComments creates or updates Telescope comments on a PR. Each element of bodies
// is one chunk (e.g. from GeneratePRComment). Existing comments with the same marker
// index are updated; extra chunks are created; leftover comments (when chunks shrink)
// are deleted.
func (c *GitHubClient) UpsertComments(prNumber int, bodies []string) error {
	if len(bodies) == 0 {
		return nil
	}

	comments, err := c.ListComments(prNumber)
	if err != nil {
		// Fall back to posting all chunks as new comments.
		for _, body := range bodies {
			if err := c.PostComment(prNumber, body); err != nil {
				return err
			}
		}
		return nil
	}

	var existing []indexedComment
	for _, comment := range comments {
		if !isTelescopeComment(comment.Body) {
			continue
		}
		idx, ok := parseMarkerIndex(comment.Body)
		if !ok {
			continue
		}
		existing = append(existing, indexedComment{id: comment.ID, index: idx})
	}
	sort.Slice(existing, func(i, j int) bool { return existing[i].index < existing[j].index })

	// existingByIndex[i] = comment ID for chunk index i (1-based).
	existingByIndex := make(map[int]int64)
	for _, e := range existing {
		existingByIndex[e.index] = e.id
	}

	for i, body := range bodies {
		idx := i + 1
		if id, ok := existingByIndex[idx]; ok {
			if err := c.UpdateComment(id, body); err != nil {
				return err
			}
		} else {
			if err := c.PostComment(prNumber, body); err != nil {
				return err
			}
		}
	}

	// Delete leftover comments when chunk count shrank.
	for _, e := range existing {
		if e.index > len(bodies) {
			if err := c.DeleteComment(e.id); err != nil {
				return err
			}
		}
	}

	return nil
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

// groupCategory returns a priority tier for rule groups (lower = higher priority).
// Order: schema violations (0), syntax errors (1), other rule violations (2).
func groupCategory(code string) int {
	switch code {
	case "json-schema", "oas3-schema":
		return 0
	case "syntax-error":
		return 1
	default:
		return 2
	}
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

const commentFooter = "---\n<sub>🔭 <a href=\"https://github.com/sailpoint-oss/telescope\">Telescope</a></sub>\n"

// GeneratePRComment creates markdown comment bodies from a lint report, grouped by rule
// with clickable GitHub links. It returns one or more chunks, each under maxCommentSize,
// split at rule-group boundaries so tables are never cut in half.
func GeneratePRComment(report *LintReport, repo, headRef string) []string {
	relBase := report.RepoRoot
	if relBase == "" {
		relBase = report.Workspace
	}
	canLink := repo != "" && headRef != ""

	if report.DiagnosticCount == 0 {
		body := commentMarkerN(1) + "\n## 🔭 Telescope\n\n"
		body += "✅ **No issues found** — all OpenAPI files pass validation.\n\n"
		body += commentFooter
		return []string{body}
	}

	// Build summary block (chunk 1 only).
	summary := "| 🔴 Errors | 🟡 Warnings | 🔵 Info | Total |\n"
	summary += "| :---: | :---: | :---: | :---: |\n"
	summary += fmt.Sprintf("| %d | %d | %d | %d |\n\n",
		report.Counts.Error, report.Counts.Warning,
		report.Counts.Info+report.Counts.Hint, report.DiagnosticCount)

	// Group diagnostics by rule.
	type ruleDiag struct {
		severity protocol.DiagnosticSeverity
		relPath  string
		line     int
		endLine  int
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
			startLine := int(d.Range.Start.Line) + 1
			endLine := int(d.Range.End.Line) + 1
			byRule[code] = append(byRule[code], ruleDiag{
				severity: d.Severity,
				relPath:  rel,
				line:     startLine,
				endLine:  endLine,
				message:  d.Message,
			})
		}
	}

	type ruleGroup struct {
		code  string
		diags []ruleDiag
	}
	var groups []ruleGroup
	for code, diags := range byRule {
		groups = append(groups, ruleGroup{code: code, diags: diags})
	}
	sort.Slice(groups, func(i, j int) bool {
		gi, gj := groups[i], groups[j]
		ci, cj := groupCategory(gi.code), groupCategory(gj.code)
		if ci != cj {
			return ci < cj
		}
		ei, ej := 0, 0
		for _, d := range gi.diags {
			if d.severity == protocol.SeverityError {
				ei++
			}
		}
		for _, d := range gj.diags {
			if d.severity == protocol.SeverityError {
				ej++
			}
		}
		if ei != ej {
			return ei > ej
		}
		wi, wj := 0, 0
		for _, d := range gi.diags {
			if d.severity == protocol.SeverityWarning {
				wi++
			}
		}
		for _, d := range gj.diags {
			if d.severity == protocol.SeverityWarning {
				wj++
			}
		}
		if wi != wj {
			return wi > wj
		}
		return len(gi.diags) > len(gj.diags)
	})

	// Build each rule group as a standalone block string.
	blocks := make([]string, 0, len(groups)+1)
	blocks = append(blocks, summary)
	for _, g := range groups {
		sort.Slice(g.diags, func(a, b int) bool {
			return g.diags[a].severity < g.diags[b].severity
		})
		label := g.code
		if label == "" {
			label = "(no rule)"
		}
		errors, warns, infos := 0, 0, 0
		for _, d := range g.diags {
			switch d.severity {
			case protocol.SeverityError:
				errors++
			case protocol.SeverityWarning:
				warns++
			default:
				infos++
			}
		}
		var sb strings.Builder
		fmt.Fprintf(&sb, "<details>\n<summary>%s <code>%s</code> — %d issue(s)",
			severityEmoji(g.diags[0].severity), label, len(g.diags))
		if errors > 0 || warns > 0 || infos > 0 {
			parts := []string{}
			if errors > 0 {
				parts = append(parts, fmt.Sprintf("%d errors", errors))
			}
			if warns > 0 {
				parts = append(parts, fmt.Sprintf("%d warnings", warns))
			}
			if infos > 0 {
				parts = append(parts, fmt.Sprintf("%d info", infos))
			}
			sb.WriteString(" (")
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
				if d.endLine > d.line {
					lineRef = fmt.Sprintf("[L%d-L%d](%s#L%d-L%d)", d.line, d.endLine, blobURL, d.line, d.endLine)
				} else {
					lineRef = fmt.Sprintf("[L%d](%s#L%d)", d.line, blobURL, d.line)
				}
			}
			fmt.Fprintf(&sb, "| %s | %s | %s | %s |\n", emoji, fileRef, lineRef, msg)
		}
		sb.WriteString("\n</details>\n\n")
		blocks = append(blocks, sb.String())
	}

	// Pack blocks into chunks. First block is summary; rest are rule groups.
	chunks := []string{}
	chunkIndex := 1
	var current strings.Builder
	header := "## 🔭 Telescope\n\n"
	continuedHeader := "## 🔭 Telescope (continued)\n\n"

	for _, block := range blocks {
		if current.Len() == 0 {
			current.WriteString(commentMarkerN(chunkIndex) + "\n")
			if chunkIndex == 1 {
				current.WriteString(header)
			} else {
				current.WriteString(continuedHeader)
			}
			current.WriteString(block)
			continue
		}
		if current.Len()+len(block) > maxCommentSize {
			chunks = append(chunks, current.String())
			current.Reset()
			chunkIndex++
			current.WriteString(commentMarkerN(chunkIndex) + "\n")
			current.WriteString(continuedHeader)
			current.WriteString(block)
		} else {
			current.WriteString(block)
		}
	}

	chunks = append(chunks, current.String()+commentFooter)
	return chunks
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
