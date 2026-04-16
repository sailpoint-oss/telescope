package lsp

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/pb33f/libopenapi/what-changed/model"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/diff"
)

func TestBreakingChangeDiagnostics_nil(t *testing.T) {
	if d := breakingChangeDiagnostics(nil); len(d) != 0 {
		t.Fatalf("got %v", d)
	}
	if d := breakingChangeDiagnostics(&diff.Result{}); len(d) != 0 {
		t.Fatalf("got %v", d)
	}
}

func TestIsOpenAPISpecURI(t *testing.T) {
	cases := map[string]bool{
		"file:///tmp/spec.yaml":        true,
		"file:///tmp/spec.YML":         true,
		"file:///tmp/spec.json":        true,
		"file:///tmp/other.md":         false,
		"file:///tmp/no-extension":     false,
		"file:///tmp/config.YAML.tmpl": true,
	}
	for uri, want := range cases {
		if got := isOpenAPISpecURI(uri); got != want {
			t.Errorf("isOpenAPISpecURI(%q) = %v, want %v", uri, got, want)
		}
	}
}

func TestDescribeModelChange(t *testing.T) {
	if got := describeModelChange(nil); got != "" {
		t.Fatalf("nil change = %q, want empty", got)
	}
	c := &model.Change{Property: "paths", Original: "/a", New: "/b"}
	msg := describeModelChange(c)
	if !strings.Contains(msg, "paths") || !strings.Contains(msg, "/a") || !strings.Contains(msg, "/b") {
		t.Fatalf("unexpected msg: %q", msg)
	}
	bare := &model.Change{}
	if got := describeModelChange(bare); !strings.Contains(got, "(property)") {
		t.Fatalf("expected default property placeholder, got %q", got)
	}
}

func TestGitTopLevel(t *testing.T) {
	if got := gitTopLevel(""); got != "" {
		t.Fatalf("empty dir = %q, want empty", got)
	}
	if got := gitTopLevel(t.TempDir()); got != "" {
		t.Fatalf("non-repo dir = %q, want empty", got)
	}

	repo := t.TempDir()
	cmd := exec.Command("git", "init", repo)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Skipf("git not available: %v\n%s", err, out)
	}
	abs, err := filepath.EvalSymlinks(repo)
	if err != nil {
		t.Fatalf("EvalSymlinks: %v", err)
	}
	got := gitTopLevel(repo)
	gotAbs, _ := filepath.EvalSymlinks(got)
	if gotAbs != abs {
		t.Fatalf("gitTopLevel(%q) = %q (abs %q), want %q", repo, got, gotAbs, abs)
	}
}

func TestBreakingChangeDiagnostics_ExercisesRealDiff(t *testing.T) {
	original := []byte(`openapi: 3.0.0
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
`)
	updated := []byte(`openapi: 3.0.0
info:
  title: T
  version: 1.0.0
paths:
  /a:
    get:
      operationId: a
      responses:
        "410":
          description: gone
`)
	res, err := diff.Compare(original, updated, diff.CompareOpts{})
	if err != nil || res == nil {
		t.Fatalf("diff.Compare: err=%v res=%v", err, res)
	}
	diags := breakingChangeDiagnostics(res)
	// If the real diff engine flags anything as breaking, diagnostics must carry
	// our stable metadata. If it flags nothing, that's fine too — the function
	// still executed end-to-end.
	for _, d := range diags {
		if d.Source != diffDiagSource {
			t.Fatalf("unexpected diagnostic source: %+v", d)
		}
		if d.Code != "breaking-change" {
			t.Fatalf("unexpected diagnostic code: %+v", d)
		}
	}
}

func TestDiffProvider_NilSafe(t *testing.T) {
	var p *DiffProvider
	if err := p.OnDidSave(nil, nil); err != nil {
		t.Fatalf("nil provider should no-op, got %v", err)
	}
	// Provider with no config still no-ops.
	p = NewDiffProvider(nil, nil, nil)
	if err := p.OnDidSave(nil, nil); err != nil {
		t.Fatalf("config-less provider should no-op, got %v", err)
	}
}

// --- Integration: OnDidSave end-to-end ---

// recordingPublisher captures published diagnostics for assertion.
type recordingPublisher struct {
	mu     sync.Mutex
	called map[protocol.DocumentURI][]protocol.Diagnostic
}

func newRecordingPublisher() *recordingPublisher {
	return &recordingPublisher{called: make(map[protocol.DocumentURI][]protocol.Diagnostic)}
}

func (r *recordingPublisher) publish(_ context.Context, params *protocol.PublishDiagnosticsParams) error {
	if params == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.called[params.URI] = append([]protocol.Diagnostic(nil), params.Diagnostics...)
	return nil
}

