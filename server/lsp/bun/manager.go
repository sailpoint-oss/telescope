package bun

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/fsnotify/fsnotify"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// Manager manages the lifecycle of the Bun sidecar process.
type Manager struct {
	mu        sync.Mutex
	cmd       *exec.Cmd
	conn      net.Conn
	logger    *slog.Logger
	available atomic.Bool

	pendingMu sync.Mutex
	pending   map[string]chan *Envelope
	nextID    atomic.Uint64

	socketPath string
	listener   net.Listener
	workDir    string
	readDone   chan struct{}
	tmpDir     string // temp directory holding the extracted runner binary

	ensureOnce  sync.Once
	ensureErr   error
	ensureCtx   context.Context
	healthStop  chan struct{}
	restartFailed atomic.Bool
}

// NewManager creates a new Bun sidecar manager.
func NewManager(logger *slog.Logger) *Manager {
	if logger == nil {
		logger = slog.Default()
	}
	return &Manager{
		logger:  logger,
		pending: make(map[string]chan *Envelope),
	}
}

// EnsureStarted lazily starts the sidecar on first use via sync.Once.
func (m *Manager) EnsureStarted(ctx context.Context) error {
	m.ensureOnce.Do(func() {
		m.ensureCtx = ctx
		m.ensureErr = m.Start(ctx)
	})
	return m.ensureErr
}

// Available reports whether the Bun runtime is available and connected.
func (m *Manager) Available() bool {
	return m.available.Load()
}

// Start spawns the Bun sidecar process and establishes IPC.
// The runner binary is embedded per-platform via //go:embed. In development
// mode (TELESCOPE_DEV=1), falls back to running src/runner.ts with bun.
func (m *Manager) Start(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.cmd != nil {
		return nil
	}

	runnerPath, err := m.extractRunner()
	if err != nil {
		m.logger.Warn("bun runner not available", "err", err)
		return nil
	}

	m.socketPath = filepath.Join(os.TempDir(), fmt.Sprintf("telescope-%d.sock", os.Getpid()))
	os.Remove(m.socketPath)

	if runtime.GOOS == "windows" {
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			return fmt.Errorf("listen tcp: %w", err)
		}
		m.listener = listener
		m.socketPath = listener.Addr().String()
	} else {
		listener, err := net.Listen("unix", m.socketPath)
		if err != nil {
			return fmt.Errorf("listen unix: %w", err)
		}
		m.listener = listener
	}

	// The extracted runner is a self-contained compiled binary — spawn it directly.
	cmd := exec.CommandContext(ctx, runnerPath)
	cmd.Env = append(os.Environ(), "TELESCOPE_SOCKET="+m.socketPath)
	cmd.Stderr = &logWriter{logger: m.logger, level: slog.LevelWarn}
	cmd.Stdout = &logWriter{logger: m.logger, level: slog.LevelDebug}

	if err := cmd.Start(); err != nil {
		m.listener.Close()
		return fmt.Errorf("starting bun runner: %w", err)
	}
	m.cmd = cmd

	deadline := time.Now().Add(10 * time.Second)
	if dl, ok := m.listener.(*net.UnixListener); ok {
		dl.SetDeadline(deadline)
	}

	conn, err := m.listener.Accept()
	if err != nil {
		m.cmd.Process.Kill()
		m.cmd = nil
		m.listener.Close()
		return fmt.Errorf("bun runner did not connect: %w", err)
	}
	m.conn = conn

	readyCh := make(chan struct{}, 1)
	m.readDone = make(chan struct{})
	go m.readLoop(ctx, readyCh)

	select {
	case <-readyCh:
		m.available.Store(true)
		m.logger.Info("bun rule runner ready")
	case <-time.After(10 * time.Second):
		m.cmd.Process.Kill()
		m.cmd = nil
		m.conn.Close()
		m.listener.Close()
		return fmt.Errorf("bun runner timeout waiting for ready")
	case <-ctx.Done():
		m.cmd.Process.Kill()
		m.cmd = nil
		m.conn.Close()
		m.listener.Close()
		return ctx.Err()
	}

	m.healthStop = make(chan struct{})
	go m.healthCheckLoop(ctx, m.healthStop)

	return nil
}

