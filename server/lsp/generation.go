// Package lsp: generation-loop wiring.
//
// This file binds the per-workspace generation.Loop to the server's init /
// shutdown lifecycle, forwards loop events to the extension as custom
// notifications, and threads config updates to the Manager.
package lsp

import (
	"context"
	"log/slog"
	"time"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/generation"
)

// generationNotification is the payload shape for $/telescope.generation.
// The extension uses this to drive status-bar, TreeView refresh, and
// CodeLens stale-state UX.
type generationNotification struct {
	State      string `json:"state"`
	Root       string `json:"root"`
	DurationMs int64  `json:"durationMs,omitempty"`
	Error      string `json:"error,omitempty"`
	Operations int    `json:"operations,omitempty"`
	Types      int    `json:"types,omitempty"`
}

// wireGenerationNotifications subscribes the generation.Manager to forward
// lifecycle events over the JSON-RPC connection.
func wireGenerationNotifications(s *gossip.Server, mgr *generation.Manager, logger *slog.Logger) {
	if s == nil || mgr == nil {
		return
	}
	mgr.Subscribe(func(ev generation.Event) {
		conn := s.Conn()
		if conn == nil {
			return
		}
		n := generationNotification{
			State:      string(ev.Kind),
			Root:       ev.Root,
			DurationMs: ev.Duration.Milliseconds(),
		}
		if ev.Err != nil {
			n.Error = ev.Err.Error()
		}
		if ev.Result != nil {
			n.Operations = ev.Result.Operations
			n.Types = ev.Result.Types
		}
		if err := conn.Notify(context.Background(), "$/telescope.generation", n); err != nil && logger != nil {
			logger.Debug("failed to forward generation event", "error", err)
		}
	})
}

// wireWorkspaceFolderChanges keeps the generation.Manager in sync with the
// editor's workspace folders: added folders get a new Loop, removed folders
// are torn down.
func wireWorkspaceFolderChanges(s *gossip.Server, mgr *generation.Manager, cfgProvider func() *config.Config, logger *slog.Logger) {
	if s == nil || mgr == nil {
		return
	}
	s.OnDidChangeWorkspaceFolders(func(ctx *gossip.Context, params *protocol.DidChangeWorkspaceFoldersParams) error {
		cfg := cfgProvider()
		if cfg == nil {
			return nil
		}
		for _, removed := range params.Event.Removed {
			mgr.Remove(uriToFSPath(string(removed.URI)))
		}
		for _, added := range params.Event.Added {
			root := uriToFSPath(string(added.URI))
			if root == "" {
				continue
			}
			_, err := mgr.Add(context.Background(), loopConfigFromTelescopeConfig(root, "", cfg))
			if err != nil && logger != nil {
				logger.Warn("failed to add workspace-folder generation loop", "root", root, "error", err)
			}
		}
		return nil
	})
}

// wireConfigReload hot-applies safe generation.openapi.* config changes via
// Manager.Apply. Unsafe changes (enabled toggle, root rename) are handled
// via Stop+Start inside Apply.
func wireConfigReload(s *gossip.Server, mgr *generation.Manager, cfgProvider func() *config.Config, logger *slog.Logger) {
	if s == nil || mgr == nil || cfgProvider == nil {
		return
	}
	s.OnDidChangeConfiguration(func(ctx *gossip.Context, params *protocol.DidChangeConfigurationParams) error {
		cfg := cfgProvider()
		if cfg == nil {
			return nil
		}
		for _, root := range mgr.Roots() {
			_, _, err := mgr.Apply(context.Background(), loopConfigFromTelescopeConfig(root, "", cfg))
			if err != nil && logger != nil {
				logger.Warn("failed to apply generation config change", "root", root, "error", err)
			}
		}
		return nil
	})
}

// startGenerationLoops constructs and starts a Loop for each workspace root
// the server knows about. Invoked from the OnInitialized handler so
// initialize returns promptly.
//
// Returns the set of languages configured for source-file watching so the
// caller can register file-system watchers of the right shape.
func startGenerationLoops(ctx context.Context, mgr *generation.Manager, cfg *config.Config, rootPath string, logger *slog.Logger) []string {
	if mgr == nil || cfg == nil || rootPath == "" {
		return nil
	}
	if !cfg.Generation.OpenAPI.Enabled {
		return nil
	}
	root := rootPath
	if r := cfg.Generation.OpenAPI.Root; r != "" {
		root = r
	}
	lang := configLangFromCartographer(cfg.Generation.OpenAPI.Cartographer.Config)
	loop, err := mgr.Add(ctx, loopConfigFromTelescopeConfig(root, lang, cfg))
	if err != nil {
		if logger != nil {
			logger.Warn("failed to start generation loop", "root", root, "error", err)
		}
		return nil
	}
	if logger != nil {
		logger.Info("generation loop running",
			"root", root,
			"writeMode", string(loop.Writer().Mode()),
			"output", loop.Writer().OutputPath())
	}
	// Kick off an initial extraction so the first regeneration doesn't wait
	// on a source-file change.
	go func() {
		if _, err := loop.RegenerateNow(ctx, generation.TriggerAuto); err != nil && logger != nil {
			logger.Debug("initial generation extract failed", "error", err)
		}
	}()

	if lang != "" {
		return []string{lang}
	}
	return nil
}

// loopConfigFromTelescopeConfig translates the v2 config section into a
// generation.Config, centralising the mapping so every wiring entry point
// agrees.
func loopConfigFromTelescopeConfig(root, lang string, cfg *config.Config) generation.Config {
	return generation.Config{
		Root:           root,
		Lang:           lang,
		OutputPath:     cfg.Generation.OpenAPI.Output,
		WriteMode:      generation.WriteMode(cfg.Generation.OpenAPI.WriteMode),
		WriteSourceMap: cfg.Generation.OpenAPI.WriteSourceMap,
		TriggerMode:    cfg.Generation.OpenAPI.TriggerMode,
		DebounceWindow: time.Duration(cfg.Generation.OpenAPI.DebounceMs) * time.Millisecond,
	}
}

// configLangFromCartographer pulls an optional "lang" override from the
// pass-through cartographer config block.
func configLangFromCartographer(cfg map[string]any) string {
	if cfg == nil {
		return ""
	}
	if v, ok := cfg["lang"].(string); ok {
		return v
	}
	if v, ok := cfg["language"].(string); ok {
		return v
	}
	return ""
}
