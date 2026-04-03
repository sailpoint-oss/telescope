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
	mu         sync.Mutex
	cmd        *exec.Cmd
	conn       net.Conn
	logger     *slog.Logger
	available  atomic.Bool
	rulesReady atomic.Bool

	pendingMu sync.Mutex
	pending   map[string]chan *Envelope
	nextID    atomic.Uint64

	socketPath  string
	listener    net.Listener
	readDone    chan struct{}
	lastLoadReq *LoadRulesRequest

	healthStop    chan struct{}
	restartFailed atomic.Bool
	rulesExpected atomic.Bool
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

// Available reports whether the Bun runtime is available and connected.
func (m *Manager) Available() bool {
	if !m.available.Load() {
		return false
	}
	if m.rulesExpected.Load() && !m.rulesReady.Load() {
		return false
	}
	return true
}

// SetRulesExpected declares whether custom rules must be loaded before the
// sidecar should be treated as usable.
func (m *Manager) SetRulesExpected(expected bool) {
	m.rulesExpected.Store(expected)
	if expected {
		m.rulesReady.Store(false)
		return
	}
	m.rulesReady.Store(true)
	m.mu.Lock()
	m.lastLoadReq = nil
	m.mu.Unlock()
}

// Start spawns the Bun sidecar process and establishes IPC.
// Telescope now requires Bun on PATH for sidecar-backed features and executes
// a bundled runner script directly with Bun.
func (m *Manager) Start(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.cmd != nil {
		return nil
	}

	bunPath, runnerPath, err := resolveRunnerCommand()
	if err != nil {
		m.logger.Warn("bun sidecar unavailable", "err", err)
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

	cmd := exec.CommandContext(ctx, bunPath, runnerPath)
	cmd.Dir = filepath.Dir(runnerPath)
	cmd.Env = append(os.Environ(), "TELESCOPE_SOCKET="+m.socketPath)
	cmd.Stderr = &logWriter{logger: m.logger, level: slog.LevelWarn}
	cmd.Stdout = &logWriter{logger: m.logger, level: slog.LevelDebug}

	if err := cmd.Start(); err != nil {
		m.listener.Close()
		return fmt.Errorf("starting bun runner: %w", err)
	}
	m.cmd = cmd
	if !m.rulesExpected.Load() {
		m.rulesReady.Store(true)
	}

	deadline := time.Now().Add(10 * time.Second)
	switch l := m.listener.(type) {
	case *net.UnixListener:
		l.SetDeadline(deadline)
	case *net.TCPListener:
		// Windows uses TCP; without a deadline Accept blocks forever if the runner never connects.
		_ = l.SetDeadline(deadline)
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
	m.rulesReady.Store(false)
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

	loadReq := m.snapshotLoadRulesRequest()
	if err := m.Start(ctx); err != nil {
		m.logger.Error("bun sidecar restart failed permanently", "err", err)
		m.restartFailed.Store(true)
		return
	}
	if loadReq != nil {
		if err := m.LoadRules(ctx, loadReq); err != nil {
			m.logger.Error("bun sidecar restart failed to restore custom rules", "err", err)
			return
		}
	}
	if m.rulesExpected.Load() && !m.rulesReady.Load() {
		m.logger.Error("bun sidecar restarted without a restored custom rule set")
		return
	}
	m.logger.Info("bun sidecar restarted successfully")
}

func (m *Manager) snapshotLoadRulesRequest() *LoadRulesRequest {
	m.mu.Lock()
	defer m.mu.Unlock()
	return cloneLoadRulesRequest(m.lastLoadReq)
}

// Stop shuts down the sidecar.
func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.available.Store(false)
	m.rulesReady.Store(false)

	if m.healthStop != nil {
		close(m.healthStop)
		m.healthStop = nil
	}

	if m.conn != nil {
		data, err := json.Marshal(&Envelope{ID: "shutdown", Type: MsgShutdown})
		if err == nil {
			data = append(data, '\n')
			_, _ = m.conn.Write(data)
		}
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

	m.mu.Lock()
	conn := m.conn
	m.mu.Unlock()
	if conn == nil {
		return fmt.Errorf("sidecar connection not available")
	}

	_, err = conn.Write(data)
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
		if resp == nil {
			return nil, fmt.Errorf("sidecar disconnected while waiting for response")
		}
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
	if resp == nil {
		return nil, fmt.Errorf("runRules: empty response")
	}
	if resp.Type != MsgRuleResult {
		return nil, fmt.Errorf("runRules: unexpected response type %q", resp.Type)
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
	if resp == nil {
		return nil, fmt.Errorf("runSpectral: empty response")
	}
	if resp.Type != MsgSpectralResult {
		return nil, fmt.Errorf("runSpectral: unexpected response type %q", resp.Type)
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

// LoadRules tells the sidecar to load rules from the specified configurations.
func (m *Manager) LoadRules(ctx context.Context, req *LoadRulesRequest) error {
	if req == nil {
		return fmt.Errorf("loadRules: nil request")
	}
	m.rulesExpected.Store(len(req.Rules) > 0)
	if len(req.Rules) == 0 {
		m.rulesReady.Store(true)
		m.mu.Lock()
		m.lastLoadReq = nil
		m.mu.Unlock()
		return nil
	}
	if !m.available.Load() {
		return fmt.Errorf("loadRules: sidecar not available")
	}

	env := &Envelope{
		ID:      m.newRequestID(),
		Type:    MsgLoadRules,
		Payload: req,
	}

	resp, err := m.sendRequest(ctx, env, 10*time.Second)
	if err != nil {
		m.rulesReady.Store(false)
		return fmt.Errorf("loadRules: %w", err)
	}
	if resp == nil {
		m.rulesReady.Store(false)
		return fmt.Errorf("loadRules: empty response")
	}

	if resp.Type == MsgRuleError {
		m.rulesReady.Store(false)
		return fmt.Errorf("rule load error: %v", resp.Payload)
	}
	if resp.Type != MsgLoadResponse {
		m.rulesReady.Store(false)
		return fmt.Errorf("loadRules: unexpected response type %q", resp.Type)
	}

	payloadBytes, err := json.Marshal(resp.Payload)
	if err != nil {
		m.rulesReady.Store(false)
		return fmt.Errorf("marshal loadRules payload: %w", err)
	}

	var result LoadRulesResponse
	if err := json.Unmarshal(payloadBytes, &result); err != nil {
		m.rulesReady.Store(false)
		return fmt.Errorf("unmarshal loadRules response: %w", err)
	}
	if len(result.Errors) > 0 {
		m.rulesReady.Store(false)
		return fmt.Errorf("rule load errors: %s", formatRuleLoadErrors(result.Errors))
	}

	m.rulesReady.Store(true)
	m.mu.Lock()
	m.lastLoadReq = cloneLoadRulesRequest(req)
	m.mu.Unlock()
	return nil
}

func cloneLoadRulesRequest(req *LoadRulesRequest) *LoadRulesRequest {
	if req == nil {
		return nil
	}
	cloned := &LoadRulesRequest{
		WorkDir: req.WorkDir,
		Rules:   make([]RuleConfig, len(req.Rules)),
	}
	for i, rule := range req.Rules {
		cloned.Rules[i] = cloneRuleConfig(rule)
	}
	return cloned
}

func cloneRuleConfig(rule RuleConfig) RuleConfig {
	cloned := rule
	if rule.Patterns != nil {
		cloned.Patterns = append([]string(nil), rule.Patterns...)
	}
	if rule.Options != nil {
		cloned.Options = make(map[string]any, len(rule.Options))
		for key, value := range rule.Options {
			cloned.Options[key] = value
		}
	}
	return cloned
}

func formatRuleLoadErrors(errors []RuleRunError) string {
	parts := make([]string, 0, len(errors))
	for _, err := range errors {
		parts = append(parts, fmt.Sprintf("%s (%s): %s", err.RuleID, err.Phase, err.Error))
	}
	return strings.Join(parts, "; ")
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

func resolveRunnerCommand() (string, string, error) {
	bunPath, err := exec.LookPath("bun")
	if err != nil {
		return "", "", fmt.Errorf("bun not found on PATH: %w", err)
	}

	runnerPath, err := findBundledRunnerScript()
	if err != nil {
		return "", "", err
	}

	return bunPath, runnerPath, nil
}

func findBundledRunnerScript() (string, error) {
	if override := os.Getenv("TELESCOPE_BUN_RUNNER_PATH"); override != "" {
		if _, err := os.Stat(override); err != nil {
			return "", fmt.Errorf("TELESCOPE_BUN_RUNNER_PATH not found: %s", override)
		}
		return override, nil
	}

	seen := make(map[string]struct{})
	for _, candidate := range bundledRunnerCandidates() {
		candidate = filepath.Clean(candidate)
		if _, ok := seen[candidate]; ok {
			continue
		}
		seen[candidate] = struct{}{}
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	return "", fmt.Errorf(
		"bundled bun runner not found; expected client/sidecar/runner.js or server/lsp/bun/runner/dist/runner.js",
	)
}

func bundledRunnerCandidates() []string {
	subpaths := []string{
		filepath.Join("sidecar", "runner.js"),
		filepath.Join("client", "sidecar", "runner.js"),
		filepath.Join("lsp", "bun", "runner", "dist", "runner.js"),
		filepath.Join("server", "lsp", "bun", "runner", "dist", "runner.js"),
	}

	var candidates []string
	if wd, err := os.Getwd(); err == nil {
		for _, sub := range subpaths {
			candidates = append(candidates, filepath.Join(wd, sub))
		}
	}

	if ex, err := os.Executable(); err == nil {
		dir := filepath.Dir(ex)
		for i := 0; i < 6; i++ {
			for _, sub := range []string{
				filepath.Join("..", "sidecar", "runner.js"),
				filepath.Join("sidecar", "runner.js"),
				filepath.Join("..", "client", "sidecar", "runner.js"),
				filepath.Join("..", "lsp", "bun", "runner", "dist", "runner.js"),
				filepath.Join("..", "..", "server", "lsp", "bun", "runner", "dist", "runner.js"),
			} {
				candidates = append(candidates, filepath.Join(dir, sub))
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}

	return candidates
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
