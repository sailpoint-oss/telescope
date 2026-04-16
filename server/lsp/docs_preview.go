package lsp

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	telescopebundle "github.com/sailpoint-oss/telescope/server/bundle"
	"github.com/sailpoint-oss/telescope/server/config"
	telescopedocs "github.com/sailpoint-oss/telescope/server/docs"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/project"
)

type docsServer interface {
	URL() string
	Stop() error
}

type docsPreviewSession struct {
	server   docsServer
	specPath string
	cleanup  func()
}

type DocsPreviewManager struct {
	mu     sync.Mutex
	active map[string]*docsPreviewSession
	logger *slog.Logger
}

var startDocsServer = func(ctx context.Context, opts telescopedocs.GenerateOpts) (docsServer, error) {
	return telescopedocs.Serve(ctx, opts)
}

func NewDocsPreviewManager(logger *slog.Logger) *DocsPreviewManager {
	if logger == nil {
		logger = slog.Default()
	}
	return &DocsPreviewManager{
		active: make(map[string]*docsPreviewSession),
		logger: logger,
	}
}

func (m *DocsPreviewManager) StartPreview(ctx *gossip.Context, cache *openapi.IndexCache, bridge *GraphBridge, uri protocol.DocumentURI, cfg *config.Config) (string, error) {
	if m == nil {
		return "", nil
	}
	key := string(uri)

	m.mu.Lock()
	existing := m.active[key]
	m.mu.Unlock()
	if existing != nil {
		if err := m.Refresh(ctx, cache, bridge, uri); err != nil {
			return "", err
		}
		return existing.server.URL(), nil
	}

	specBytes, warnings, err := bundlePreviewSpecBytes(ctx, cache, bridge, uri)
	if err != nil {
		return "", err
	}
	for _, warning := range warnings {
		if strings.TrimSpace(warning) != "" {
			m.logger.Warn("docs preview bundle warning", "uri", uri, "warning", warning)
		}
	}
	specPath, cleanup, err := writeDocsPreviewSpec(uri, specBytes)
	if err != nil {
		return "", err
	}
	outputDir, err := os.MkdirTemp("", "telescope-docs-preview-*")
	if err != nil {
		cleanup()
		return "", err
	}
	opts := telescopedocs.GenerateOpts{
		SpecPath:  specPath,
		OutputDir: outputDir,
		Serve:     true,
	}
	if cfg != nil {
		pp := cfg.Documentation.PrintingPress
		if theme := strings.TrimSpace(pp.Preview.Theme); theme != "" {
			opts.Theme = theme
		}
		if title := strings.TrimSpace(pp.Options.Title); title != "" {
			opts.Title = title
		}
		if binary := strings.TrimSpace(pp.Options.Binary); binary != "" {
			opts.BinaryPath = config.ResolveWorkspacePath(uriToFSPath(string(protocol.NormalizeURI(ctx.WorkspaceRoot()))), binary)
		}
		opts.NoLLM = pp.Options.NoLLM
		opts.NoJSON = pp.Options.NoJSON
		opts.NoHTML = pp.Options.NoHTML
	}
	server, err := startDocsServer(context.Background(), opts)
	if err != nil {
		cleanup()
		_ = os.RemoveAll(outputDir)
		return "", err
	}
	session := &docsPreviewSession{
		server:   server,
		specPath: specPath,
		cleanup: func() {
			cleanup()
			_ = os.RemoveAll(outputDir)
		},
	}

	m.mu.Lock()
	m.active[key] = session
	m.mu.Unlock()
	return server.URL(), nil
}

func (m *DocsPreviewManager) Refresh(ctx *gossip.Context, cache *openapi.IndexCache, bridge *GraphBridge, uri protocol.DocumentURI) error {
	if m == nil {
		return nil
	}
	key := string(uri)
	m.mu.Lock()
	session := m.active[key]
	m.mu.Unlock()
	if session == nil {
		return nil
	}
	specBytes, warnings, err := bundlePreviewSpecBytes(ctx, cache, bridge, uri)
	if err != nil {
		return err
	}
	for _, warning := range warnings {
		if strings.TrimSpace(warning) != "" {
			m.logger.Warn("docs preview refresh warning", "uri", uri, "warning", warning)
		}
	}
	return os.WriteFile(session.specPath, specBytes, 0o644)
}

