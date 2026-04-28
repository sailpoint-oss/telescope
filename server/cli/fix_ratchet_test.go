package cli

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/barrelman/codemod"
)

func TestSha256hex(t *testing.T) {
	t.Parallel()
	got := sha256hex([]byte("hello"))
	want := fmt.Sprintf("%x", sha256.Sum256([]byte("hello")))
	if got != want {
		t.Fatalf("sha256hex mismatch: got %q want %q", got, want)
	}
	// A second identical call must be stable.
	if sha256hex([]byte("hello")) != got {
		t.Fatalf("sha256hex should be deterministic")
	}
	// Empty input has a well-known digest; assert prefix only so the
	// test remains a one-liner if the hash library ever changes
	// output width (it will not, but belt-and-braces).
	empty := sha256hex(nil)
	if _, err := hex.DecodeString(empty); err != nil {
		t.Fatalf("empty digest is not valid hex: %v", err)
	}
	if len(empty) != 64 {
		t.Fatalf("sha256 hex digest should be 64 chars, got %d", len(empty))
	}
}

func TestFindRepoRoot_FindsGitDir(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	nested := filepath.Join(root, "a", "b", "c")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(nested, "openapi.yaml")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := findRepoRoot(file)
	if err != nil {
		t.Fatalf("findRepoRoot: %v", err)
	}
	wantAbs, _ := filepath.Abs(root)
	if got != wantAbs {
		t.Fatalf("expected repo root %q, got %q", wantAbs, got)
	}
}

func TestFindRepoRoot_GitAsFile(t *testing.T) {
	// Submodules and worktrees use a regular file named ".git";
	// findRepoRoot must still accept it.
	t.Parallel()
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, ".git"), []byte("gitdir: ../real"), 0o644); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(root, "spec.yaml")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := findRepoRoot(file)
	if err != nil {
		t.Fatalf("findRepoRoot: %v", err)
	}
	wantAbs, _ := filepath.Abs(root)
	if got != wantAbs {
		t.Fatalf("expected repo root %q, got %q", wantAbs, got)
	}
}

func TestFindRepoRoot_FallbackWhenNoGit(t *testing.T) {
	t.Parallel()
	// Use a temp directory several levels deep that has no .git;
	// findRepoRoot should fall back to the file's parent directory
	// rather than returning an error.
	dir := t.TempDir()
	nested := filepath.Join(dir, "x", "y")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(nested, "spec.yaml")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := findRepoRoot(file)
	if err != nil {
		t.Fatalf("findRepoRoot: %v", err)
	}
	if got == "" {
		t.Fatalf("expected non-empty fallback, got empty string")
	}
}

func TestScanRatchetLog_Match(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "spec.yaml")
	if err := os.WriteFile(file, []byte("pre"), 0o644); err != nil {
		t.Fatal(err)
	}
	preHash := sha256hex([]byte("pre"))

	logDir := filepath.Join(dir, ".telescope")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		t.Fatal(err)
	}
	logPath := filepath.Join(logDir, "codemod.log")
	stamp := "2026-04-17T13:00:00Z"
	entry := strings.Join([]string{stamp, "spec.yaml", preHash, "deadbeef"}, "\t") + "\n"
	// A junk line with too few fields and a non-matching entry also
	// should be ignored.
	junk := "bogus\n"
	other := strings.Join([]string{"2026-04-17T12:00:00Z", "other.yaml", preHash, "cafebabe"}, "\t") + "\n"
	if err := os.WriteFile(logPath, []byte(junk+other+entry), 0o644); err != nil {
		t.Fatal(err)
	}

	got := scanRatchetLog(logPath, file, preHash)
	if got != stamp {
		t.Fatalf("expected match stamp %q, got %q", stamp, got)
	}
}

func TestScanRatchetLog_NoMatchAndMissingFile(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "spec.yaml")
	if err := os.WriteFile(file, []byte("pre"), 0o644); err != nil {
		t.Fatal(err)
	}

	// No log file yet.
	if got := scanRatchetLog(filepath.Join(dir, ".telescope", "codemod.log"), file, "abc"); got != "" {
		t.Fatalf("expected empty result for missing log, got %q", got)
	}

	// Log with non-matching hash returns empty.
	logPath := filepath.Join(dir, ".telescope", "codemod.log")
	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		t.Fatal(err)
	}
	entry := strings.Join([]string{"2026-04-17T11:00:00Z", "spec.yaml", "differenthash", "post"}, "\t") + "\n"
	if err := os.WriteFile(logPath, []byte(entry), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := scanRatchetLog(logPath, file, sha256hex([]byte("pre"))); got != "" {
		t.Fatalf("expected empty result for non-matching hash, got %q", got)
	}
}

