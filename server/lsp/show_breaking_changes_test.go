package lsp

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"

	"github.com/sailpoint-oss/telescope/server/config"
)

func TestExecuteShowBreakingChanges_ErrorBranches(t *testing.T) {
	env := newCoverageEnv(t)
	deps := &ExecuteCommandDeps{Config: &config.Config{}}

	// Empty URI -> explicit error.
	if _, err := executeShowBreakingChanges(env.ctx, "", deps); err == nil {
		t.Fatal("expected error for empty URI")
	}

	// Unopened document -> "document not open".
	_, err := executeShowBreakingChanges(env.ctx, protocol.DocumentURI("file:///unopened.yaml"), deps)
	if err == nil || !strings.Contains(err.Error(), "document not open") {
		t.Fatalf("expected 'document not open' error, got %v", err)
	}

	// Open doc but workspace is not a git repo -> "not a git repository".
	origGit := resolveGitTopLevel
	resolveGitTopLevel = func(_ string) string { return "" }
	t.Cleanup(func() { resolveGitTopLevel = origGit })
	origWS := workspaceRootForContext
	workspaceRootForContext = func(_ *gossip.Context) string { return "" }
	t.Cleanup(func() { workspaceRootForContext = origWS })

	_, err = executeShowBreakingChanges(env.ctx, env.uri, deps)
	if err == nil || !strings.Contains(err.Error(), "not a git repository") {
		t.Fatalf("expected 'not a git repository' error, got %v", err)
	}
}

func TestExecuteShowBreakingChanges_FullFlow(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}

	repo := writeTempGitRepo(t)

	// Commit v1 of the spec into HEAD.
	specPath := filepath.Join(repo, "api.yaml")
	originalSpec := `openapi: 3.0.0
info:
  title: T
  version: 1.0.0
paths:
  /a:
    get:
      operationId: a
      responses:
        "200":
          description: ok
`
	if err := os.WriteFile(specPath, []byte(originalSpec), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	for _, args := range [][]string{
		{"git", "add", "api.yaml"},
		{"git", "commit", "-m", "v1"},
	} {
		cmd := exec.Command(args[0], args[1:]...)
		cmd.Dir = repo
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}

	modifiedSpec := strings.Replace(originalSpec, `"200"`, `"410"`, 1)
	uri := protocol.DocumentURI("file://" + filepath.ToSlash(specPath))
	env := newCoverageEnvWithSpec(t, uri, modifiedSpec)

	// Inject workspace/root resolvers.
	origGit := resolveGitTopLevel
	resolveGitTopLevel = func(_ string) string { return repo }
	t.Cleanup(func() { resolveGitTopLevel = origGit })
	origWS := workspaceRootForContext
	workspaceRootForContext = func(_ *gossip.Context) string { return repo }
	t.Cleanup(func() { workspaceRootForContext = origWS })
	env.ctx.Context = context.Background()

	cfg := &config.Config{}
	cfg.LSP.DiffCompareBaseRef = "HEAD"
	deps := &ExecuteCommandDeps{Config: cfg}

	result, err := executeShowBreakingChanges(env.ctx, uri, deps)
	if err != nil {
		t.Fatalf("executeShowBreakingChanges: %v", err)
	}
	// The function returns markdown from diff.FormatMarkdown; just make sure
	// we got something stringy.
	if _, ok := result.(string); !ok {
		t.Fatalf("expected string result, got %T", result)
	}

	// Unknown ref -> ReadAtRef error bubbles up as wrapped error.
	badCfg := &config.Config{}
	badCfg.LSP.DiffCompareBaseRef = "nonexistent-ref"
	badDeps := &ExecuteCommandDeps{Config: badCfg}
	if _, err := executeShowBreakingChanges(env.ctx, uri, badDeps); err == nil ||
		!strings.Contains(err.Error(), "read base revision") {
		t.Fatalf("expected 'read base revision' error, got %v", err)
	}
}
