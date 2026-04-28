package lsp

import (
	"context"
	"log/slog"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/generation"
	"github.com/sailpoint-oss/telescope/server/lsp/observe"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/project"
)

// NewWatchedFilesHandler returns a handler that triggers ruleset reload when
// Spectral or Telescope config files change on disk, and propagates changes
// to the project manager for cross-file diagnostic updates.
//
// When genMgr is non-nil, file events on cartographer-watched source globs
// are additionally dispatched to generation.Loop.NotifyChange so the
// generation loop can debounce-regenerate the spec.
func NewWatchedFilesHandler(rsMgr *RulesetManager, projMgr *project.Manager, graphBridge *GraphBridge, indexCache *openapi.IndexCache, genMgr *generation.Manager, logger *slog.Logger) gossip.DidChangeWatchedFilesHandler {
	return func(ctx *gossip.Context, params *protocol.DidChangeWatchedFilesParams) error {
		traceID := observe.GetTraceID(ctx)
		if logger != nil {
			logger.Debug("watchedFiles.changed",
				"trace_id", traceID,
				"count", len(params.Changes))
		}
		needsReload := false
		for _, change := range params.Changes {
			path := uriToFSPath(string(change.URI))
			if logger != nil {
				logger.Debug("watchedFiles.event",
					"trace_id", traceID,
					"uri", change.URI,
					"path", path,
					"type", change.Type)
			}
			if IsWatchedFile(path) {
				needsReload = true
				break
			}
		}
		if needsReload {
			logger.Info("ruleset config changed, reloading")
			if err := rsMgr.Reload(); err != nil {
				logger.Warn("failed to reload rulesets", "error", err)
			}
		}

		// Forward source-file events to the generation loop. Source file
		// watchers are registered separately from OpenAPI watchers; we route
		// them here so the rest of the file-change pipeline stays focused on
		// spec-side invalidation.
		if genMgr != nil {
			for _, change := range params.Changes {
				uri := string(change.URI)
				if !isSourceFileURI(uri) {
					continue
				}
				for _, root := range genMgr.Roots() {
					genMgr.NotifyChange(root, uri)
				}
			}
		}

		// Propagate file changes to the project manager for cross-file
		// dependency invalidation and re-indexing.
		for _, change := range params.Changes {
			uri := string(change.URI)
			if !isOpenAPIFileURI(uri) {
				continue
			}
			path := uriToFSPath(uri)

			switch change.Type {
			case protocol.FileCreated:
				if logger != nil {
					logger.Debug("watchedFiles.project.invalidate",
						"trace_id", traceID,
						"uri", uri,
						"action", "created")
				}
				go func(path string) {
					if _, err := graphBridge.OnFileCreated(context.Background(), indexCache, path); err != nil && logger != nil {
						logger.Warn("failed to ingest created file into graph", "path", path, "error", err)
					}
				}(path)
				go projMgr.OnFileCreated(path)
			case protocol.FileChanged:
				if logger != nil {
					logger.Debug("watchedFiles.project.invalidate",
						"trace_id", traceID,
						"uri", uri,
						"action", "changed")
				}
				if ctx.Documents.Get(change.URI) == nil {
					go func(uri string) {
						if _, err := graphBridge.OnFileChanged(context.Background(), indexCache, uri); err != nil && logger != nil {
							logger.Warn("failed to refresh changed file in graph", "uri", uri, "error", err)
						}
					}(uri)
				}
				go projMgr.OnFileChanged(uri)
			case protocol.FileDeleted:
				if logger != nil {
					logger.Debug("watchedFiles.project.invalidate",
						"trace_id", traceID,
						"uri", uri,
						"action", "deleted")
				}
				go func(path string) {
					if _, err := graphBridge.OnFileDeleted(context.Background(), indexCache, path); err != nil && logger != nil {
						logger.Warn("failed to evict deleted file from graph", "path", path, "error", err)
					}
				}(path)
				go projMgr.OnFileDeleted(path)
			}
		}

		return nil
	}
}

func isOpenAPIFileURI(uri string) bool {
	lower := strings.ToLower(uri)
	return strings.HasSuffix(lower, ".yaml") ||
		strings.HasSuffix(lower, ".yml") ||
		strings.HasSuffix(lower, ".json")
}

type fileSystemWatcher struct {
	GlobPattern string `json:"globPattern"`
}

type watchedFilesRegOpts struct {
	Watchers []fileSystemWatcher `json:"watchers"`
}

// registerFileWatchers dynamically registers file watchers for config files
// and OpenAPI document files (YAML/JSON) via client/registerCapability.
//
// sourceLanguages, when non-empty, adds globs for source files the generation
// loop cares about (Go/Java/TS). An empty slice skips source-file watching.
func registerFileWatchers(ctx *gossip.Context, sourceLanguages []string) {
	if ctx.Client == nil {
		return
	}

	var watchers []fileSystemWatcher
	for _, pattern := range WatchPatterns() {
		watchers = append(watchers, fileSystemWatcher{GlobPattern: pattern})
	}

	// Watch OpenAPI-relevant files for cross-file dependency tracking
	for _, pattern := range []string{"**/*.yaml", "**/*.yml", "**/*.json"} {
		watchers = append(watchers, fileSystemWatcher{GlobPattern: pattern})
	}

	// Source-file globs drive the generation loop when cartographer is
	// configured. Only register when the caller explicitly opts in.
	for _, pattern := range sourceGlobsForLanguages(sourceLanguages) {
		watchers = append(watchers, fileSystemWatcher{GlobPattern: pattern})
	}

	_ = ctx.Client.RegisterCapability(context.Background(), &protocol.RegistrationParams{
		Registrations: []protocol.Registration{
			{
				ID:              "telescope-ruleset-watchers",
				Method:          protocol.MethodDidChangeWatchedFiles,
				RegisterOptions: watchedFilesRegOpts{Watchers: watchers},
			},
		},
	})
}
