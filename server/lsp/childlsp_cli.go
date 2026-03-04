package lsp

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/LukasParke/gossip/lspclient"
	"github.com/LukasParke/gossip/protocol"
)

const (
	lintFileTimeout  = 10 * time.Second
	lintFileSettle   = 300 * time.Millisecond
)

// ChildLSPLinter manages child YAML/JSON language server processes for batch
// CLI linting. Unlike ChildLSPManager (which is designed for the long-lived
// LSP server mode with async diagnostic aggregation), this type provides a
// synchronous LintFile method that opens a document, waits for diagnostics,
// and returns them directly.
type ChildLSPLinter struct {
	yamlClient *lspclient.Client
	jsonClient *lspclient.Client
	logger     *slog.Logger

	mu       sync.Mutex
	handlers map[protocol.DocumentURI]func([]protocol.Diagnostic)
}

// NewChildLSPLinter creates a linter. Call Start before LintFile.
func NewChildLSPLinter(logger *slog.Logger) *ChildLSPLinter {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	return &ChildLSPLinter{
		logger:   logger,
		handlers: make(map[protocol.DocumentURI]func([]protocol.Diagnostic)),
	}
}

// Start spawns the child YAML and JSON language servers. Returns an error only
// if both fail; partial availability is fine (e.g. only yaml-language-server
// installed).
func (l *ChildLSPLinter) Start(ctx context.Context, rootURI string) error {
	dispatch := func(uri protocol.DocumentURI, diags []protocol.Diagnostic) {
		l.mu.Lock()
		h := l.handlers[uri]
		l.mu.Unlock()
		if h != nil {
			h(diags)
		}
	}

	l.yamlClient = lspclient.NewClient(lspclient.ClientOptions{
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
		OnDiagnostics: dispatch,
		Logger:        l.logger.With("child", "yaml-ls"),
	})

	l.jsonClient = lspclient.NewClient(lspclient.ClientOptions{
		Command: "vscode-json-language-server",
		Args:    []string{"--stdio"},
		RootURI: rootURI,
		Settings: map[string]any{
			"json": map[string]any{
				"validate": map[string]any{"enable": true},
				"format":   map[string]any{"enable": false},
			},
		},
		OnDiagnostics: dispatch,
		Logger:        l.logger.With("child", "json-ls"),
	})

	yamlErr := l.yamlClient.Start(ctx)
	if yamlErr != nil {
		l.logger.Warn("failed to start yaml-language-server", "error", yamlErr)
		l.yamlClient = nil
	}

	jsonErr := l.jsonClient.Start(ctx)
	if jsonErr != nil {
		l.logger.Warn("failed to start vscode-json-language-server", "error", jsonErr)
		l.jsonClient = nil
	}

	if yamlErr != nil && jsonErr != nil {
		return yamlErr
	}
	return nil
}

// Stop gracefully shuts down both child LSPs.
func (l *ChildLSPLinter) Stop(ctx context.Context) {
	if l.yamlClient != nil {
		_ = l.yamlClient.Stop(ctx)
	}
	if l.jsonClient != nil {
		_ = l.jsonClient.Stop(ctx)
	}
}

// LintFile opens a document in the appropriate child LSP, waits for
// diagnostics with a settling period, then closes the document and returns
// the collected diagnostics. Returns nil if no child LSP is available for
// the given language.
func (l *ChildLSPLinter) LintFile(ctx context.Context, uri protocol.DocumentURI, langID string, content []byte) []protocol.Diagnostic {
	client := l.clientForLang(langID)
	if client == nil {
		return nil
	}

	var (
		mu     sync.Mutex
		latest []protocol.Diagnostic
		got    = make(chan struct{}, 1)
	)

	l.mu.Lock()
	l.handlers[uri] = func(diags []protocol.Diagnostic) {
		mu.Lock()
		latest = diags
		mu.Unlock()
		select {
		case got <- struct{}{}:
		default:
		}
	}
	l.mu.Unlock()

	defer func() {
		l.mu.Lock()
		delete(l.handlers, uri)
		l.mu.Unlock()
		_ = client.DidClose(ctx, &protocol.DidCloseTextDocumentParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: uri},
		})
	}()

	err := client.DidOpen(ctx, &protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: langID,
			Version:    1,
			Text:       string(content),
		},
	})
	if err != nil {
		return nil
	}

	deadline := time.NewTimer(lintFileTimeout)
	defer deadline.Stop()

	// Wait for the first publishDiagnostics from the child.
	select {
	case <-got:
	case <-deadline.C:
		return nil
	case <-ctx.Done():
		return nil
	}

	// Settle: keep collecting until no new publish arrives within the
	// settling window or the overall deadline fires.
	settle := time.NewTimer(lintFileSettle)
	defer settle.Stop()
	for {
		select {
		case <-got:
			settle.Reset(lintFileSettle)
		case <-settle.C:
			mu.Lock()
			result := latest
			mu.Unlock()
			return result
		case <-deadline.C:
			mu.Lock()
			result := latest
			mu.Unlock()
			return result
		case <-ctx.Done():
			mu.Lock()
			result := latest
			mu.Unlock()
			return result
		}
	}
}

func (l *ChildLSPLinter) clientForLang(langID string) *lspclient.Client {
	switch strings.ToLower(langID) {
	case "yaml":
		return l.yamlClient
	case "json":
		return l.jsonClient
	default:
		return nil
	}
}
