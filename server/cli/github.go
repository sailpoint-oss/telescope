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
	"time"

	"github.com/LukasParke/gossip/protocol"
)

const (
	commentMarkerPrefix = "<!-- telescope-lint-"
	commentMarkerSuffix = " -->"
	// githubMaxIssueCommentBytes is GitHub's maximum issue comment body size.
	githubMaxIssueCommentBytes = 65536
	// maxRuleDetailsPieceBytes caps a single <details> block; must fit with marker,
	// page header, and footer in one issue comment.
	maxRuleDetailsPieceBytes = 58000
	// maxTopFilesInComment keeps the summary block compact.
	maxTopFilesInComment = 5
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
	AllLines   bool         // true for added files (all lines valid)
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
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GitHub API error: %s: %s", resp.Status, bytes.TrimSpace(b))
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
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GitHub API error: %s: %s", resp.Status, bytes.TrimSpace(b))
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
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GitHub API error: %s: %s", resp.Status, bytes.TrimSpace(b))
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

	// Map marker index -> comment IDs (may include duplicates from retries).
	idsByIndex := make(map[int][]int64)
	for _, comment := range comments {
		if !isTelescopeComment(comment.Body) {
			continue
		}
		idx, ok := parseMarkerIndex(comment.Body)
		if !ok {
			continue
		}
		idsByIndex[idx] = append(idsByIndex[idx], comment.ID)
	}

	// Keep the newest comment per index (highest ID); delete duplicates.
	existingByIndex := make(map[int]int64)
	for idx, ids := range idsByIndex {
		if len(ids) == 0 {
			continue
		}
		var keep int64
		for _, id := range ids {
			if id > keep {
				keep = id
			}
		}
		for _, id := range ids {
			if id != keep {
				if err := c.DeleteComment(id); err != nil {
					return err
				}
			}
		}
		existingByIndex[idx] = keep
	}

	var existing []indexedComment
	for idx, id := range existingByIndex {
		existing = append(existing, indexedComment{id: id, index: idx})
	}
	sort.Slice(existing, func(i, j int) bool { return existing[i].index < existing[j].index })

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

// formatDiagnosticMarkdown formats a diagnostic message for markdown contexts
// (PR comments, markdown reports) with a code badge and optional rule doc link.
//
// Output: **`rule-id`** message text [View rule docs →](url)
func formatDiagnosticMarkdown(code, message, docURL string) string {
	var b strings.Builder
	if code != "" {
		fmt.Fprintf(&b, "**`%s`** ", code)
	}
	b.WriteString(message)
	if docURL != "" {
		fmt.Fprintf(&b, " [View rule docs →](%s)", docURL)
	}
	return b.String()
}

// ruleDiagRow is one diagnostic row for PR markdown tables.
type ruleDiagRow struct {
	severity protocol.DiagnosticSeverity
	relPath  string
	line     int
	endLine  int
	code     string
	docURL   string
	message  string
}

func countLabel(n int, singular, plural string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, singular)
	}
	return fmt.Sprintf("%d %s", n, plural)
}

func formatGeneratedAt(ts string) string {
	if ts == "" {
		return ""
	}
	parsed, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return ts
	}
	return parsed.UTC().Format("2006-01-02 15:04 UTC")
}

func formatPRScopeSummary(report *LintReport, ruleCount int) string {
	var parts []string
	if report.Scope != nil && report.Scope.Mode != "" {
		parts = append(parts, scopeModeLabel(report.Scope))
		if report.Scope.Mode == reportScopeChanged {
			parts = append(parts, countLabel(report.Scope.ChangedFileCount, "changed file", "changed files"))
			parts = append(parts, countLabel(report.Scope.ImpactedFileCount, "impacted file", "impacted files"))
		}
		if report.Scope.AnalyzedFileCount > 0 {
			parts = append(parts, countLabel(report.Scope.AnalyzedFileCount, "analyzed file", "analyzed files"))
		}
	} else {
		parts = append(parts, countLabel(len(report.Files), "file", "files"))
	}
	parts = append(parts,
		countLabel(report.DiagnosticCount, "finding", "findings"),
		countLabel(ruleCount, "rule", "rules"),
	)

	var sb strings.Builder
	fmt.Fprintf(&sb, "**Scope:** %s\n\n", strings.Join(parts, " · "))
	if report.Scope != nil && report.Scope.FallbackReason != "" {
		fmt.Fprintf(&sb, "<sub>Scope fallback: %s.</sub>\n\n", strings.TrimSuffix(report.Scope.FallbackReason, "."))
	}
	if generatedAt := formatGeneratedAt(report.GeneratedAt); generatedAt != "" {
		fmt.Fprintf(&sb, "<sub>Generated %s.</sub>\n\n", generatedAt)
	}
	return sb.String()
}

