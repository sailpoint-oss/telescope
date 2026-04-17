package lsp

import (
	"context"
	"io"
	"log/slog"
	"sort"
	"sync"
	"time"

	"github.com/LukasParke/gossip/protocol"
)

type diagnosticPublishFunc func(context.Context, *protocol.PublishDiagnosticsParams) error

// coalesceWindow is how long a mux publish is delayed after a source update
// so bursts from a single edit (Barrelman + Vacuum + diff-on-save) fold into
// a single PublishDiagnostics RPC. 50 ms is the standard LSP debounce
// convention; last-writer-wins semantics make coalescing safe because each
// publish contains the full per-URI merged set.
const coalesceWindow = 50 * time.Millisecond

// DiagnosticMux merges Telescope-owned diagnostic sources before publishing.
// It intentionally does not proxy YAML/JSON child language servers.
//
// Publishes are coalesced per URI over a short window so that a single edit
// firing Barrelman + Vacuum + diff-on-save yields one PublishDiagnostics
// RPC rather than three. FlushNow and ClearSource still publish synchronously
// to preserve the contract callers depend on (tests rely on FlushNow being
// an immediate write).
type DiagnosticMux struct {
	mu        sync.Mutex
	publish   diagnosticPublishFunc
	logger    *slog.Logger
	sources   map[protocol.DocumentURI]map[string][]protocol.Diagnostic
	pending   map[protocol.DocumentURI]*time.Timer
	coalesce  time.Duration
}

func NewDiagnosticMux(publish diagnosticPublishFunc, logger *slog.Logger) *DiagnosticMux {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return &DiagnosticMux{
		publish:  publish,
		logger:   logger,
		sources:  make(map[protocol.DocumentURI]map[string][]protocol.Diagnostic),
		pending:  make(map[protocol.DocumentURI]*time.Timer),
		coalesce: coalesceWindow,
	}
}

func (m *DiagnosticMux) SetPublishFunc(publish diagnosticPublishFunc) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.publish = publish
}

func (m *DiagnosticMux) SetLogger(logger *slog.Logger) {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.logger = logger
}

// SetCoalesceWindow overrides the per-URI publish coalescing window. Pass 0
// to disable coalescing entirely (useful in tests that want synchronous
// publish-per-Set semantics). Any pending timers are cancelled so the new
// window takes effect on the next Set.
func (m *DiagnosticMux) SetCoalesceWindow(d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.coalesce = d
	for uri := range m.pending {
		m.cancelPendingLocked(uri)
	}
}

func (m *DiagnosticMux) Set(uri protocol.DocumentURI, source string, diags []protocol.Diagnostic) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if source == "" {
		return
	}
	if len(diags) == 0 {
		m.clearSourceLocked(uri, source)
	} else {
		if m.sources[uri] == nil {
			m.sources[uri] = make(map[string][]protocol.Diagnostic)
		}
		copied := append([]protocol.Diagnostic(nil), diags...)
		m.sources[uri][source] = copied
	}
	m.schedulePublishLocked(uri)
}

// ClearSource removes a source's contribution and publishes the merged
// remainder immediately. Flush-through is intentional: when a source is
// silenced we want the client to see the updated picture without the
// coalesce delay, matching the pre-coalescing contract.
func (m *DiagnosticMux) ClearSource(uri protocol.DocumentURI, source string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.clearSourceLocked(uri, source)
	m.cancelPendingLocked(uri)
	m.publishLocked(uri)
}

// FlushNow cancels any pending coalesced publish for the URI and publishes
// synchronously. Tests rely on this being immediate.
func (m *DiagnosticMux) FlushNow(uri protocol.DocumentURI) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.cancelPendingLocked(uri)
	m.publishLocked(uri)
}

func (m *DiagnosticMux) schedulePublishLocked(uri protocol.DocumentURI) {
	// Zero coalesce (exercised by tests and by callers that disable
	// debouncing) publishes inline.
	if m.coalesce <= 0 {
		m.publishLocked(uri)
		return
	}
	if t, ok := m.pending[uri]; ok {
		t.Reset(m.coalesce)
		return
	}
	m.pending[uri] = time.AfterFunc(m.coalesce, func() {
		m.mu.Lock()
		delete(m.pending, uri)
		m.publishLocked(uri)
		m.mu.Unlock()
	})
}

func (m *DiagnosticMux) cancelPendingLocked(uri protocol.DocumentURI) {
	if t, ok := m.pending[uri]; ok {
		t.Stop()
		delete(m.pending, uri)
	}
}

func (m *DiagnosticMux) clearSourceLocked(uri protocol.DocumentURI, source string) {
	if perURI := m.sources[uri]; perURI != nil {
		delete(perURI, source)
		if len(perURI) == 0 {
			delete(m.sources, uri)
		}
	}
}

func (m *DiagnosticMux) publishLocked(uri protocol.DocumentURI) {
	if m.publish == nil {
		return
	}
	merged := mergeDiagnosticSources(m.sources[uri])
	if err := m.publish(context.Background(), &protocol.PublishDiagnosticsParams{
		URI:         uri,
		Diagnostics: merged,
	}); err != nil {
		m.logger.Debug("diagnostic mux publish failed", "uri", uri, "error", err)
	}
}

func mergeDiagnosticSources(perURI map[string][]protocol.Diagnostic) []protocol.Diagnostic {
	if len(perURI) == 0 {
		return []protocol.Diagnostic{}
	}
	keys := make([]string, 0, len(perURI))
	total := 0
	for source, diags := range perURI {
		keys = append(keys, source)
		total += len(diags)
	}
	sort.Strings(keys)
	merged := make([]protocol.Diagnostic, 0, total)
	for _, source := range keys {
		merged = append(merged, perURI[source]...)
	}
	return merged
}
