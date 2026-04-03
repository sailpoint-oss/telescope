package lsp

import (
	"context"
	"io"
	"log/slog"
	"sort"
	"sync"

	"github.com/LukasParke/gossip/protocol"
)

type diagnosticPublishFunc func(context.Context, *protocol.PublishDiagnosticsParams) error

// DiagnosticMux merges Telescope-owned diagnostic sources before publishing.
// It intentionally does not proxy YAML/JSON child language servers.
type DiagnosticMux struct {
	mu      sync.Mutex
	publish diagnosticPublishFunc
	logger  *slog.Logger
	sources map[protocol.DocumentURI]map[string][]protocol.Diagnostic
}

func NewDiagnosticMux(publish diagnosticPublishFunc, logger *slog.Logger) *DiagnosticMux {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return &DiagnosticMux{
		publish: publish,
		logger:  logger,
		sources: make(map[protocol.DocumentURI]map[string][]protocol.Diagnostic),
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

func (m *DiagnosticMux) Set(uri protocol.DocumentURI, source string, diags []protocol.Diagnostic) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if source == "" {
		return
	}
	if len(diags) == 0 {
		m.clearSourceLocked(uri, source)
		m.publishLocked(uri)
		return
	}
	if m.sources[uri] == nil {
		m.sources[uri] = make(map[string][]protocol.Diagnostic)
	}
	copied := append([]protocol.Diagnostic(nil), diags...)
	m.sources[uri][source] = copied
	m.publishLocked(uri)
}

func (m *DiagnosticMux) ClearSource(uri protocol.DocumentURI, source string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.clearSourceLocked(uri, source)
	m.publishLocked(uri)
}

func (m *DiagnosticMux) FlushNow(uri protocol.DocumentURI) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.publishLocked(uri)
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
		return nil
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