func blobURL(repo, headRef, relPath string) string {
	return fmt.Sprintf("https://github.com/%s/blob/%s/%s", repo, headRef, relPath)
}

func formatFileRef(relPath, repo, headRef string, canLink bool) string {
	fileRef := fmt.Sprintf("`%s`", relPath)
	if canLink {
		fileRef = fmt.Sprintf("[`%s`](%s)", relPath, blobURL(repo, headRef, relPath))
	}
	return fileRef
}

func worstSeverity(diags []ruleDiagRow) protocol.DiagnosticSeverity {
	if len(diags) == 0 {
		return protocol.SeverityHint
	}
	worst := diags[0].severity
	for _, d := range diags[1:] {
		if d.severity < worst {
			worst = d.severity
		}
	}
	return worst
}

func distinctFileCount(diags []ruleDiagRow) int {
	seen := make(map[string]struct{}, len(diags))
	for _, d := range diags {
		seen[d.relPath] = struct{}{}
	}
	return len(seen)
}

func topFileDetails(report *LintReport, relBase string) []FileDetail {
	if len(report.FileDetails) > 0 {
		details := make([]FileDetail, len(report.FileDetails))
		copy(details, report.FileDetails)
		for i := range details {
			details[i].Path = filepath.ToSlash(details[i].Path)
		}
		sort.Slice(details, func(i, j int) bool {
			if details[i].Count != details[j].Count {
				return details[i].Count > details[j].Count
			}
			if details[i].Errors != details[j].Errors {
				return details[i].Errors > details[j].Errors
			}
			if details[i].Warnings != details[j].Warnings {
				return details[i].Warnings > details[j].Warnings
			}
			return details[i].Path < details[j].Path
		})
		if len(details) > maxTopFilesInComment {
			details = details[:maxTopFilesInComment]
		}
		return details
	}

	details := make([]FileDetail, 0, len(report.Files))
	for _, fd := range report.Files {
		rel, err := filepath.Rel(relBase, fd.Path)
		if err != nil {
			rel = fd.Path
		}
		detail := FileDetail{
			Path:  filepath.ToSlash(rel),
			Count: len(fd.Diagnostics),
		}
		for _, d := range fd.Diagnostics {
			switch d.Severity {
			case protocol.SeverityError:
				detail.Errors++
			case protocol.SeverityWarning:
				detail.Warnings++
			}
		}
		details = append(details, detail)
	}
	sort.Slice(details, func(i, j int) bool {
		if details[i].Count != details[j].Count {
			return details[i].Count > details[j].Count
		}
		if details[i].Errors != details[j].Errors {
			return details[i].Errors > details[j].Errors
		}
		if details[i].Warnings != details[j].Warnings {
			return details[i].Warnings > details[j].Warnings
		}
		return details[i].Path < details[j].Path
	})
	if len(details) > maxTopFilesInComment {
		details = details[:maxTopFilesInComment]
	}
	return details
}

func formatTopFilesBlock(details []FileDetail, repo, headRef string, canLink bool) string {
	if len(details) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("**Top files**\n")
	for _, fd := range details {
		sb.WriteString("- ")
		sb.WriteString(formatFileRef(fd.Path, repo, headRef, canLink))
		sb.WriteString(" — ")
		sb.WriteString(countLabel(fd.Count, "finding", "findings"))

		parts := make([]string, 0, 2)
		if fd.Errors > 0 {
			parts = append(parts, countLabel(fd.Errors, "error", "errors"))
		}
		if fd.Warnings > 0 {
			parts = append(parts, countLabel(fd.Warnings, "warning", "warnings"))
		}
		if len(parts) > 0 {
			sb.WriteString(" (")
			sb.WriteString(strings.Join(parts, ", "))
			sb.WriteString(")")
		}
		sb.WriteByte('\n')
	}
	sb.WriteByte('\n')
	return sb.String()
}