// healthCheckLoop sends a ping every 30s and expects a pong within 5s.
func (m *Manager) healthCheckLoop(ctx context.Context, stop <-chan struct{}) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			if !m.Available() {
				return
			}
			env := &Envelope{ID: m.newRequestID(), Type: MsgPing}
			resp, err := m.sendRequest(ctx, env, 5*time.Second)
			if err != nil || resp == nil || resp.Type != MsgPong {
				m.logger.Warn("bun sidecar health check failed, triggering restart")
				m.tryRestart(ctx)
				return
			}
		case <-ctx.Done():
			return
		case <-stop:
			return
		}
	}
}

// tryRestart attempts one restart after a sidecar crash.
func (m *Manager) tryRestart(ctx context.Context) {
	if m.restartFailed.Load() {
		return
	}
	m.mu.Lock()
	m.available.Store(false)
	if m.conn != nil {
		m.conn.Close()
		m.conn = nil
	}
	if m.cmd != nil {
		_ = m.cmd.Process.Kill()
		_ = m.cmd.Wait()
		m.cmd = nil
	}
	if m.listener != nil {
		m.listener.Close()
		m.listener = nil
	}
	m.mu.Unlock()

	// Reset once so Start can be called again
	m.ensureOnce = sync.Once{}
	if err := m.Start(ctx); err != nil {
		m.logger.Error("bun sidecar restart failed permanently", "err", err)
		m.restartFailed.Store(true)
	} else {
		m.logger.Info("bun sidecar restarted successfully")
	}
}

// Stop shuts down the sidecar.
func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.available.Store(false)

	if m.healthStop != nil {
		close(m.healthStop)
		m.healthStop = nil
	}

	if m.conn != nil {
		m.send(&Envelope{ID: "shutdown", Type: MsgShutdown})
		time.Sleep(100 * time.Millisecond)
		m.conn.Close()
		m.conn = nil
	}

	if m.cmd != nil {
		_ = m.cmd.Process.Kill()
		_ = m.cmd.Wait()
		m.cmd = nil
	}

	if m.listener != nil {
		m.listener.Close()
		m.listener = nil
	}

	if m.socketPath != "" && runtime.GOOS != "windows" {
		os.Remove(m.socketPath)
	}

	if m.tmpDir != "" {
		os.RemoveAll(m.tmpDir)
		m.tmpDir = ""
	}

	if m.readDone != nil {
		<-m.readDone
	}
}

func (m *Manager) readLoop(ctx context.Context, readyCh chan<- struct{}) {
	defer close(m.readDone)
	scanner := bufio.NewScanner(m.conn)
	scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)

	readyFired := false
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var env Envelope
		if err := json.Unmarshal([]byte(line), &env); err != nil {
			m.logger.Warn("failed to parse sidecar message", "err", err, "line", line[:min(len(line), 200)])
			continue
		}

		if env.Type == MsgReady && !readyFired {
			readyFired = true
			readyCh <- struct{}{}
			continue
		}

		m.pendingMu.Lock()
		ch, ok := m.pending[env.ID]
		if ok {
			delete(m.pending, env.ID)
		}
		m.pendingMu.Unlock()

		if ok {
			ch <- &env
		}
	}

	// Scanner EOF = sidecar crashed. Drain pending requests and attempt restart.
	m.available.Store(false)
	m.pendingMu.Lock()
	for id, ch := range m.pending {
		close(ch)
		delete(m.pending, id)
	}
	m.pendingMu.Unlock()

	m.logger.Warn("bun sidecar connection lost, attempting restart")
	go m.tryRestart(ctx)
}

func (m *Manager) send(env *Envelope) error {
	data, err := json.Marshal(env)
	if err != nil {
		return err
	}
	data = append(data, '\n')
	_, err = m.conn.Write(data)
	return err
}

func (m *Manager) newRequestID() string {
	return strconv.FormatUint(m.nextID.Add(1), 10)
}

func (m *Manager) sendRequest(ctx context.Context, env *Envelope, timeout time.Duration) (*Envelope, error) {
	ch := make(chan *Envelope, 1)

	m.pendingMu.Lock()
	m.pending[env.ID] = ch
	m.pendingMu.Unlock()

	defer func() {
		m.pendingMu.Lock()
		delete(m.pending, env.ID)
		m.pendingMu.Unlock()
	}()

	if err := m.send(env); err != nil {
		return nil, err
	}

	select {
	case resp := <-ch:
		return resp, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(timeout):
		return nil, fmt.Errorf("request timeout after %v", timeout)
	}
}