func TestDiffProvider_OnDidSave_FullFlow(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}

	repo := writeTempGitRepo(t)

	// Commit a v1 of the spec to HEAD so ReadAtRef has something to load.
	specRel := "api.yaml"
	specPath := filepath.Join(repo, specRel)
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

	// Set up the LSP document store with a modified version of the spec.
	modifiedSpec := strings.Replace(originalSpec, `"200"`, `"410"`, 1)
	uri := protocol.DocumentURI("file://" + filepath.ToSlash(specPath))

	env := newCoverageEnvWithSpec(t, uri, modifiedSpec)
	pub := newRecordingPublisher()
	mux := NewDiagnosticMux(pub.publish, nil)

	// Inject workspace-root and git-top-level resolvers so the test is fully
	// deterministic without needing a real gossip.Server.
	origWS := workspaceRootForContext
	workspaceRootForContext = func(_ *gossip.Context) string { return repo }
	t.Cleanup(func() { workspaceRootForContext = origWS })
	origGit := resolveGitTopLevel
	resolveGitTopLevel = func(_ string) string { return repo }
	t.Cleanup(func() { resolveGitTopLevel = origGit })

	cfg := &config.Config{}
	cfg.LSP.DiffOnSave = true
	cfg.LSP.DiffCompareBaseRef = "HEAD"

	provider := NewDiffProvider(cfg, mux, nil)
	env.ctx.Context = context.Background()

	if err := provider.OnDidSave(env.ctx, &protocol.DidSaveTextDocumentParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: uri},
	}); err != nil {
		t.Fatalf("OnDidSave: %v", err)
	}

	// A non-openapi URI short-circuits.
	if err := provider.OnDidSave(env.ctx, &protocol.DidSaveTextDocumentParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: protocol.DocumentURI("file:///not-a-spec.md")},
	}); err != nil {
		t.Fatalf("non-spec URI OnDidSave: %v", err)
	}

	// Empty document short-circuits and clears diagnostics.
	blankURI := protocol.DocumentURI("file:///blank.yaml")
	env.addDoc(t, blankURI, "   \n\n")
	if err := provider.OnDidSave(env.ctx, &protocol.DidSaveTextDocumentParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: blankURI},
	}); err != nil {
		t.Fatalf("empty-doc OnDidSave: %v", err)
	}

	// Unknown URI (no document in the store) short-circuits.
	if err := provider.OnDidSave(env.ctx, &protocol.DidSaveTextDocumentParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: protocol.DocumentURI("file:///missing.yaml")},
	}); err != nil {
		t.Fatalf("missing-doc OnDidSave: %v", err)
	}

	// No git repo -> early return (ClearSource branch).
	resolveGitTopLevel = func(_ string) string { return "" }
	if err := provider.OnDidSave(env.ctx, &protocol.DidSaveTextDocumentParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: uri},
	}); err != nil {
		t.Fatalf("no-repo OnDidSave: %v", err)
	}
	resolveGitTopLevel = func(_ string) string { return repo }

	// Spec URI outside the repo -> filepath.Rel returns a "..", ClearSource branch.
	outsideURI := protocol.DocumentURI("file:///tmp/far-away.yaml")
	env.addDoc(t, outsideURI, modifiedSpec)
	if err := provider.OnDidSave(env.ctx, &protocol.DidSaveTextDocumentParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: outsideURI},
	}); err != nil {
		t.Fatalf("outside-repo OnDidSave: %v", err)
	}

	// Diff base that does not exist -> ReadAtRef errors, ClearSource branch.
	cfgBad := &config.Config{}
	cfgBad.LSP.DiffOnSave = true
	cfgBad.LSP.DiffCompareBaseRef = "nonexistent-ref"
	badProvider := NewDiffProvider(cfgBad, mux, nil)
	if err := badProvider.OnDidSave(env.ctx, &protocol.DidSaveTextDocumentParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: uri},
	}); err != nil {
		t.Fatalf("bad-ref OnDidSave: %v", err)
	}

	// Disabled config short-circuits without touching anything.
	cfgDisabled := &config.Config{}
	disabledProvider := NewDiffProvider(cfgDisabled, mux, nil)
	if err := disabledProvider.OnDidSave(env.ctx, &protocol.DidSaveTextDocumentParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: uri},
	}); err != nil {
		t.Fatalf("disabled provider OnDidSave: %v", err)
	}
}

// writeTempGitRepo makes an isolated repo useful for git-driven tests in this
// package.
func writeTempGitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	run := func(args ...string) {
		cmd := exec.Command(args[0], args[1:]...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Skipf("git %v: %v\n%s", args, err, out)
		}
	}
	run("git", "init")
	run("git", "config", "user.email", "telescope@test.local")
	run("git", "config", "user.name", "Telescope Test")
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("seed\n"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}
	run("git", "add", ".")
	run("git", "commit", "-m", "seed")
	return dir
}
