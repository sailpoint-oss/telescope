package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

type rewriteGitHubTransport struct {
	base   http.RoundTripper
	target *url.URL
}

func (t *rewriteGitHubTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	rewritten := *clone.URL
	rewritten.Scheme = t.target.Scheme
	rewritten.Host = t.target.Host
	clone.URL = &rewritten
	return t.base.RoundTrip(clone)
}

func withGitHubAPIServer(t *testing.T, handler http.Handler) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	target, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("Parse server URL: %v", err)
	}

	transport := http.DefaultTransport
	if http.DefaultClient.Transport != nil {
		transport = http.DefaultClient.Transport
	}
	oldTransport := http.DefaultClient.Transport
	http.DefaultClient.Transport = &rewriteGitHubTransport{
		base:   transport,
		target: target,
	}
	t.Cleanup(func() {
		http.DefaultClient.Transport = oldTransport
	})
}

func TestNewGitHubClient(t *testing.T) {
	t.Run("missing token", func(t *testing.T) {
		t.Setenv("GITHUB_TOKEN", "")
		t.Setenv("GITHUB_REPOSITORY", "owner/repo")
		_, err := NewGitHubClient()
		if err == nil || !strings.Contains(err.Error(), "GITHUB_TOKEN not set") {
			t.Fatalf("expected missing token error, got %v", err)
		}
	})

	t.Run("missing repository", func(t *testing.T) {
		t.Setenv("GITHUB_TOKEN", "token")
		t.Setenv("GITHUB_REPOSITORY", "")
		_, err := NewGitHubClient()
		if err == nil || !strings.Contains(err.Error(), "GITHUB_REPOSITORY not set") {
			t.Fatalf("expected missing repository error, got %v", err)
		}
	})

	t.Run("success", func(t *testing.T) {
		t.Setenv("GITHUB_TOKEN", "token")
		t.Setenv("GITHUB_REPOSITORY", "owner/repo")
		client, err := NewGitHubClient()
		if err != nil {
			t.Fatalf("NewGitHubClient returned error: %v", err)
		}
		if client.token != "token" || client.repo != "owner/repo" {
			t.Fatalf("unexpected client: %+v", client)
		}
	})
}

func TestGitHubClientCommentCRUDAndPagination(t *testing.T) {
	client := &GitHubClient{token: "token", repo: "owner/repo"}
	var mu sync.Mutex
	var postBodies []string
	var patchBodies []string
	var deletePaths []string

	mux := http.NewServeMux()
	mux.HandleFunc("/repos/owner/repo/issues/12/comments", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			body, _ := io.ReadAll(r.Body)
			var payload map[string]string
			_ = json.Unmarshal(body, &payload)
			mu.Lock()
			postBodies = append(postBodies, payload["body"])
			mu.Unlock()
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":101}`))
		case http.MethodGet:
			page := r.URL.Query().Get("page")
			w.Header().Set("Content-Type", "application/json")
			if page == "1" {
				var comments []ghComment
				for i := 0; i < 100; i++ {
					comments = append(comments, ghComment{ID: int64(i + 1), Body: fmt.Sprintf("comment-%d", i+1)})
				}
				_ = json.NewEncoder(w).Encode(comments)
				return
			}
			_ = json.NewEncoder(w).Encode([]ghComment{{ID: 101, Body: "comment-101"}})
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	})
	mux.HandleFunc("/repos/owner/repo/issues/comments/7", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPatch:
			body, _ := io.ReadAll(r.Body)
			var payload map[string]string
			_ = json.Unmarshal(body, &payload)
			mu.Lock()
			patchBodies = append(patchBodies, payload["body"])
			mu.Unlock()
			_, _ = w.Write([]byte(`{}`))
		case http.MethodDelete:
			mu.Lock()
			deletePaths = append(deletePaths, r.URL.Path)
			mu.Unlock()
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	})

	withGitHubAPIServer(t, mux)

	if err := client.PostComment(12, "hello"); err != nil {
		t.Fatalf("PostComment returned error: %v", err)
	}
	if err := client.UpdateComment(7, "updated"); err != nil {
		t.Fatalf("UpdateComment returned error: %v", err)
	}
	if err := client.DeleteComment(7); err != nil {
		t.Fatalf("DeleteComment returned error: %v", err)
	}
	comments, err := client.ListComments(12)
	if err != nil {
		t.Fatalf("ListComments returned error: %v", err)
	}

	if len(comments) != 101 {
		t.Fatalf("expected 101 comments from pagination, got %d", len(comments))
	}
	if len(postBodies) != 1 || postBodies[0] != "hello" {
		t.Fatalf("unexpected post bodies: %v", postBodies)
	}
	if len(patchBodies) != 1 || patchBodies[0] != "updated" {
		t.Fatalf("unexpected patch bodies: %v", patchBodies)
	}
	if len(deletePaths) != 1 || deletePaths[0] != "/repos/owner/repo/issues/comments/7" {
		t.Fatalf("unexpected delete paths: %v", deletePaths)
	}
}

