package lsp

import (
	"context"
	"io"
	"log/slog"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/LukasParke/gossip/lspclient"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/observe"
)

// ChildLSPManager manages child yaml-language-server and
// vscode-json-language-server processes. It forwards document sync events,
// collects their diagnostics, and merges them via a DiagnosticAggregator.
type ChildLSPManager struct {
	yamlClient *lspclient.Client
	jsonClient *lspclient.Client
	aggregator *lspclient.DiagnosticAggregator
	logger     *slog.Logger

	mu        sync.Mutex
	started   bool
	available bool // false if Node.js is not found
}

// NewChildLSPManager creates the manager. Call Start after the gossip server
// has been initialized and the workspace root is known.
func NewChildLSPManager(publish lspclient.PublishFunc, logger *slog.Logger) *ChildLSPManager {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return &ChildLSPManager{
		aggregator: lspclient.NewDiagnosticAggregator(publish, 80*time.Millisecond),
		logger:     logger,
	}
}

// Aggregator returns the diagnostic aggregator so the telescope diagnostic
// pipeline can also write its own diagnostics into it.
func (m *ChildLSPManager) Aggregator() *lspclient.DiagnosticAggregator {
	return m.aggregator
}

// Start spawns the child LSPs if Node.js is available. It is safe to call
// from the OnInitialized callback.
func (m *ChildLSPManager) Start(ctx context.Context, rootURI string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.started {
		return
	}
	m.started = true

	if !NodeAvailable() {
		m.logger.Warn("Node.js not found in PATH; child YAML/JSON language servers disabled. " +
			"Install Node.js for enhanced syntax and schema diagnostics.")
		m.available = false
		return
	}
	m.available = true

	m.yamlClient = lspclient.NewClient(lspclient.ClientOptions{
		Command: "yaml-language-server",
		Args:    []string{"--stdio"},
		RootURI: rootURI,
		Settings: map[string]any{
			"yaml": map[string]any{
				"validate":   true,
				"completion": false,
				"hover":      false,
				"format":     map[string]any{"enable": false},
				"schemaStore": map[string]any{
					"enable": true,
				},
			},
		},
		OnDiagnostics: func(uri protocol.DocumentURI, diags []protocol.Diagnostic) {
			m.aggregator.Set(uri, "yaml-ls", diags)
		},
		Logger: m.logger.With("child", "yaml-ls"),
	})

	m.jsonClient = lspclient.NewClient(lspclient.ClientOptions{
		Command: "vscode-json-language-server",
		Args:    []string{"--stdio"},
		RootURI: rootURI,
		Settings: map[string]any{
			"json": map[string]any{
				"validate": map[string]any{"enable": true},
				"format":   map[string]any{"enable": false},
			},
		},
		OnDiagnostics: func(uri protocol.DocumentURI, diags []protocol.Diagnostic) {
			m.aggregator.Set(uri, "json-ls", diags)
		},
		Logger: m.logger.With("child", "json-ls"),
	})

	if err := m.yamlClient.Start(ctx); err != nil {
		m.logger.Warn("failed to start yaml-language-server", "error", err)
		m.yamlClient = nil
	} else {
		m.logger.Info("yaml-language-server started")
	}

	if err := m.jsonClient.Start(ctx); err != nil {
		m.logger.Warn("failed to start vscode-json-language-server", "error", err)
		m.jsonClient = nil
	} else {
		m.logger.Info("vscode-json-language-server started")
	}
}

// Stop gracefully shuts down child LSPs.
func (m *ChildLSPManager) Stop(ctx context.Context) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.yamlClient != nil {
		if err := m.yamlClient.Stop(ctx); err != nil {
			m.logger.Debug("yaml-language-server stop", "error", err)
		}
	}
	if m.jsonClient != nil {
		if err := m.jsonClient.Stop(ctx); err != nil {
			m.logger.Debug("vscode-json-language-server stop", "error", err)
		}
	}
	m.started = false
}

