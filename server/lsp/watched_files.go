package lsp

import (
	"context"
	"log/slog"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/observe"
	"github.com/sailpoint-oss/telescope/server/project"
)

// NewWatchedFilesHandler returns a handler that triggers ruleset reload when
// Spectral or Telescope config files change on disk, and propagates changes
// to the project manager for cross-file diagnostic updates.
func NewWatchedFilesHandler(rsMgr *RulesetManager, projMgr *project.Manager, logger *slog.Logger) gossip.DidChangeWatchedFilesHandler {
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
				go projMgr.OnFileCreated(path)
			case protocol.FileChanged:
				if logger != nil {
					logger.Debug("watchedFiles.project.invalidate",
						"trace_id", traceID,
						"uri", uri,
						"action", "changed")
				}
				go projMgr.OnFileChanged(uri)
			case protocol.FileDeleted:
				if logger != nil {
					logger.Debug("watchedFiles.project.invalidate",
						"trace_id", traceID,
						"uri", uri,
						"action", "deleted")
				}
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
func registerFileWatchers(ctx *gossip.Context) {
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
