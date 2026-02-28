package plugin

import (
	"fmt"
	"log/slog"

	"github.com/LukasParke/gossip"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// Manager loads and registers plugins with the gossip server.
type Manager struct {
	logger  *slog.Logger
	plugins []Plugin
}

// NewManager creates a plugin manager.
func NewManager(logger *slog.Logger) *Manager {
	return &Manager{
		logger: logger,
	}
}

// Register adds a plugin to the manager.
func (m *Manager) Register(p Plugin) {
	m.plugins = append(m.plugins, p)
}

// RegisterFunc creates and registers a plugin from a constructor function.
func (m *Manager) RegisterFunc(fn PluginFunc) error {
	p, err := fn()
	if err != nil {
		return fmt.Errorf("plugin init: %w", err)
	}
	m.Register(p)
	return nil
}

// LoadAll registers all plugins' rules and metadata with the server.
func (m *Manager) LoadAll(s *gossip.Server) error {
	for _, p := range m.plugins {
		m.logger.Info("loading plugin", "name", p.Name(), "version", p.Version())

		// Register metadata
		for _, meta := range p.Meta() {
			rules.DefaultRegistry.Register(meta)
		}

		// Register checks
		for id, check := range p.Checks() {
			s.Check(id, check)
		}

		// Register analyzers
		for id, analyzer := range p.Analyzers() {
			s.Analyze(id, analyzer)
		}
	}
	return nil
}

// Loaded returns the list of loaded plugins.
func (m *Manager) Loaded() []Plugin {
	return m.plugins
}
