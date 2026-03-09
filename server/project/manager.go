package project

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// PublishFunc sends diagnostics for a given URI to the LSP client.
type PublishFunc func(ctx context.Context, uri protocol.DocumentURI, diags []protocol.Diagnostic) error

// Manager coordinates workspace scanning, project context building, and
// repo-wide diagnostic publishing. It is the top-level orchestrator for
// cross-file OpenAPI analysis.
type Manager struct {
	mu        sync.RWMutex
	discovery *Discovery
	projects  map[string]*ProjectContext // rootURI -> project
	cache     *openapi.IndexCache
	publish   PublishFunc
	// shouldPublish gates project-level diagnostic publishing per URI.
	// It allows the LSP layer to suppress project diagnostics for open files
	// that are already handled by the incremental analyzer pipeline.
	shouldPublish func(uri string) bool
	analyzers     []rules.NamedAnalyzer
	logger        *slog.Logger

	workspaceRoot string
	ready         chan struct{} // closed when Initialize completes
}

// NewManager creates a project Manager.
func NewManager(indexCache *openapi.IndexCache, logger *slog.Logger) *Manager {
	return &Manager{
		projects: make(map[string]*ProjectContext),
		cache:    indexCache,
		logger:   logger,
		ready:    make(chan struct{}),
	}
}

// WaitReady blocks until project initialization has completed or the timeout
// elapses. Returns true if the manager is ready, false on timeout.
func (m *Manager) WaitReady(timeout time.Duration) bool {
	select {
	case <-m.ready:
		return true
	case <-time.After(timeout):
		return false
	}
}

// SetPublish sets the function used to send project-level diagnostics.
func (m *Manager) SetPublish(fn PublishFunc) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.publish = fn
}

// SetShouldPublish sets a URI-level filter for project diagnostic publishing.
// When nil, all URIs are publishable.
func (m *Manager) SetShouldPublish(fn func(uri string) bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.shouldPublish = fn
}

// SetAnalyzers sets the rule analyzers to run during startup diagnostics.
func (m *Manager) SetAnalyzers(a []rules.NamedAnalyzer) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.analyzers = a
}

// Initialize performs workspace discovery and builds project contexts for all
// root documents. Call this on server initialized.
func (m *Manager) Initialize(workspaceRoot string, exclude []string) {
	defer close(m.ready)

	m.mu.Lock()
	m.workspaceRoot = workspaceRoot
	m.discovery = NewDiscovery(exclude)
	m.mu.Unlock()

	if err := m.discovery.Scan(workspaceRoot); err != nil {
		m.logger.Warn("workspace scan failed", "root", workspaceRoot, "error", err)
		return
	}

	roots := m.discovery.Roots()
	allFiles := m.discovery.AllFiles()
	m.logger.Info("workspace scan complete", "files", len(allFiles), "roots", len(roots))

	for _, rootURI := range roots {
		m.buildProject(rootURI)
	}

	// Diagnose fragment files that are not part of any project.
	m.diagnoseStandaloneFragments()
}

// diagnoseStandaloneFragments finds fragment files not part of any project
// and runs full diagnostics on them.
func (m *Manager) diagnoseStandaloneFragments() {
	m.mu.RLock()
	publishFn := m.publish
	shouldPublishFn := m.shouldPublish
	analyzers := m.analyzers
	m.mu.RUnlock()

	if publishFn == nil || len(analyzers) == 0 {
		return
	}

	allFiles := m.discovery.AllFiles()
	count := 0
	for _, df := range allFiles {
		if df.Role != RoleFragment {
			continue
		}
		if m.ProjectForFile(df.URI) != nil {
			continue // already covered by a project
		}

		if !m.canPublishURI(df.URI, shouldPublishFn) {
			continue
		}

		idx, err := indexFromDisk(df.URI)
		if err != nil || idx == nil || idx.Document == nil {
			continue
		}

		diags := rules.RunAnalyzers(analyzers, idx, df.URI, nil)
		if err := publishFn(context.Background(), protocol.DocumentURI(df.URI), adapt.DiagnosticsToProtocol(diags)); err != nil {
			m.logger.Warn("failed to publish fragment diagnostics", "uri", df.URI, "error", err)
		}
		count++
	}

	if count > 0 {
		m.logger.Info("diagnosed standalone fragments", "count", count)
	}
}

