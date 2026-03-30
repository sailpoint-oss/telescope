// Package plugin defines the in-process Plugin interface for registering
// rule providers with Telescope. User-authored rules use YAML config and the
// Bun sidecar (TypeScript/JavaScript); this package is for internal wiring.
package plugin

import (
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// Plugin is the interface that custom rule providers implement.
type Plugin interface {
	// Name returns the plugin's unique identifier.
	Name() string

	// Version returns the plugin's version string.
	Version() string

	// Checks returns the tree-sitter pattern-based checks this plugin provides.
	// Keys are rule IDs.
	Checks() map[string]treesitter.Check

	// Analyzers returns the semantic analyzer rules this plugin provides.
	// Keys are rule IDs.
	Analyzers() map[string]treesitter.Analyzer

	// Meta returns metadata for all rules in this plugin.
	Meta() []rules.RuleMeta
}

// PluginFunc is a constructor function that creates a Plugin instance.
// Plugins can be registered via this function type for lazy initialization.
type PluginFunc func() (Plugin, error)
