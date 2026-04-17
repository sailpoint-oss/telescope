package lsp

import (
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/contractrunner"
	"github.com/sailpoint-oss/telescope/server/generation"
)

// EffectiveConfig returns live workspace Telescope config when ConfigProvider is set.
func (d *ExecuteCommandDeps) EffectiveConfig() *config.Config {
	if d == nil {
		return config.DefaultConfig()
	}
	if d.ConfigProvider != nil {
		if c := d.ConfigProvider(); c != nil {
			return c
		}
	}
	if d.Config != nil {
		return d.Config
	}
	return config.DefaultConfig()
}

// WorkspaceEnv returns merged dotenv variables for the workspace (or nil).
func (d *ExecuteCommandDeps) WorkspaceEnv() map[string]string {
	if d == nil || d.WorkspaceEnvProvider == nil {
		return nil
	}
	return d.WorkspaceEnvProvider()
}

// ExecuteCommandDeps wires contract testing and diagnostic aggregation for executeCommand.
type ExecuteCommandDeps struct {
	Config               *config.Config
	ConfigProvider       func() *config.Config
	WorkspaceEnvProvider func() map[string]string
	Runner               *contractrunner.Runner
	DocsPreview          *DocsPreviewManager
	DiagnosticMux        *DiagnosticMux
	// Generation is the shared generation.Manager; non-nil when the
	// generation loop is wired into the server. The generation-facing
	// execute commands (regenerate, openGeneratedSpec, etc.) key off it.
	Generation *generation.Manager
}