// buildProject constructs a ProjectContext for a root document and runs
// diagnostics across all files in the project.
func (m *Manager) buildProject(rootURI string) {
	pctx, err := BuildProjectContext(rootURI, m.cache, m.logger)
	if err != nil {
		m.logger.Warn("failed to build project context", "root", rootURI, "error", err)
		return
	}

	m.mu.Lock()
	m.projects[rootURI] = pctx
	m.mu.Unlock()

	m.logger.Info("project built",
		"root", rootURI,
		"files", len(pctx.Docs),
		"edges", len(pctx.Graph.AllURIs()),
	)

	m.runProjectDiagnostics(pctx)
}

// runProjectDiagnostics runs all analyzers across all files in a project
// context and publishes diagnostics for each file.
func (m *Manager) runProjectDiagnostics(pctx *ProjectContext) {
	m.mu.RLock()
	publishFn := m.publish
	shouldPublishFn := m.shouldPublish
	analyzers := m.analyzers
	m.mu.RUnlock()

	if publishFn == nil {
		return
	}

	for uri, idx := range pctx.Docs {
		if !m.canPublishURI(uri, shouldPublishFn) {
			continue
		}

		diags := m.diagnoseFile(uri, idx, pctx)

		// Run full analyzer suite if available.
		if len(analyzers) > 0 && idx.Document != nil {
			analyzerDiags := rules.RunAnalyzers(analyzers, idx, uri, nil)
			diags = append(diags, adapt.DiagnosticsToProtocol(analyzerDiags)...)
		}

		if err := publishFn(context.Background(), protocol.DocumentURI(uri), diags); err != nil {
			m.logger.Warn("failed to publish project diagnostics", "uri", uri, "error", err)
		}
	}
}

// diagnoseFile runs cross-file aware diagnostics for a single file within a
// project context. Currently checks unresolved $refs.
func (m *Manager) diagnoseFile(uri string, idx *openapi.Index, pctx *ProjectContext) []protocol.Diagnostic {
	var diags []protocol.Diagnostic

	for target, usages := range idx.Refs {
		if _, err := idx.Resolve(target); err == nil {
			continue
		}

		if strings.HasPrefix(target, "#") {
			for _, usage := range usages {
				diags = append(diags, protocol.Diagnostic{
					Range:    adapt.RangeToProtocol(usage.Loc.Range),
					Severity: protocol.SeverityError,
					Source:   "unresolved-ref",
					Message:  "Cannot resolve $ref: " + target,
					Code:     "unresolved-ref",
				})
			}
			continue
		}

		if pctx.Resolver.CanResolve(uri, target) {
			continue
		}

		for _, usage := range usages {
			diags = append(diags, protocol.Diagnostic{
				Range:    adapt.RangeToProtocol(usage.Loc.Range),
				Severity: protocol.SeverityError,
				Source:   "unresolved-ref",
				Message:  "Cannot resolve $ref: " + target,
				Code:     "unresolved-ref",
			})
		}
	}

	return diags
}

// ProjectForFile returns the ProjectContext that contains the given URI.
// Returns nil if the file is not part of any known project.
func (m *Manager) ProjectForFile(uri string) *ProjectContext {
	m.mu.RLock()
	defer m.mu.RUnlock()
	norm := openapi.NormalizeURI(uri)
	for _, pctx := range m.projects {
		if pctx.ContainsFile(norm) {
			return pctx
		}
	}
	return nil
}

// ResolverForFile returns a CrossRefResolver for the given file's project,
// satisfying the rules.CrossRefResolver interface. Returns nil if the file
// is not part of any known project.
func (m *Manager) ResolverForFile(uri string) rules.CrossRefResolver {
	pctx := m.ProjectForFile(uri)
	if pctx == nil {
		return nil
	}
	return pctx.Resolver
}

