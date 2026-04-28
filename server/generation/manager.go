package generation

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// Manager owns one Loop per workspace root. It is the handle LSP lifecycle
// wiring uses to add/remove roots on didChangeWorkspaceFolders and broadcast
// config changes to all live loops.
type Manager struct {
	logger *slog.Logger

	mu    sync.RWMutex
	loops map[string]*Loop
	subs  []func(Event)
}

// NewManager constructs an empty Manager.
func NewManager(logger *slog.Logger) *Manager {
	if logger == nil {
		logger = slog.Default()
	}
	return &Manager{logger: logger, loops: make(map[string]*Loop)}
}

// Add creates and starts a Loop for the given root, replacing any existing
// one. Previously-registered subscribers are re-attached so the event stream
// is uninterrupted across Stop+Start.
func (m *Manager) Add(ctx context.Context, cfg Config) (*Loop, error) {
	if m == nil {
		return nil, nil
	}
	m.mu.Lock()
	if existing, ok := m.loops[cfg.Root]; ok {
		m.mu.Unlock()
		_ = existing.Stop(500 * time.Millisecond)
		m.mu.Lock()
	}
	loop := NewLoop(cfg, m.logger)
	for _, fn := range m.subs {
		loop.Subscribe(fn)
	}
	m.loops[cfg.Root] = loop
	m.mu.Unlock()
	if err := loop.Start(ctx); err != nil {
		return nil, err
	}
	return loop, nil
}

// Remove stops and drops the Loop for a given workspace root.
func (m *Manager) Remove(root string) {
	if m == nil {
		return
	}
	m.mu.Lock()
	loop, ok := m.loops[root]
	delete(m.loops, root)
	m.mu.Unlock()
	if ok {
		_ = loop.Stop(500 * time.Millisecond)
	}
}

// Get returns the Loop for a given workspace root, if any.
func (m *Manager) Get(root string) (*Loop, bool) {
	if m == nil {
		return nil, false
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	l, ok := m.loops[root]
	return l, ok
}

// Roots returns all known workspace roots.
func (m *Manager) Roots() []string {
	if m == nil {
		return nil
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	roots := make([]string, 0, len(m.loops))
	for r := range m.loops {
		roots = append(roots, r)
	}
	return roots
}

// Subscribe attaches a single listener across every current and future Loop
// owned by this manager.
func (m *Manager) Subscribe(fn func(Event)) {
	if m == nil || fn == nil {
		return
	}
	m.mu.Lock()
	m.subs = append(m.subs, fn)
	loops := make([]*Loop, 0, len(m.loops))
	for _, l := range m.loops {
		loops = append(loops, l)
	}
	m.mu.Unlock()
	for _, l := range loops {
		l.Subscribe(fn)
	}
}

// StopAll tears down every Loop with a bounded drain.
func (m *Manager) StopAll(drain time.Duration) {
	if m == nil {
		return
	}
	m.mu.Lock()
	loops := make([]*Loop, 0, len(m.loops))
	for _, l := range m.loops {
		loops = append(loops, l)
	}
	m.loops = make(map[string]*Loop)
	m.mu.Unlock()
	for _, l := range loops {
		_ = l.Stop(drain)
	}
}

// NotifyChange forwards a source-file change to the Loop owning the workspace
// root that contains the URI.
func (m *Manager) NotifyChange(root, sourceURI string) {
	if l, ok := m.Get(root); ok {
		l.NotifyChange(sourceURI)
	}
}

// NotifySave forwards a didSave to the matching Loop.
func (m *Manager) NotifySave(root, sourceURI string) {
	if l, ok := m.Get(root); ok {
		l.NotifySave(sourceURI)
	}
}

// Apply reconfigures the loop for the given root. Safe fields are hot-reloaded;
// unsafe fields (enabled toggle, Root change) require a Stop+Start, which the
// Manager performs transparently.
func (m *Manager) Apply(ctx context.Context, cfg Config) (*Loop, bool, error) {
	if m == nil {
		return nil, false, nil
	}
	l, ok := m.Get(cfg.Root)
	if !ok {
		loop, err := m.Add(ctx, cfg)
		return loop, true, err
	}
	if hotReload(l, cfg) {
		return l, false, nil
	}
	m.Remove(cfg.Root)
	loop, err := m.Add(ctx, cfg)
	return loop, true, err
}

// hotReload updates the config fields that can be swapped without restarting
// an extraction. Returns true if every delta was safe; false if the caller
// needs to Stop+Start.
func hotReload(l *Loop, cfg Config) bool {
	if l.cfg.Root != cfg.Root {
		return false
	}
	if l.cfg.Lang != cfg.Lang || l.cfg.ConfigDir != cfg.ConfigDir {
		return false
	}
	l.cfg.DebounceWindow = cfg.DebounceWindow
	l.cfg.TriggerMode = cfg.TriggerMode
	l.cfg.OutputPath = cfg.OutputPath
	l.cfg.WriteMode = cfg.WriteMode
	l.cfg.WriteSourceMap = cfg.WriteSourceMap
	l.writer = NewDiskWriter(cfg.OutputPath, cfg.WriteSourceMap,
		normalizeWriteMode(string(cfg.WriteMode), cfg.OutputPath != ""))
	old := l.debouncer
	l.debouncer = newDebouncer(l.cfg.DebounceWindow)
	if old != nil {
		old.stop()
	}
	return true
}