func (m *DocsPreviewManager) StopPreview(uri protocol.DocumentURI) {
	if m == nil {
		return
	}
	key := string(uri)
	m.mu.Lock()
	session := m.active[key]
	delete(m.active, key)
	m.mu.Unlock()
	if session == nil {
		return
	}
	_ = session.server.Stop()
	if session.cleanup != nil {
		session.cleanup()
	}
}

func (m *DocsPreviewManager) StopAll() {
	if m == nil {
		return
	}
	m.mu.Lock()
	sessions := make([]*docsPreviewSession, 0, len(m.active))
	for key, session := range m.active {
		delete(m.active, key)
		sessions = append(sessions, session)
	}
	m.mu.Unlock()
	for _, session := range sessions {
		_ = session.server.Stop()
		if session.cleanup != nil {
			session.cleanup()
		}
	}
}

func bundlePreviewSpecBytes(ctx *gossip.Context, cache *openapi.IndexCache, bridge *GraphBridge, uri protocol.DocumentURI) ([]byte, []string, error) {
	idx := cache.Get(uri)
	if idx == nil || idx.Document == nil || !idx.IsOpenAPI() {
		return nil, nil, fmt.Errorf("docs preview requires an OpenAPI root document")
	}
	rootPath, err := fileURIToPath(uri)
	if err != nil {
		return nil, nil, err
	}
	rootBytes, err := readBundleDocumentBytes(ctx, uri)
	if err != nil {
		return nil, nil, err
	}

	order := []string{string(uri)}
	if bridge != nil {
		if _, err := bridge.RunPipeline(context.Background(), cache, string(uri)); err == nil {
			order = append(order, bridge.Graph().TransitiveDependencies(string(uri))...)
		}
	}
	if len(order) == 1 {
		proj, err := project.BuildProjectContext(string(uri), cache, nil)
		if err != nil {
			return nil, nil, err
		}
		if proj.Graph != nil {
			order = append(order, proj.Graph.TransitiveDependenciesOf(string(uri))...)
		}
	}

	warnings := make([]string, 0)
	files := make(map[string][]byte, len(order))
	for _, depURI := range order {
		raw, err := readBundleDocumentBytes(ctx, protocol.DocumentURI(depURI))
		if err != nil {
			warnings = append(warnings, err.Error())
			continue
		}
		depPath, err := fileURIToPath(protocol.DocumentURI(depURI))
		if err != nil {
			warnings = append(warnings, err.Error())
			continue
		}
		files[depPath] = raw
	}
	delete(files, rootPath)

	result, err := telescopebundle.Bundle(telescopebundle.Options{
		RootPath:  rootPath,
		RootBytes: rootBytes,
		Files:     files,
		Mode:      telescopebundle.ModeComposed,
		JSON:      false,
	})
	if err != nil {
		return nil, warnings, err
	}
	warnings = append(warnings, result.Warnings...)
	return result.Content, warnings, nil
}

func writeDocsPreviewSpec(uri protocol.DocumentURI, content []byte) (string, func(), error) {
	path, err := fileURIToPath(uri)
	if err != nil {
		return "", nil, err
	}
	pattern := "telescope-docs-preview-*"
	if ext := filepath.Ext(path); ext != "" {
		pattern += ext
	}
	tmp, err := os.CreateTemp("", pattern)
	if err != nil {
		return "", nil, err
	}
	if _, err := tmp.Write(content); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return "", nil, err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmp.Name())
		return "", nil, err
	}
	return tmp.Name(), func() { _ = os.Remove(tmp.Name()) }, nil
}