func TestGitHubClientListPRFilesAndCreateReview(t *testing.T) {
	client := &GitHubClient{token: "token", repo: "owner/repo"}
	var reviewBody string

	mux := http.NewServeMux()
	mux.HandleFunc("/repos/owner/repo/pulls/12/files", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		page := r.URL.Query().Get("page")
		if page == "1" {
			var files []prFile
			for i := 0; i < 100; i++ {
				files = append(files, prFile{Filename: fmt.Sprintf("file-%d.yaml", i), Status: "modified", Patch: "@@ -1 +1 @@\n-line\n+line"})
			}
			_ = json.NewEncoder(w).Encode(files)
			return
		}
		_ = json.NewEncoder(w).Encode([]prFile{{Filename: "final.yaml", Status: "added", Patch: "@@ -0,0 +1 @@\n+line"}})
	})
	mux.HandleFunc("/repos/owner/repo/pulls/12/reviews", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		reviewBody = string(body)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{}`))
	})

	withGitHubAPIServer(t, mux)

	files, err := client.ListPRFiles(12)
	if err != nil {
		t.Fatalf("ListPRFiles returned error: %v", err)
	}
	if len(files) != 101 {
		t.Fatalf("expected 101 files, got %d", len(files))
	}

	err = client.CreateReview(12, "abc123", "body", []reviewComment{{
		Path: "api.yaml",
		Line: 2,
		Side: "RIGHT",
		Body: "inline comment",
	}})
	if err != nil {
		t.Fatalf("CreateReview returned error: %v", err)
	}
	if !strings.Contains(reviewBody, `"commit_id":"abc123"`) || !strings.Contains(reviewBody, `"path":"api.yaml"`) {
		t.Fatalf("unexpected review payload: %s", reviewBody)
	}
}

func TestGitHubClientUpsertComments(t *testing.T) {
	client := &GitHubClient{token: "token", repo: "owner/repo"}
	var mu sync.Mutex
	var operations []string

	mux := http.NewServeMux()
	mux.HandleFunc("/repos/owner/repo/issues/12/comments", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			_ = json.NewEncoder(w).Encode([]ghComment{
				{ID: 1, Body: "<!-- telescope-lint-1 --> old"},
				{ID: 2, Body: "<!-- telescope-lint-1 --> newer"},
				{ID: 3, Body: "<!-- telescope-lint-2 --> keep"},
				{ID: 4, Body: "<!-- telescope-lint-4 --> stale"},
				{ID: 5, Body: "other comment"},
			})
		case http.MethodPost:
			body, _ := io.ReadAll(r.Body)
			mu.Lock()
			operations = append(operations, "POST:"+string(body))
			mu.Unlock()
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":9}`))
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	})
	mux.HandleFunc("/repos/owner/repo/issues/comments/", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		operations = append(operations, r.Method+":"+r.URL.Path+":"+string(body))
		mu.Unlock()
		_, _ = w.Write([]byte(`{}`))
	})

	withGitHubAPIServer(t, mux)

	err := client.UpsertComments(12, []string{
		"<!-- telescope-lint-1 --> chunk1",
		"<!-- telescope-lint-2 --> chunk2",
		"<!-- telescope-lint-3 --> chunk3",
	})
	if err != nil {
		t.Fatalf("UpsertComments returned error: %v", err)
	}

	joined := strings.Join(operations, "\n")
	for _, want := range []string{
		"DELETE:/repos/owner/repo/issues/comments/1:",
		"PATCH:/repos/owner/repo/issues/comments/2:{\"body\":\"\\u003c!-- telescope-lint-1 --\\u003e chunk1\"}",
		"PATCH:/repos/owner/repo/issues/comments/3:{\"body\":\"\\u003c!-- telescope-lint-2 --\\u003e chunk2\"}",
		"POST:{\"body\":\"\\u003c!-- telescope-lint-3 --\\u003e chunk3\"}",
		"DELETE:/repos/owner/repo/issues/comments/4:",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("expected operation %q in\n%s", want, joined)
		}
	}
}

