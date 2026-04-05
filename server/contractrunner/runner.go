// Package contractrunner queues Barometer contract test runs with bounded concurrency.
package contractrunner

import (
	"context"
	"sync"

	"github.com/sailpoint-oss/barometer/pkg/barometer"
	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/config"
)

// BuildBarometerClientConfig maps contractTests (timeouts, TLS paths) to a Barometer client config.
// workspaceRoot is used to resolve relative paths for TLS PEM files.
func BuildBarometerClientConfig(ct *config.ContractTestsConfig, workspaceRoot string) *barometer.ClientConfig {
	cfg := &barometer.ClientConfig{}
	if ct == nil {
		return cfg
	}
	cfg.SkipTLSVerify = ct.SkipTLSVerify
	if ct.RequestTimeout > 0 {
		cfg.Timeout = ct.RequestTimeout
	}
	cfg.TLSClientCertFile = config.ResolveWorkspacePath(workspaceRoot, ct.TLS.ClientCertFile)
	cfg.TLSClientKeyFile = config.ResolveWorkspacePath(workspaceRoot, ct.TLS.ClientKeyFile)
	cfg.TLSCACertFile = config.ResolveWorkspacePath(workspaceRoot, ct.TLS.CACertFile)
	return cfg
}

// Runner limits concurrent contract test executions.
type Runner struct {
	mu  sync.RWMutex
	sem chan struct{}
	cfg *config.Config
}

// New creates a runner. cfg may be nil (defaults apply).
func New(cfg *config.Config) *Runner {
	n := 2
	if cfg != nil {
		n = cfg.ContractTests.EffectiveConcurrency()
	}
	return &Runner{
		sem: make(chan struct{}, n),
		cfg: cfg,
	}
}

// Acquire waits for a worker slot or ctx cancellation.
func (r *Runner) Acquire(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case r.sem <- struct{}{}:
		return nil
	}
}

// Release returns a worker slot (call after Acquire).
func (r *Runner) Release() {
	select {
	case <-r.sem:
	default:
	}
}

// Config returns the telescope config snapshot.
func (r *Runner) Config() *config.Config {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.cfg
}

// SetConfig updates the config used for EffectiveConcurrency and related settings.
func (r *Runner) SetConfig(cfg *config.Config) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.cfg = cfg
}

// RunOpenAPISync runs OpenAPI contract tests synchronously.
func RunOpenAPISync(ctx context.Context, baseURL string, navIdx *navigator.Index, creds map[string]string, tags []string, operationID string, clientCfg *barometer.ClientConfig) (*barometer.Result, error) {
	cl, err := barometer.NewClient(clientCfg)
	if err != nil {
		return nil, err
	}
	opts := &barometer.RunOpts{
		Client:      cl,
		Tags:        tags,
		OperationID: operationID,
		Credentials: creds,
	}
	return barometer.RunWithIndex(ctx, navIdx, baseURL, opts)
}

// RunArazzoSync runs Arazzo workflows via Barometer config (file paths).
func RunArazzoSync(ctx context.Context, cfg *barometer.Config, clientCfg *barometer.ClientConfig) (*barometer.Result, error) {
	cl, err := barometer.NewClient(clientCfg)
	if err != nil {
		return nil, err
	}
	return barometer.Run(ctx, cfg, cl)
}

// StartOpenAPIAsync starts contract tests in the background.
func StartOpenAPIAsync(ctx context.Context, baseURL string, navIdx *navigator.Index, creds map[string]string, tags []string, operationID string, clientCfg *barometer.ClientConfig) (*barometer.Job, error) {
	cl, err := barometer.NewClient(clientCfg)
	if err != nil {
		return nil, err
	}
	opts := &barometer.RunOpts{
		Client:      cl,
		Tags:        tags,
		OperationID: operationID,
		Credentials: creds,
	}
	return barometer.StartWithIndex(ctx, navIdx, baseURL, opts), nil
}
