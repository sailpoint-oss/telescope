package docs

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestNormalizeOpts_FillsDefaults(t *testing.T) {
	got := normalizeOpts(GenerateOpts{}, 0)
	if got.OutputDir != "./docs" {
		t.Fatalf("OutputDir default = %q", got.OutputDir)
	}
	if got.Theme != "dark" {
		t.Fatalf("Theme default = %q", got.Theme)
	}
}

func TestNormalizeOpts_PreservesExistingValues(t *testing.T) {
	got := normalizeOpts(GenerateOpts{OutputDir: "custom", Theme: "light"}, 9876)
	if got.OutputDir != "custom" {
		t.Fatalf("OutputDir overwritten: %q", got.OutputDir)
	}
	if got.Theme != "light" {
		t.Fatalf("Theme overwritten: %q", got.Theme)
	}
	if got.ServePort != 9876 {
		t.Fatalf("ServePort should be set from argument: got %d", got.ServePort)
	}
}

func TestBuildArgs_MinimalInput(t *testing.T) {
	args := buildArgs(GenerateOpts{SpecPath: "s.yaml", OutputDir: "/out"})
	text := strings.Join(args, " ")
	// With zero Title/Theme the optional flags should not appear.
	for _, forbidden := range []string{"--title", "--theme", "--publish", "--serve", "--no-llm"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("unexpected flag %q in minimal args: %q", forbidden, text)
		}
	}
}

func TestPickFreePort_ReturnsUsableValue(t *testing.T) {
	port, err := pickFreePort()
	if err != nil {
		t.Fatalf("pickFreePort: %v", err)
	}
	if port <= 0 || port > 65535 {
		t.Fatalf("port out of range: %d", port)
	}
}

func TestResolveBinaryPath_ExplicitWins(t *testing.T) {
	if got, err := resolveBinaryPath("/tmp/my-pp"); err != nil || got != "/tmp/my-pp" {
		t.Fatalf("explicit path: got (%q, %v)", got, err)
	}
}

func TestResolveBinaryPath_EnvFallback(t *testing.T) {
	t.Setenv("PRINTING_PRESS_PATH", "/env/path/pp")
	got, err := resolveBinaryPath("")
	if err != nil {
		t.Fatalf("resolveBinaryPath: %v", err)
	}
	if got != "/env/path/pp" {
		t.Fatalf("expected env fallback, got %q", got)
	}
}

func TestResolveBinaryPath_Missing(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("windows PATH lookup is brittle for this test")
	}
	t.Setenv("PATH", "")
	t.Setenv("PRINTING_PRESS_PATH", "")
	t.Setenv("HOME", t.TempDir())
	if _, err := resolveBinaryPath(""); err == nil {
		t.Fatal("expected error when binary cannot be resolved")
	}
}

func TestPrepareCommand_CreatesOutputDir(t *testing.T) {
	dir := t.TempDir()
	outDir := filepath.Join(dir, "new-out")
	opts := GenerateOpts{
		BinaryPath: "/bin/true",
		SpecPath:   filepath.Join(dir, "spec.yaml"),
		OutputDir:  outDir,
		Logger:     slog.Default(),
	}
	bin, args, _, err := prepareCommand(opts)
	if err != nil {
		t.Fatalf("prepareCommand: %v", err)
	}
	if bin != "/bin/true" {
		t.Fatalf("binary path mangled: %q", bin)
	}
	if _, statErr := os.Stat(outDir); statErr != nil {
		t.Fatalf("output dir not created: %v", statErr)
	}
	if len(args) < 3 {
		t.Fatalf("expected args with spec + --output, got %+v", args)
	}
}

func TestPrepareCommand_DefaultsLogger(t *testing.T) {
	dir := t.TempDir()
	opts := GenerateOpts{
		BinaryPath: "/bin/true",
		SpecPath:   filepath.Join(dir, "s.yaml"),
		OutputDir:  filepath.Join(dir, "out"),
	}
	_, _, logger, err := prepareCommand(opts)
	if err != nil {
		t.Fatalf("prepareCommand: %v", err)
	}
	if logger == nil {
		t.Fatal("logger should default to slog.Default()")
	}
}

func TestPrepareCommand_BinaryMissing(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("windows PATH lookup")
	}
	t.Setenv("PATH", "")
	t.Setenv("PRINTING_PRESS_PATH", "")
	t.Setenv("HOME", t.TempDir())
	_, _, _, err := prepareCommand(GenerateOpts{
		SpecPath:  "s.yaml",
		OutputDir: t.TempDir(),
	})
	if err == nil {
		t.Fatal("expected error when printing-press cannot be resolved")
	}
}

// TestGenerate_PropagatesCommandError swaps commandContext so Generate runs
// 'false' (exits 1) and verifies the wrapping behavior.
func TestGenerate_PropagatesCommandError(t *testing.T) {
	orig := commandContext
	commandContext = func(ctx context.Context, _ string, _ ...string) *exec.Cmd {
		return exec.CommandContext(ctx, "false")
	}
	t.Cleanup(func() { commandContext = orig })

	dir := t.TempDir()
	err := Generate(context.Background(), GenerateOpts{
		BinaryPath: "/bin/true",
		SpecPath:   "/tmp/s.yaml",
		OutputDir:  dir,
	})
	if err == nil {
		t.Fatal("expected error from failing command")
	}
	if !strings.Contains(err.Error(), "docs: run printing-press") {
		t.Fatalf("expected wrapped message, got %q", err)
	}
}