// OnFileChanged should be called when a file is modified. It rebuilds the
// affected project indexes and re-publishes diagnostics.
func (m *Manager) OnFileChanged(uri string) {
	norm := openapi.NormalizeURI(uri)
	m.mu.RLock()
	projects := m.affectedProjects(norm)
	m.mu.RUnlock()

	for _, pctx := range projects {
		if err := pctx.RebuildIndex(uri, m.cache); err != nil {
			m.logger.Warn("failed to rebuild index", "uri", uri, "error", err)
			continue
		}

		affected := pctx.Graph.TransitiveDependentsOf(uri)
		affected = append(affected, uri)

		m.mu.RLock()
		publishFn := m.publish
		shouldPublishFn := m.shouldPublish
		m.mu.RUnlock()

		if publishFn == nil {
			continue
		}

		for _, affURI := range affected {
			if !m.canPublishURI(affURI, shouldPublishFn) {
				continue
			}

			idx, ok := pctx.Docs[affURI]
			if !ok {
				continue
			}
			diags := m.diagnoseFile(affURI, idx, pctx)
			if err := publishFn(context.Background(), protocol.DocumentURI(affURI), diags); err != nil {
				m.logger.Warn("failed to publish updated diagnostics", "uri", affURI, "error", err)
			}
		}
	}
}

func (m *Manager) canPublishURI(uri string, shouldPublishFn func(uri string) bool) bool {
	if shouldPublishFn == nil {
		return true
	}
	return shouldPublishFn(uri)
}

// OnFileCreated should be called when a new file appears. It may need to
// add the file to existing projects or create new ones.
func (m *Manager) OnFileCreated(path string) {
	if m.discovery == nil {
		return
	}

	df := m.discovery.UpdateFile(path)
	if df == nil {
		return
	}

	if df.Role == RoleRoot {
		m.buildProject(df.URI)
		return
	}

	// Collect roots that reference this file, then rebuild outside the lock.
	m.mu.RLock()
	var rebuildRoots []string
	for rootURI, pctx := range m.projects {
		if deps := pctx.Graph.DependentsOf(df.URI); len(deps) > 0 {
			rebuildRoots = append(rebuildRoots, rootURI)
		}
	}
	m.mu.RUnlock()

	for _, rootURI := range rebuildRoots {
		m.buildProject(rootURI)
	}
}

// OnFileDeleted should be called when a file is removed.
func (m *Manager) OnFileDeleted(path string) {
	if m.discovery == nil {
		return
	}

	df := m.discovery.FileByPath(path)
	if df == nil {
		return
	}

	uri := df.URI
	m.discovery.RemoveFile(path)

	if df.Role == RoleRoot {
		m.mu.Lock()
		delete(m.projects, uri)
		m.mu.Unlock()
		return
	}

	// For fragment files, rebuild every project that contained the deleted file
	// so that stale Docs/Graph entries are cleaned up.
	m.mu.RLock()
	var rebuildRoots []string
	for rootURI, pctx := range m.projects {
		if pctx.ContainsFile(uri) {
			rebuildRoots = append(rebuildRoots, rootURI)
		}
	}
	m.mu.RUnlock()

	for _, rootURI := range rebuildRoots {
		m.buildProject(rootURI)
	}
}

func (m *Manager) affectedProjects(uri string) []*ProjectContext {
	var affected []*ProjectContext
	for _, pctx := range m.projects {
		if pctx.ContainsFile(uri) {
			affected = append(affected, pctx)
		}
	}
	return affected
}

// Discovery returns the underlying file discovery instance.
func (m *Manager) Discovery() *Discovery {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.discovery
}

// Projects returns all current project contexts.
func (m *Manager) Projects() map[string]*ProjectContext {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make(map[string]*ProjectContext, len(m.projects))
	for k, v := range m.projects {
		result[k] = v
	}
	return result
}
