// Package wiretap manages the optional pb33f/wiretap sidecar process.
package wiretap

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// SidecarOpts configures a wiretap subprocess.
type SidecarOpts struct {
	BinaryPath  string
	SpecPath    string
	UpstreamURL string
	ProxyPort   int
	MonitorPort int
	ExtraArgs   []string
	Logger      *slog.Logger
}

// Sidecar is a managed wiretap subprocess.
type Sidecar struct {
	mu         sync.Mutex
	cmd        *exec.Cmd
	waitCh     chan error
	proxyURL   string
	monitorURL string
	reportFile string
	logger     *slog.Logger
}

// Start launches wiretap as a subprocess. Call WaitReady before using ProxyURL.
func Start(ctx context.Context, opts SidecarOpts) (*Sidecar, error) {
	if strings.TrimSpace(opts.SpecPath) == "" {
		return nil, fmt.Errorf("wiretap: spec path is required")
	}
	if strings.TrimSpace(opts.UpstreamURL) == "" {
		return nil, fmt.Errorf("wiretap: upstream URL is required")
	}
	logger := opts.Logger
	if logger == nil {
		logger = slog.Default()
	}
	binaryPath, err := resolveBinaryPath(opts.BinaryPath)
	if err != nil {
		return nil, err
	}
	proxyPort := opts.ProxyPort
	if proxyPort == 0 {
		proxyPort, err = pickFreePort()
		if err != nil {
			return nil, err
		}
	}
	monitorPort := opts.MonitorPort
	if monitorPort == 0 {
		monitorPort, err = pickFreePort()
		if err != nil {
			return nil, err
		}
	}
	wsPort, err := pickFreePort()
	if err != nil {
		return nil, err
	}
	reportFile, err := reserveReportFile()
	if err != nil {
		return nil, err
	}

	args := []string{
		"-u", opts.UpstreamURL,
		"-s", opts.SpecPath,
		"-p", fmt.Sprintf("%d", proxyPort),
		"-m", fmt.Sprintf("%d", monitorPort),
		"-w", fmt.Sprintf("%d", wsPort),
		"--stream-report",
		"--report-filename", reportFile,
	}
	args = append(args, opts.ExtraArgs...)

	cmd := exec.CommandContext(ctx, binaryPath, args...)
	cmd.Stdout = &logWriter{logger: logger, level: slog.LevelInfo}
	cmd.Stderr = &logWriter{logger: logger, level: slog.LevelWarn}
	cmd.Dir = filepath.Dir(opts.SpecPath)

	if err := cmd.Start(); err != nil {
		_ = os.Remove(reportFile)
		return nil, fmt.Errorf("wiretap: start %q: %w", binaryPath, err)
	}

	sidecar := &Sidecar{
		cmd:        cmd,
		waitCh:     make(chan error, 1),
		proxyURL:   fmt.Sprintf("http://127.0.0.1:%d", proxyPort),
		monitorURL: fmt.Sprintf("http://127.0.0.1:%d", monitorPort),
		reportFile: reportFile,
		logger:     logger,
	}
	go func() {
		sidecar.waitCh <- cmd.Wait()
		close(sidecar.waitCh)
	}()
	return sidecar, nil
}

// ProxyURL returns the proxy endpoint clients should use.
func (s *Sidecar) ProxyURL() string {
	if s == nil {
		return ""
	}
	return s.proxyURL
}

// MonitorURL returns the monitor UI URL.
func (s *Sidecar) MonitorURL() string {
	if s == nil {
		return ""
	}
	return s.monitorURL
}

// WaitReady blocks until the proxy port starts accepting connections.
func (s *Sidecar) WaitReady(ctx context.Context) error {
	if s == nil {
		return fmt.Errorf("wiretap: sidecar is nil")
	}
	address := strings.TrimPrefix(s.proxyURL, "http://")
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		conn, err := net.DialTimeout("tcp", address, 250*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case waitErr, ok := <-s.waitCh:
			if !ok || waitErr == nil {
				return fmt.Errorf("wiretap exited before becoming ready")
			}
			return fmt.Errorf("wiretap exited before becoming ready: %w", waitErr)
		case <-ticker.C:
		}
	}
}

// Stop terminates the wiretap process and cleans up the report file.
func (s *Sidecar) Stop() error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	cmd := s.cmd
	waitCh := s.waitCh
	reportFile := s.reportFile
	s.cmd = nil
	s.reportFile = ""
	s.mu.Unlock()

	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Signal(os.Interrupt)
		select {
		case <-time.After(1 * time.Second):
			_ = cmd.Process.Kill()
		case <-waitCh:
			waitCh = nil
		}
	}
	if waitCh != nil {
		select {
		case <-waitCh:
		default:
		}
	}
	if reportFile != "" {
		_ = os.Remove(reportFile)
	}
	return nil
}

func resolveBinaryPath(explicit string) (string, error) {
	if p := strings.TrimSpace(explicit); p != "" {
		return filepath.Clean(p), nil
	}
	if p := strings.TrimSpace(os.Getenv("WIRETAP_PATH")); p != "" {
		return filepath.Clean(p), nil
	}
	if p, err := exec.LookPath("wiretap"); err == nil {
		return p, nil
	}
	if home, err := os.UserHomeDir(); err == nil {
		name := "wiretap"
		if runtime.GOOS == "windows" {
			name += ".exe"
		}
		p := filepath.Join(home, ".telescope", "bin", name)
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("wiretap: binary not found (set contractTests.wiretap.binaryPath, WIRETAP_PATH, or install wiretap on PATH)")
}

func pickFreePort() (int, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, fmt.Errorf("wiretap: pick free port: %w", err)
	}
	defer ln.Close()
	addr, ok := ln.Addr().(*net.TCPAddr)
	if !ok {
		return 0, fmt.Errorf("wiretap: unexpected listener addr %T", ln.Addr())
	}
	return addr.Port, nil
}

func reserveReportFile() (string, error) {
	f, err := os.CreateTemp("", "telescope-wiretap-*.jsonl")
	if err != nil {
		return "", fmt.Errorf("wiretap: create report file: %w", err)
	}
	name := f.Name()
	if err := f.Close(); err != nil {
		_ = os.Remove(name)
		return "", err
	}
	return name, nil
}

type logWriter struct {
	logger *slog.Logger
	level  slog.Level
}

func (w *logWriter) Write(p []byte) (int, error) {
	if w == nil || w.logger == nil {
		return len(p), nil
	}
	scanner := bufio.NewScanner(strings.NewReader(string(p)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			w.logger.Log(context.Background(), w.level, "wiretap", "message", line)
		}
	}
	return len(p), nil
}

var _ io.Writer = (*logWriter)(nil)