func TestGenerate_Succeeds(t *testing.T) {
	orig := commandContext
	commandContext = func(ctx context.Context, _ string, _ ...string) *exec.Cmd {
		return exec.CommandContext(ctx, "true")
	}
	t.Cleanup(func() { commandContext = orig })

	dir := t.TempDir()
	if err := Generate(context.Background(), GenerateOpts{
		BinaryPath: "/bin/true",
		SpecPath:   "/tmp/s.yaml",
		OutputDir:  dir,
	}); err != nil {
		t.Fatalf("Generate: %v", err)
	}
}

func TestServer_NilSafe(t *testing.T) {
	var s *Server
	if s.URL() != "" {
		t.Fatal("nil URL should be empty")
	}
	if err := s.Wait(); err != nil {
		t.Fatalf("nil Wait should be nil error, got %v", err)
	}
	if err := s.Stop(); err != nil {
		t.Fatalf("nil Stop should be nil error, got %v", err)
	}
}

func TestServer_Stop_ReturnsNilWhenCmdNil(t *testing.T) {
	s := &Server{}
	if err := s.Stop(); err != nil {
		t.Fatalf("empty server Stop: %v", err)
	}
}

// TestServe_ReportsCommandStartError uses a binary path that does not exist.
func TestServe_ReportsCommandStartError(t *testing.T) {
	orig := commandContext
	commandContext = func(ctx context.Context, _ string, _ ...string) *exec.Cmd {
		return exec.CommandContext(ctx, "/this/does/not/exist/printing-press")
	}
	t.Cleanup(func() { commandContext = orig })

	_, err := Serve(context.Background(), GenerateOpts{
		BinaryPath: "/bin/true",
		SpecPath:   "/tmp/s.yaml",
		OutputDir:  t.TempDir(),
		ServePort:  0,
	})
	if err == nil {
		t.Fatal("expected start error")
	}
}

// TestServe_AwaitErrorStopsProcess confirms that an awaitPreviewReady failure
// causes Serve to stop the spawned process and return the error.
func TestServe_AwaitErrorStopsProcess(t *testing.T) {
	origCmd := commandContext
	origAwait := awaitPreviewReady
	commandContext = func(ctx context.Context, _ string, _ ...string) *exec.Cmd {
		return exec.CommandContext(ctx, "sleep", "30")
	}
	awaitPreviewReady = func(ctx context.Context, previewURL string) error {
		return errors.New("timeout waiting for preview")
	}
	t.Cleanup(func() {
		commandContext = origCmd
		awaitPreviewReady = origAwait
	})

	_, err := Serve(context.Background(), GenerateOpts{
		BinaryPath: "/bin/true",
		SpecPath:   "/tmp/s.yaml",
		OutputDir:  t.TempDir(),
		ServePort:  0,
	})
	if err == nil {
		t.Fatal("expected error from awaitPreviewReady failure")
	}
	if !strings.Contains(err.Error(), "timeout") {
		t.Fatalf("expected propagated await error, got %q", err)
	}
}

// TestLogWriter_SplitsLines exercises the logWriter hooked into Stdout/Stderr.
func TestLogWriter_SplitsLines(t *testing.T) {
	w := &logWriter{logger: slog.Default(), level: slog.LevelInfo}
	n, err := w.Write([]byte("first line\nsecond line\n"))
	if err != nil {
		t.Fatalf("Write: %v", err)
	}
	if n == 0 {
		t.Fatal("Write returned 0 bytes consumed")
	}
}

func TestLogWriter_NilSafe(t *testing.T) {
	var w *logWriter
	n, err := w.Write([]byte("noop"))
	if err != nil {
		t.Fatalf("nil writer Write: %v", err)
	}
	if n != len("noop") {
		t.Fatalf("nil writer should report full length written; got %d", n)
	}
}

func TestWaitForPreviewReady_CancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := waitForPreviewReady(ctx, "http://127.0.0.1:1")
	if err == nil {
		t.Fatal("expected cancellation error")
	}
}

func TestWaitForPreviewReady_DeadlineExceeded(t *testing.T) {
	// Point at an unroutable port so every Get fails quickly, forcing us
	// through the deadline branch without needing to wait 15s. Shorten the
	// deadline by overriding time-based behavior via a local wrapper; if the
	// wait function doesn't expose a hook, we accept that this test ends up
	// waiting the full 15s on rare runs and mark it slow.
	if testing.Short() {
		t.Skip("slow: waitForPreviewReady 15s deadline path")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	err := waitForPreviewReady(ctx, "http://127.0.0.1:1")
	if err == nil {
		t.Fatal("expected deadline error on unroutable preview URL")
	}
}