func formatRuleTableRow(d ruleDiagRow, repo, headRef string, canLink bool) string {
	emoji := severityEmoji(d.severity)
	msg := strings.ReplaceAll(d.message, "|", "\\|")
	msg = strings.ReplaceAll(msg, "\n", " ")
	// Wrap message with rule code badge for richer markdown rendering
	if d.code != "" {
		msg = fmt.Sprintf("`%s` %s", d.code, msg)
	}
	fileRef := formatFileRef(d.relPath, repo, headRef, canLink)
	lineRef := fmt.Sprintf("L%d", d.line)
	if canLink {
		targetURL := blobURL(repo, headRef, d.relPath)
		if d.endLine > d.line {
			lineRef = fmt.Sprintf("[L%d-L%d](%s#L%d-L%d)", d.line, d.endLine, targetURL, d.line, d.endLine)
		} else {
			lineRef = fmt.Sprintf("[L%d](%s#L%d)", d.line, targetURL, d.line)
		}
	}
	return fmt.Sprintf("| %s | %s | %s | %s |\n", emoji, fileRef, lineRef, msg)
}

// splitRuleDetailsIntoBlocks returns one or more <details> blocks for a rule, each under
// maxRuleDetailsPieceBytes so packing into an issue comment cannot exceed GitHub limits.
func splitRuleDetailsIntoBlocks(label, docURL string, sev protocol.DiagnosticSeverity, diags []ruleDiagRow, repo, headRef string, canLink bool) []string {
	sort.Slice(diags, func(a, b int) bool {
		return diags[a].severity < diags[b].severity
	})
	errors, warns, infos, hints := 0, 0, 0, 0
	for _, d := range diags {
		switch d.severity {
		case protocol.SeverityError:
			errors++
		case protocol.SeverityWarning:
			warns++
		case protocol.SeverityInformation:
			infos++
		case protocol.SeverityHint:
			hints++
		default:
			infos++
		}
	}
	fileCount := distinctFileCount(diags)
	writeOpen := func(sb *strings.Builder, continued bool) {
		fmt.Fprintf(sb, "<details>\n<summary>%s %s — %s · %s",
			severityEmoji(sev), htmlRuleLabel(label, docURL),
			countLabel(len(diags), "finding", "findings"),
			countLabel(fileCount, "file", "files"))
		if errors > 0 || warns > 0 || infos > 0 || hints > 0 {
			parts := []string{}
			if errors > 0 {
				parts = append(parts, countLabel(errors, "error", "errors"))
			}
			if warns > 0 {
				parts = append(parts, countLabel(warns, "warning", "warnings"))
			}
			if infos > 0 {
				parts = append(parts, countLabel(infos, "info", "info"))
			}
			if hints > 0 {
				parts = append(parts, countLabel(hints, "hint", "hints"))
			}
			sb.WriteString(" (")
			sb.WriteString(strings.Join(parts, ", "))
			sb.WriteString(")")
		}
		if continued {
			sb.WriteString(" — more")
		}
		sb.WriteString("</summary>\n\n")
	}
	rows := make([]string, len(diags))
	for i := range diags {
		rows[i] = formatRuleTableRow(diags[i], repo, headRef, canLink)
	}
	tableHead := "| | File | Line | Message |\n| --- | --- | ---: | --- |\n"
	closeDetails := "\n</details>\n\n"

	var out []string
	var cur strings.Builder
	writeOpen(&cur, false)
	cur.WriteString(tableHead)
	prefixLen := cur.Len()

	for _, row := range rows {
		if cur.Len()+len(row)+len(closeDetails) > maxRuleDetailsPieceBytes && cur.Len() > prefixLen {
			cur.WriteString(closeDetails)
			out = append(out, cur.String())
			cur.Reset()
			writeOpen(&cur, true)
			cur.WriteString(tableHead)
			prefixLen = cur.Len()
		}
		cur.WriteString(row)
	}
	cur.WriteString(closeDetails)
	out = append(out, cur.String())
	return out
}

