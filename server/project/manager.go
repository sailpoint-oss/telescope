package project

import (
	"context"
	"log/slog"
	"strings"
	"sync"

	"github.com/LukasParke/gossip/protocol"
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
	logger    *slog.Logger

	workspaceRoot string
}

// NewManager creates a project Manager.
func NewManager(indexCache *openapi.IndexCache, logger *slog.Logger) *Manager {
	return &Manager{
		projects: make(map[string]*ProjectContext),
		cache:    indexCache,
		logger:   logger,
	}
}

// SetPublish sets the function used to send project-level diagnostics.
func (m *Manager) SetPublish(fn PublishFunc) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.publish = fn
}

// Initialize performs workspace discovery and builds project contexts for all
// root documents. Call this on server initialized.
func (m *Manager) Initialize(workspaceRoot string, exclude []string) {
	m.mu.Lock()
	m.workspaceRoot = workspaceRoot
	m.discovery = NewDiscovery(exclude)
	m.mu.Unlock()

	if err := m.discovery.Scan(workspaceRoot); err != nil {
		m.logger.Warn("workspace scan failed", "root", workspaceRoot, "error", err)
		return
	}

	roots := m.discovery.Roots()
	m.logger.Info("workspace scan complete", "files", len(m.discovery.AllFiles()), "roots", len(roots))

	for _, rootURI := range roots {
		m.buildProject(rootURI)
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

// runProjectDiagnostics runs the unresolved-ref check across all files in a
// project context and publishes diagnostics for each file.
func (m *Manager) runProjectDiagnostics(pctx *ProjectContext) {
	m.mu.RLock()
	publishFn := m.publish
	m.mu.RUnlock()

	if publishFn == nil {
		return
	}

	for uri, idx := range pctx.Docs {
		diags := m.diagnoseFile(uri, idx, pctx)
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
					Range:    usage.Loc.Range,
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
				Range:    usage.Loc.Range,
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
	for _, pctx := range m.projects {
		if pctx.ContainsFile(uri) {
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
	m.mu.RLock()
	projects := m.affectedProjects(uri)
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
		m.mu.RUnlock()

		if publishFn == nil {
			continue
		}

		for _, affURI := range affected {
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

	// Check if this file is referenced by existing projects
	m.mu.RLock()
	for rootURI, pctx := range m.projects {
		deps := pctx.Graph.DependentsOf(df.URI)
		if len(deps) > 0 {
			m.mu.RUnlock()
			m.buildProject(rootURI) // rebuild to include new file
			m.mu.RLock()
		}
	}
	m.mu.RUnlock()
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

	m.mu.Lock()
	delete(m.projects, uri)
	m.mu.Unlock()
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