func TestNoteFixApplied_AppendsEntry(t *testing.T) {
	// This test redirects process-wide stderr; keep it serial to avoid
	// racing parallel tests that may emit warnings.
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "spec.yaml")
	if err := os.WriteFile(file, []byte("pre"), 0o644); err != nil {
		t.Fatal(err)
	}

	noteFixApplied(file, []byte("pre"), []byte("post"))

	logPath := filepath.Join(dir, codemodLogPath)
	raw, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("read log: %v", err)
	}
	line := strings.TrimSpace(string(raw))
	fields := strings.Split(line, "\t")
	if len(fields) != 4 {
		t.Fatalf("expected 4 tab-separated fields, got %d in %q", len(fields), line)
	}
	if fields[1] != "spec.yaml" {
		t.Fatalf("expected relative path 'spec.yaml', got %q", fields[1])
	}
	if fields[2] != sha256hex([]byte("pre")) {
		t.Fatalf("pre hash mismatch")
	}
	if fields[3] != sha256hex([]byte("post")) {
		t.Fatalf("post hash mismatch")
	}

	// Second invocation with same pre-hash should warn but still
	// append. We capture stderr to make that observable without
	// relying on order of fields beyond the count.
	stderr := captureStderr(t, func() {
		noteFixApplied(file, []byte("pre"), []byte("post2"))
	})
	if !strings.Contains(stderr, "previously fixed") {
		t.Fatalf("expected collision warning on stderr, got %q", stderr)
	}
	raw2, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatalf("re-read log: %v", err)
	}
	if count := strings.Count(strings.TrimSpace(string(raw2)), "\n") + 1; count != 2 {
		t.Fatalf("expected 2 entries after second call, got %d", count)
	}
}

func TestNoteFixApplied_UnwritableRoot(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	// Make the ratchet log directory impossible to create and confirm
	// noteFixApplied swallows the advisory logging error.
	if err := os.WriteFile(filepath.Join(dir, ".telescope"), []byte("not a directory"), 0o644); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(dir, "spec.yaml")
	noteFixApplied(file, []byte("pre"), []byte("post"))
}

func TestGuardFixResults(t *testing.T) {
	t.Parallel()
	// No shrink patches -> no error.
	insert := codemod.Patch{RuleID: "sailpoint-rule", StartByte: 10, EndByte: 10, Replacement: []byte("xyz")}
	ok := []barrelman.FixResult{{File: "a.yaml", Patches: []codemod.Patch{insert}}}
	if err := guardFixResults(ok); err != nil {
		t.Fatalf("insertion should be accepted, got err: %v", err)
	}
	// Shrink patch -> error.
	shrink := codemod.Patch{RuleID: "bad-rule", StartByte: 5, EndByte: 10, Replacement: nil}
	bad := []barrelman.FixResult{{File: "b.yaml", Patches: []codemod.Patch{shrink}}}
	err := guardFixResults(bad)
	if err == nil {
		t.Fatal("expected error on shrinking patch")
	}
	if !strings.Contains(err.Error(), "bad-rule") || !strings.Contains(err.Error(), "b.yaml") {
		t.Fatalf("error should reference rule and file, got %v", err)
	}
}

// captureStderr redirects os.Stderr for the duration of fn, returning
// whatever was written. Mirrors captureStdout in coverage_atomic_test.go.
func captureStderr(t *testing.T, fn func()) string {
	t.Helper()
	old := os.Stderr
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe: %v", err)
	}
	os.Stderr = w
	done := make(chan string)
	go func() {
		var sb strings.Builder
		buf := make([]byte, 1024)
		for {
			n, err := r.Read(buf)
			if n > 0 {
				sb.Write(buf[:n])
			}
			if err != nil {
				break
			}
		}
		done <- sb.String()
	}()
	fn()
	w.Close()
	os.Stderr = old
	return <-done
}