// Available reports whether Node.js was found and child LSPs can be used.
func (m *ChildLSPManager) Available() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.available
}

// DidOpen forwards the notification to the appropriate child LSP.
func (m *ChildLSPManager) DidOpen(ctx context.Context, params *protocol.DidOpenTextDocumentParams) {
	if params == nil {
		return
	}
	traceID := observe.GetTraceID(ctx)
	m.logger.Debug("childMgr.DidOpen",
		"trace_id", traceID,
		"uri", params.TextDocument.URI,
		"languageID", params.TextDocument.LanguageID)
	client := m.clientForURI(string(params.TextDocument.URI))
	if client == nil {
		m.logger.Debug("childMgr.DidOpen skipped: no child client",
			"trace_id", traceID,
			"uri", params.TextDocument.URI)
		return
	}

	translated := *params
	translated.TextDocument.LanguageID = langIDForURI(string(params.TextDocument.URI))
	_ = client.DidOpen(ctx, &translated)
}

// DidChange forwards the notification to the appropriate child LSP.
func (m *ChildLSPManager) DidChange(ctx context.Context, params *protocol.DidChangeTextDocumentParams) {
	if params == nil {
		return
	}
	traceID := observe.GetTraceID(ctx)
	m.logger.Debug("childMgr.DidChange",
		"trace_id", traceID,
		"uri", params.TextDocument.URI,
		"changes", len(params.ContentChanges))
	client := m.clientForURI(string(params.TextDocument.URI))
	if client == nil {
		m.logger.Debug("childMgr.DidChange skipped: no child client",
			"trace_id", traceID,
			"uri", params.TextDocument.URI)
		return
	}
	_ = client.DidChange(ctx, params)
}

// DidClose forwards the notification to the appropriate child LSP and clears
// only the child LSP's source in the aggregator. We intentionally do NOT call
// aggregator.Clear (which wipes all sources) because the DiagnosticEngine may
// have already published fresh "telescope" diagnostics that would be lost.
func (m *ChildLSPManager) DidClose(ctx context.Context, params *protocol.DidCloseTextDocumentParams) {
	if params == nil {
		return
	}
	traceID := observe.GetTraceID(ctx)
	uri := params.TextDocument.URI
	m.logger.Debug("childMgr.DidClose", "trace_id", traceID, "uri", uri)
	client := m.clientForURI(string(uri))
	if client != nil {
		_ = client.DidClose(ctx, params)
	}
	if source := m.sourceNameForURI(string(uri)); source != "" {
		m.logger.Debug("childMgr.DidClose clearing child source",
			"trace_id", traceID,
			"uri", uri,
			"source", source)
		m.aggregator.ClearSource(uri, source)
	}
}

func (m *ChildLSPManager) clientForURI(uri string) *lspclient.Client {
	m.mu.Lock()
	yaml := m.yamlClient
	json := m.jsonClient
	m.mu.Unlock()

	lower := strings.ToLower(uri)
	if strings.HasSuffix(lower, ".yaml") || strings.HasSuffix(lower, ".yml") {
		return yaml
	}
	if strings.HasSuffix(lower, ".json") {
		return json
	}
	return nil
}

func (m *ChildLSPManager) sourceNameForURI(uri string) string {
	lower := strings.ToLower(uri)
	if strings.HasSuffix(lower, ".yaml") || strings.HasSuffix(lower, ".yml") {
		return "yaml-ls"
	}
	if strings.HasSuffix(lower, ".json") {
		return "json-ls"
	}
	return ""
}

func langIDForURI(uri string) string {
	lower := strings.ToLower(uri)
	if strings.HasSuffix(lower, ".yaml") || strings.HasSuffix(lower, ".yml") {
		return "yaml"
	}
	if strings.HasSuffix(lower, ".json") {
		return "json"
	}
	return ""
}

// NodeAvailable reports whether Node.js is available in the PATH.
func NodeAvailable() bool {
	_, err := exec.LookPath("node")
	return err == nil
}
