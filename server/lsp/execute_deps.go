package lsp

import (
	"github.com/LukasParke/gossip/lspclient"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/contractrunner"
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
	Aggregator           *lspclient.DiagnosticAggregator
}