// RunRules sends a document to the sidecar for analysis and returns core diagnostics.
func (m *Manager) RunRules(ctx context.Context, req *RunRulesRequest) (*RunRulesResponse, error) {
	if !m.Available() || req == nil {
		return nil, nil
	}

	env := &Envelope{
		ID:      m.newRequestID(),
		Type:    MsgRunRules,
		Payload: req,
	}

	resp, err := m.sendRequest(ctx, env, 30*time.Second)
	if err != nil {
		return nil, fmt.Errorf("runRules: %w", err)
	}

	payloadBytes, err := json.Marshal(resp.Payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	var result RunRulesResponse
	if err := json.Unmarshal(payloadBytes, &result); err != nil {
		return nil, fmt.Errorf("unmarshal runRules response: %w", err)
	}
	return &result, nil
}

// RunSpectral sends a document to the sidecar for Spectral ruleset execution.
func (m *Manager) RunSpectral(ctx context.Context, req *RunSpectralRequest) (*RunSpectralResponse, error) {
	if !m.Available() || req == nil {
		return nil, nil
	}

	env := &Envelope{
		ID:      m.newRequestID(),
		Type:    MsgRunSpectral,
		Payload: req,
	}

	resp, err := m.sendRequest(ctx, env, 30*time.Second)
	if err != nil {
		return nil, fmt.Errorf("runSpectral: %w", err)
	}

	payloadBytes, err := json.Marshal(resp.Payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	var result RunSpectralResponse
	if err := json.Unmarshal(payloadBytes, &result); err != nil {
		return nil, fmt.Errorf("unmarshal runSpectral response: %w", err)
	}
	return &result, nil
}

// RunZod sends a document to the sidecar for Zod overlay schema validation.
func (m *Manager) RunZod(ctx context.Context, req *RunZodRequest) (*RunZodResponse, error) {
	if !m.Available() || req == nil {
		return nil, nil
	}

	env := &Envelope{
		ID:      m.newRequestID(),
		Type:    MsgRunZod,
		Payload: req,
	}

	resp, err := m.sendRequest(ctx, env, 30*time.Second)
	if err != nil {
		return nil, fmt.Errorf("runZod: %w", err)
	}

	payloadBytes, err := json.Marshal(resp.Payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	var result RunZodResponse
	if err := json.Unmarshal(payloadBytes, &result); err != nil {
		return nil, fmt.Errorf("unmarshal runZod response: %w", err)
	}
	return &result, nil
}

// LoadRules tells the sidecar to load rules from the specified configurations.
func (m *Manager) LoadRules(ctx context.Context, req *LoadRulesRequest) error {
	if !m.Available() || req == nil {
		return nil
	}

	env := &Envelope{
		ID:      m.newRequestID(),
		Type:    MsgLoadRules,
		Payload: req,
	}

	resp, err := m.sendRequest(ctx, env, 10*time.Second)
	if err != nil {
		return fmt.Errorf("loadRules: %w", err)
	}

	if resp.Type == MsgRuleError {
		return fmt.Errorf("rule load error: %v", resp.Payload)
	}

	return nil
}

// WatchRules watches .telescope/rules/ and .telescope/schemas/ for changes,
// reloading rules when files are modified.
func (m *Manager) WatchRules(ctx context.Context, telescopeDir string, reloadFn func()) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		m.logger.Warn("failed to create fsnotify watcher", "err", err)
		return
	}

	rulesDir := filepath.Join(telescopeDir, "rules")
	schemasDir := filepath.Join(telescopeDir, "schemas")

	if err := watcher.Add(rulesDir); err != nil {
		m.logger.Debug("failed to watch rules dir", "dir", rulesDir, "err", err)
	}
	if err := watcher.Add(schemasDir); err != nil {
		m.logger.Debug("failed to watch schemas dir", "dir", schemasDir, "err", err)
	}

	go func() {
		defer watcher.Close()
		debounce := time.NewTimer(0)
		if !debounce.Stop() {
			<-debounce.C
		}

		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) {
					ext := strings.ToLower(filepath.Ext(event.Name))
					if ext == ".ts" || ext == ".js" || ext == ".json" || ext == ".yaml" || ext == ".yml" {
						debounce.Reset(500 * time.Millisecond)
					}
				}
			case <-debounce.C:
				m.logger.Info("reloading custom rules after file change")
				if reloadFn != nil {
					reloadFn()
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				m.logger.Warn("fsnotify error", "err", err)
			case <-ctx.Done():
				return
			}
		}
	}()
}