func TestGitHubClientUpsertCommentsFallsBackWhenListFails(t *testing.T) {
	client := &GitHubClient{token: "token", repo: "owner/repo"}
	var posts int

	mux := http.NewServeMux()
	mux.HandleFunc("/repos/owner/repo/issues/12/comments", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			http.Error(w, "boom", http.StatusInternalServerError)
			return
		}
		posts++
		w.WriteHeader(http.StatusCreated)
	})

	withGitHubAPIServer(t, mux)

	err := client.UpsertComments(12, []string{"one", "two"})
	if err != nil {
		t.Fatalf("UpsertComments returned error: %v", err)
	}
	if posts != 2 {
		t.Fatalf("expected 2 fallback posts, got %d", posts)
	}
}

func TestParsePatchLinesAndBuildDiffMap(t *testing.T) {
	patch := strings.Join([]string{
		"@@ -1,2 +1,3 @@",
		" context",
		"-old",
		"+new",
		"",
	}, "\n")
	lines := parsePatchLines(patch)
	for _, line := range []int{1, 2, 3} {
		if !lines[line] {
			t.Fatalf("expected line %d to be valid, got %v", line, lines)
		}
	}

	diffMap := buildDiffMap([]prFile{
		{Filename: "added.yaml", Status: "added"},
		{Filename: "changed.yaml", Status: "modified", Patch: patch},
		{Filename: "removed.yaml", Status: "removed", Patch: patch},
	})
	if !diffMap["added.yaml"].AllLines {
		t.Fatal("expected added file to mark all lines valid")
	}
	if len(diffMap["changed.yaml"].ValidLines) == 0 {
		t.Fatal("expected changed file to have valid diff lines")
	}
	if _, ok := diffMap["removed.yaml"]; ok {
		t.Fatal("expected removed file to be skipped")
	}
}

func TestGitHubActionsPRHeadSHA(t *testing.T) {
	t.Run("from direct env", func(t *testing.T) {
		t.Setenv("GITHUB_HEAD_SHA", "direct-sha")
		if got := githubActionsPRHeadSHA(); got != "direct-sha" {
			t.Fatalf("githubActionsPRHeadSHA() = %q, want direct-sha", got)
		}
	})

	t.Run("from event payload", func(t *testing.T) {
		eventPath := filepath.Join(t.TempDir(), "event.json")
		err := os.WriteFile(eventPath, []byte(`{"pull_request":{"head":{"sha":"event-sha"}}}`), 0o644)
		if err != nil {
			t.Fatalf("Write event payload: %v", err)
		}
		t.Setenv("GITHUB_HEAD_SHA", "")
		t.Setenv("GITHUB_EVENT_NAME", "pull_request")
		t.Setenv("GITHUB_EVENT_PATH", eventPath)
		if got := githubActionsPRHeadSHA(); got != "event-sha" {
			t.Fatalf("githubActionsPRHeadSHA() = %q, want event-sha", got)
		}
	})
}

func TestPostPRCommentAndPostPRReview(t *testing.T) {
	var reviewPosted bool
	var commentPosted bool

	mux := http.NewServeMux()
	mux.HandleFunc("/repos/owner/repo/issues/12/comments", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			_ = json.NewEncoder(w).Encode([]ghComment{})
		case http.MethodPost:
			commentPosted = true
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`{"id":22}`))
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	})
	mux.HandleFunc("/repos/owner/repo/pulls/12/files", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]prFile{{
			Filename: "api.yaml",
			Status:   "modified",
			Patch:    "@@ -1 +1 @@\n-old\n+new\n",
		}})
	})
	mux.HandleFunc("/repos/owner/repo/pulls/12/reviews", func(w http.ResponseWriter, r *http.Request) {
		reviewPosted = true
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{}`))
	})

	withGitHubAPIServer(t, mux)
	t.Setenv("GITHUB_TOKEN", "token")
	t.Setenv("GITHUB_REPOSITORY", "owner/repo")
	t.Setenv("GITHUB_PR_NUMBER", "12")
	t.Setenv("GITHUB_HEAD_REF", "feature-branch")
	t.Setenv("GITHUB_HEAD_SHA", "abc123")

	report := &LintReport{
		Workspace: "/repo",
		RepoRoot:  "/repo",
		Counts:    SeverityCounts{Error: 1},
		Files: []fileDiagnostics{{
			Path: "/repo/api.yaml",
			Diagnostics: []protocol.Diagnostic{{
				Range:    protocol.Range{Start: protocol.Position{Line: 0, Character: 0}},
				Severity: protocol.SeverityError,
				Code:     "oas3-schema",
				Message:  "bad schema",
			}},
		}},
	}

	if err := postPRComment(report); err != nil {
		t.Fatalf("postPRComment returned error: %v", err)
	}
	if err := postPRReview(report); err != nil {
		t.Fatalf("postPRReview returned error: %v", err)
	}
	if !commentPosted {
		t.Fatal("expected summary comment to be posted")
	}
	if !reviewPosted {
		t.Fatal("expected inline review to be posted")
	}
}
