package lsp

import (
	"context"
	"log/slog"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
)

// NewWatchedFilesHandler returns a handler that triggers ruleset reload when
// Spectral or Telescope config files change on disk.
func NewWatchedFilesHandler(rsMgr *RulesetManager, logger *slog.Logger) gossip.DidChangeWatchedFilesHandler {
	return func(ctx *gossip.Context, params *protocol.DidChangeWatchedFilesParams) error {
		needsReload := false
		for _, change := range params.Changes {
			path := uriToFSPath(string(change.URI))
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
		return nil
	}
}

type fileSystemWatcher struct {
	GlobPattern string `json:"globPattern"`
}

type watchedFilesRegOpts struct {
	Watchers []fileSystemWatcher `json:"watchers"`
}

// registerFileWatchers dynamically registers file watchers for Spectral and
// Telescope config files via client/registerCapability.
func registerFileWatchers(ctx *gossip.Context) {
	if ctx.Client == nil {
		return
	}

	var watchers []fileSystemWatcher
	for _, pattern := range WatchPatterns() {
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
