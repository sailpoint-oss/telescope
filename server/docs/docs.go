package docs

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

type GenerateOpts struct {
	BinaryPath string
	SpecPath   string
	OutputDir  string
	Title      string
	Theme      string
	Publish    bool
	Serve      bool
	ServePort  int
	NoLLM      bool
	NoJSON     bool
	NoHTML     bool
	Logger     *slog.Logger
}

type Server struct {
	mu         sync.Mutex
	cmd        *exec.Cmd
	waitCh     chan struct{}
	waitErr    error
	previewURL string
	logger     *slog.Logger
}

var commandContext = exec.CommandContext
var awaitPreviewReady = waitForPreviewReady

func Generate(ctx context.Context, opts GenerateOpts) error {
	binaryPath, args, logger, err := prepareCommand(opts)
	if err != nil {
		return err
	}
	cmd := commandContext(ctx, binaryPath, args...)
	cmd.Stdout = &logWriter{logger: logger, level: slog.LevelInfo}
	cmd.Stderr = &logWriter{logger: logger, level: slog.LevelWarn}
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("docs: run printing-press: %w", err)
	}
	return nil
}

func Serve(ctx context.Context, opts GenerateOpts) (*Server, error) {
	opts.Serve = true
	binaryPath, args, logger, err := prepareCommand(opts)
	if err != nil {
		return nil, err
	}
	servePort := opts.ServePort
	if servePort == 0 {
		servePort, err = pickFreePort()
		if err != nil {
			return nil, err
		}
		args = buildArgs(normalizeOpts(opts, servePort))
	}

	cmd := commandContext(ctx, binaryPath, args...)
	cmd.Stdout = &logWriter{logger: logger, level: slog.LevelInfo}
	cmd.Stderr = &logWriter{logger: logger, level: slog.LevelWarn}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("docs: start printing-press: %w", err)
	}

	server := &Server{
		cmd:        cmd,
		waitCh:     make(chan struct{}),
		previewURL: fmt.Sprintf("http://127.0.0.1:%d", servePort),
		logger:     logger,
	}
	go func() {
		server.mu.Lock()
		server.waitErr = cmd.Wait()
		server.mu.Unlock()
		close(server.waitCh)
	}()

	if err := awaitPreviewReady(ctx, server.previewURL); err != nil {
		_ = server.Stop()
		return nil, err
	}
	return server, nil
}

func (s *Server) URL() string {
	if s == nil {
		return ""
	}
	return s.previewURL
}

func (s *Server) Wait() error {
	if s == nil || s.waitCh == nil {
		return nil
	}
	<-s.waitCh
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.waitErr
}

func (s *Server) Stop() error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	cmd := s.cmd
	waitCh := s.waitCh
	s.mu.Unlock()
	if cmd == nil {
		return nil
	}
	if cmd.Process != nil {
		_ = cmd.Process.Signal(os.Interrupt)
	}
	select {
	case <-waitCh:
	case <-time.After(2 * time.Second):
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		<-waitCh
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.waitErr == nil {
		return nil
	}
	if _, ok := s.waitErr.(*exec.ExitError); ok {
		return nil
	}
	return s.waitErr
}

func prepareCommand(opts GenerateOpts) (string, []string, *slog.Logger, error) {
	opts = normalizeOpts(opts, opts.ServePort)
	logger := opts.Logger
	if logger == nil {
		logger = slog.Default()
	}
	binaryPath, err := resolveBinaryPath(opts.BinaryPath)
	if err != nil {
		return "", nil, nil, err
	}
	if err := os.MkdirAll(opts.OutputDir, 0o755); err != nil {
		return "", nil, nil, fmt.Errorf("docs: create output dir: %w", err)
	}
	return binaryPath, buildArgs(opts), logger, nil
}

func normalizeOpts(opts GenerateOpts, servePort int) GenerateOpts {
	if strings.TrimSpace(opts.OutputDir) == "" {
		opts.OutputDir = "./docs"
	}
	if strings.TrimSpace(opts.Theme) == "" {
		opts.Theme = "dark"
	}
	if servePort != 0 {
		opts.ServePort = servePort
	}
	return opts
}

func buildArgs(opts GenerateOpts) []string {
	args := []string{opts.SpecPath, "--output", opts.OutputDir}
	if title := strings.TrimSpace(opts.Title); title != "" {
		args = append(args, "--title", title)
	}
	if theme := strings.TrimSpace(opts.Theme); theme != "" {
		args = append(args, "--theme", theme)
	}
	if opts.Publish {
		args = append(args, "--publish")
	}
	if opts.Serve {
		args = append(args, "--serve", "--port", strconv.Itoa(opts.ServePort))
	}
	if opts.NoLLM {
		args = append(args, "--no-llm")
	}
	if opts.NoJSON {
		args = append(args, "--no-json")
	}
	if opts.NoHTML {
		args = append(args, "--no-html")
	}
	return args
}

func resolveBinaryPath(binaryPath string) (string, error) {
	if p := strings.TrimSpace(binaryPath); p != "" {
		return p, nil
	}
	if p := strings.TrimSpace(os.Getenv("PRINTING_PRESS_PATH")); p != "" {
		return p, nil
	}
	if p, err := exec.LookPath("printing-press"); err == nil {
		return p, nil
	}
	home, err := os.UserHomeDir()
	if err == nil {
		name := "printing-press"
		if runtime.GOOS == "windows" {
			name += ".exe"
		}
		candidate := filepath.Join(home, ".telescope", "bin", name)
		if _, statErr := os.Stat(candidate); statErr == nil {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("docs: printing-press binary not found (set docs.binaryPath, PRINTING_PRESS_PATH, or install printing-press on PATH)")
}

func waitForPreviewReady(ctx context.Context, previewURL string) error {
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(15 * time.Second)
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, previewURL, nil)
		if err == nil {
			resp, err := client.Do(req)
			if err == nil {
				resp.Body.Close()
				return nil
			}
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("docs: preview not ready at %s", previewURL)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
	}
}

func pickFreePort() (int, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, fmt.Errorf("docs: pick free port: %w", err)
	}
	defer ln.Close()
	tcpAddr, ok := ln.Addr().(*net.TCPAddr)
	if !ok {
		return 0, fmt.Errorf("docs: unexpected listener addr %T", ln.Addr())
	}
	return tcpAddr.Port, nil
}

type logWriter struct {
	logger *slog.Logger
	level  slog.Level
}

func (w *logWriter) Write(p []byte) (int, error) {
	if w == nil || w.logger == nil || len(p) == 0 {
		return len(p), nil
	}
	scanner := bufio.NewScanner(strings.NewReader(string(p)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			w.logger.Log(context.Background(), w.level, "printing-press", "message", line)
		}
	}
	if err := scanner.Err(); err != nil && err != io.EOF {
		return 0, err
	}
	return len(p), nil
}