func htmlRuleLabel(code, href string) string {
	if code == "" {
		return "<code>(no rule)</code>"
	}
	if href == "" {
		return fmt.Sprintf("<code>%s</code>", code)
	}
	return fmt.Sprintf("<a href=\"%s\"><code>%s</code></a>", href, code)
}

// packMarkdownChunks joins content blocks into issue-comment bodies, each at most
// githubMaxIssueCommentBytes including the footer on the final chunk.
func packMarkdownChunks(blocks []string) []string {
	if len(blocks) == 0 {
		return nil
	}
	footerLen := len(commentFooter)
	var chunks []string
	var cur strings.Builder
	chunkIdx := 1
	mainHeader := "## 🔭 Telescope\n\n"
	// Continuation issue comments (GitHub 64KiB limit) have no repeated title—only
	// the hidden marker plus body so the thread reads as one report.

	for i, block := range blocks {
		last := i == len(blocks)-1
		if cur.Len() == 0 {
			cur.WriteString(commentMarkerN(chunkIdx))
			cur.WriteByte('\n')
			if chunkIdx == 1 {
				cur.WriteString(mainHeader)
			}
			cur.WriteString(block)
			continue
		}
		extra := 0
		if last {
			extra = footerLen
		}
		if cur.Len()+len(block)+extra > githubMaxIssueCommentBytes {
			chunks = append(chunks, cur.String())
			cur.Reset()
			chunkIdx++
			cur.WriteString(commentMarkerN(chunkIdx))
			cur.WriteByte('\n')
			cur.WriteString(block)
		} else {
			cur.WriteString(block)
		}
	}
	chunks = append(chunks, cur.String()+commentFooter)
	return chunks
}

// GeneratePRComment creates markdown comment bodies from a lint report, grouped by rule
// with clickable GitHub links. It returns one or more chunks under githubMaxIssueCommentBytes,
// splitting at rule-group boundaries and splitting large single-rule tables by row.
func GeneratePRComment(report *LintReport, repo, headRef string) []string {
	relBase := report.RepoRoot
	if relBase == "" {
		relBase = report.Workspace
	}
	canLink := repo != "" && headRef != ""

	if report.DiagnosticCount == 0 {
		body := commentMarkerN(1) + "\n## 🔭 Telescope\n\n"
		body += formatPRScopeSummary(report, 0)
		body += "✅ **No findings** — all OpenAPI files pass validation.\n\n"
		body += commentFooter
		return []string{body}
	}

	// Group diagnostics by rule.
	byRule := make(map[string][]ruleDiagRow)
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
			byRule[code] = append(byRule[code], ruleDiagRow{
				severity: d.Severity,
				relPath:  rel,
				line:     startLine,
				endLine:  endLine,
				code:     code,
				message:  d.Message,
			})
		}
	}

	type ruleGroup struct {
		code   string
		docURL string
		diags  []ruleDiagRow
	}
	var groups []ruleGroup
	for code, diags := range byRule {
		groups = append(groups, ruleGroup{
			code:   code,
			docURL: report.RuleDocs[code],
			diags:  diags,
		})
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

	// Build summary block (chunk 1 only).
	summary := formatPRScopeSummary(report, len(groups))
	summary += "| 🔴 Errors | 🟡 Warnings | 🔵 Info | ⚪ Hints | Total |\n"
	summary += "| :---: | :---: | :---: | :---: | :---: |\n"
	summary += fmt.Sprintf("| %d | %d | %d | %d | %d |\n\n",
		report.Counts.Error, report.Counts.Warning,
		report.Counts.Info, report.Counts.Hint, report.DiagnosticCount)
	summary += formatTopFilesBlock(topFileDetails(report, relBase), repo, headRef, canLink)

	blocks := make([]string, 0, len(groups)+1)
	blocks = append(blocks, summary)
	for _, g := range groups {
		label := g.code
		if label == "" {
			label = "(no rule)"
		}
		parts := splitRuleDetailsIntoBlocks(label, g.docURL, worstSeverity(g.diags), g.diags, repo, headRef, canLink)
		blocks = append(blocks, parts...)
	}

	return packMarkdownChunks(blocks)
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
