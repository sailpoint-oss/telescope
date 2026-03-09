package sdk

import (
	"log/slog"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/core/graph"
)

// WorkspaceConfig holds configuration for a Workspace instance.
type WorkspaceConfig struct {
	BuiltinRules      bool
	CustomRules       bool
	Logger            *slog.Logger
	Stages            []graph.Stage
	Config            *config.Config
	GoroutinePoolSize int
}

// Option configures a Workspace.
type Option func(*WorkspaceConfig)

// WithBuiltinRules enables or disables the built-in Telescope rules.
func WithBuiltinRules(enabled bool) Option {
	return func(c *WorkspaceConfig) {
		c.BuiltinRules = enabled
	}
}

// WithCustomRules enables or disables custom rule loading via the Bun sidecar.
func WithCustomRules(enabled bool) Option {
	return func(c *WorkspaceConfig) {
		c.CustomRules = enabled
	}
}

// WithLogger sets the logger for the workspace.
func WithLogger(logger *slog.Logger) Option {
	return func(c *WorkspaceConfig) {
		c.Logger = logger
	}
}

// WithStages overrides the default pipeline stages.
func WithStages(stages []graph.Stage) Option {
	return func(c *WorkspaceConfig) {
		c.Stages = stages
	}
}

// WithConfig sets the Telescope configuration.
func WithConfig(cfg *config.Config) Option {
	return func(c *WorkspaceConfig) {
		c.Config = cfg
	}
}

// WithGoroutinePoolSize sets the maximum number of goroutines for parallel analysis.
func WithGoroutinePoolSize(size int) Option {
	return func(c *WorkspaceConfig) {
		c.GoroutinePoolSize = size
	}
}