// extractRunner extracts the embedded compiled runner binary to a temp directory
// and returns the path to the executable. In dev mode (TELESCOPE_DEV=1), runs
// src/runner.ts directly with bun on PATH (takes priority over the embedded
// binary so developers can iterate on the runner source without recompiling).
func (m *Manager) extractRunner() (string, error) {
	if os.Getenv("TELESCOPE_DEV") == "1" {
		if path, err := m.extractDevRunner(); err == nil {
			return path, nil
		}
	}

	if len(runnerBinary) > 0 {
		dir, err := os.MkdirTemp("", "telescope-runner-*")
		if err != nil {
			return "", fmt.Errorf("creating temp dir: %w", err)
		}
		m.tmpDir = dir

		name := "telescope-runner"
		if runtime.GOOS == "windows" {
			name += ".exe"
		}
		binPath := filepath.Join(dir, name)
		if err := os.WriteFile(binPath, runnerBinary, 0700); err != nil {
			return "", fmt.Errorf("writing runner binary: %w", err)
		}
		return binPath, nil
	}

	return "", fmt.Errorf("embedded runner binary not available for %s/%s (set TELESCOPE_DEV=1 for dev mode)", runtime.GOOS, runtime.GOARCH)
}

// extractDevRunner creates a wrapper script that runs src/runner.ts with bun.
func (m *Manager) extractDevRunner() (string, error) {
	bunPath, err := exec.LookPath("bun")
	if err != nil {
		return "", fmt.Errorf("TELESCOPE_DEV=1 but bun not found on PATH: %w", err)
	}

	devScript := findDevRunnerScript()
	if devScript == "" {
		return "", fmt.Errorf("TELESCOPE_DEV=1 but could not locate runner/src/runner.ts")
	}

	dir, err := os.MkdirTemp("", "telescope-runner-dev-*")
	if err != nil {
		return "", err
	}
	m.tmpDir = dir

	wrapperPath := filepath.Join(dir, "telescope-runner-dev")
	wrapper := fmt.Sprintf("#!/bin/sh\nexec %s run %s \"$@\"\n", bunPath, devScript)
	if runtime.GOOS == "windows" {
		wrapperPath += ".cmd"
		wrapper = fmt.Sprintf("@echo off\n\"%s\" run \"%s\" %%*\n", bunPath, devScript)
	}
	if err := os.WriteFile(wrapperPath, []byte(wrapper), 0700); err != nil {
		return "", err
	}
	return wrapperPath, nil
}

// findDevRunnerScript locates src/runner.ts for development mode.
func findDevRunnerScript() string {
	// Try relative to the working directory (common when running `go run .` from server/)
	candidates := []string{
		"lsp/bun/runner/src/runner.ts",
		"server/lsp/bun/runner/src/runner.ts",
	}
	wd, wdErr := os.Getwd()
	ex, exErr := os.Executable()

	if wdErr == nil {
		for _, c := range candidates {
			p := filepath.Join(wd, c)
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}

	// Try walking up from the executable
	if exErr == nil {
		dir := filepath.Dir(ex)
		for i := 0; i < 6; i++ {
			for _, sub := range []string{
				filepath.Join("lsp", "bun", "runner", "src", "runner.ts"),
				filepath.Join("server", "lsp", "bun", "runner", "src", "runner.ts"),
			} {
				p := filepath.Join(dir, sub)
				if _, err := os.Stat(p); err == nil {
					return p
				}
			}
			dir = filepath.Dir(dir)
		}
	}

	return ""
}

// convertDiagnostics converts sidecar diagnostics to core types.
func convertDiagnostics(diags []SidecarDiagnostic) []ctypes.Diagnostic {
	if len(diags) == 0 {
		return nil
	}
	out := make([]ctypes.Diagnostic, 0, len(diags))
	for _, d := range diags {
		sev := ctypes.Severity(d.Severity)
		if sev < ctypes.SeverityError || sev > ctypes.SeverityHint {
			sev = ctypes.SeverityWarning
		}
		out = append(out, ctypes.Diagnostic{
			Range: ctypes.Range{
				Start: ctypes.Position{Line: d.StartLine, Character: d.StartChar},
				End:   ctypes.Position{Line: d.EndLine, Character: d.EndChar},
			},
			Severity: sev,
			Code:     d.Code,
			Source:   d.Source,
			Message:  d.Message,
		})
	}
	return out
}

type logWriter struct {
	logger *slog.Logger
	level  slog.Level
}

func (w *logWriter) Write(p []byte) (n int, err error) {
	msg := strings.TrimSpace(string(p))
	if msg != "" {
		w.logger.Log(context.Background(), w.level, "bun-sidecar", "output", msg)
	}
	return len(p), nil
}
