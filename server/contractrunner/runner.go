// Package contractrunner queues Barometer contract test runs with bounded concurrency.
package contractrunner

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/sailpoint-oss/barometer/pkg/barometer"
	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/wiretap"
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
	mu      sync.RWMutex
	sem     chan struct{}
	cfg     *config.Config
	wiretap wiretapSession
}

type wiretapSession interface {
	ProxyURL() string
	MonitorURL() string
	WaitReady(context.Context) error
	Stop() error
	CollectReport() ([]wiretap.WiretapFinding, error)
}

var startWiretapSidecar = func(ctx context.Context, opts wiretap.SidecarOpts) (wiretapSession, error) {
	return wiretap.Start(ctx, opts)
}

// New creates a runner. cfg may be nil (defaults apply).
func New(cfg *config.Config) *Runner {
	n := 2
	if cfg != nil {
		n = cfg.EffectiveContractConcurrency()
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

// EnsureWiretap starts a fresh sidecar for the supplied spec/base URL pair.
func (r *Runner) EnsureWiretap(ctx context.Context, workspaceRoot, specPath, baseURL string, wtCfg config.WiretapConfig) error {
	if r == nil || !wtCfg.Enabled {
		return nil
	}
	if strings.TrimSpace(specPath) == "" {
		return fmt.Errorf("wiretap requires an OpenAPI spec path")
	}
	if strings.TrimSpace(baseURL) == "" {
		return fmt.Errorf("wiretap requires a base URL")
	}
	r.StopWiretap()
	sidecar, err := startWiretapSidecar(ctx, wiretap.SidecarOpts{
		BinaryPath:  config.ResolveWorkspacePath(workspaceRoot, wtCfg.BinaryPath),
		SpecPath:    specPath,
		UpstreamURL: baseURL,
		MonitorPort: wtCfg.MonitorPort,
		ExtraArgs:   append([]string(nil), wtCfg.ExtraArgs...),
	})
	if err != nil {
		return err
	}
	if err := sidecar.WaitReady(ctx); err != nil {
		_ = sidecar.Stop()
		return err
	}
	r.mu.Lock()
	r.wiretap = sidecar
	r.mu.Unlock()
	return nil
}

// StopWiretap stops the active sidecar, if any.
func (r *Runner) StopWiretap() {
	if r == nil {
		return
	}
	r.mu.Lock()
	sidecar := r.wiretap
	r.wiretap = nil
	r.mu.Unlock()
	if sidecar != nil {
		_ = sidecar.Stop()
	}
}

// WiretapMonitorURL returns the active sidecar monitor URL, if any.
func (r *Runner) WiretapMonitorURL() string {
	sidecar := r.currentWiretap()
	if sidecar == nil {
		return ""
	}
	return sidecar.MonitorURL()
}

func (r *Runner) currentWiretap() wiretapSession {
	if r == nil {
		return nil
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.wiretap
}

// RunOpenAPISync runs OpenAPI contract tests synchronously.
func RunOpenAPISync(ctx context.Context, baseURL, specPath string, navIdx *navigator.Index, creds map[string]string, tags []string, operationID string, clientCfg *barometer.ClientConfig, runner *Runner) (*barometer.Result, []wiretap.WiretapFinding, error) {
	resolvedClientCfg := cloneClientConfig(clientCfg)
	if sidecar := runner.currentWiretap(); sidecar != nil {
		resolvedClientCfg.ProxyURL = sidecar.ProxyURL()
	}
	cl, err := barometer.NewClient(resolvedClientCfg)
	if err != nil {
		return nil, nil, err
	}
	opts := &barometer.RunOpts{
		Client:      cl,
		Tags:        tags,
		OperationID: operationID,
		Credentials: creds,
		OpenAPISpec: specPath,
	}
	result, runErr := barometer.RunWithIndex(ctx, navIdx, baseURL, opts)
	var findings []wiretap.WiretapFinding
	if sidecar := runner.currentWiretap(); sidecar != nil {
		findings, _ = sidecar.CollectReport()
	}
	return result, findings, runErr
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
func StartOpenAPIAsync(ctx context.Context, baseURL, specPath string, navIdx *navigator.Index, creds map[string]string, tags []string, operationID string, clientCfg *barometer.ClientConfig, runner *Runner) (*barometer.Job, error) {
	resolvedClientCfg := cloneClientConfig(clientCfg)
	if sidecar := runner.currentWiretap(); sidecar != nil {
		resolvedClientCfg.ProxyURL = sidecar.ProxyURL()
	}
	cl, err := barometer.NewClient(resolvedClientCfg)
	if err != nil {
		return nil, err
	}
	opts := &barometer.RunOpts{
		Client:      cl,
		Tags:        tags,
		OperationID: operationID,
		Credentials: creds,
		OpenAPISpec: specPath,
	}
	return barometer.StartWithIndex(ctx, navIdx, baseURL, opts), nil
}

func cloneClientConfig(cfg *barometer.ClientConfig) *barometer.ClientConfig {
	if cfg == nil {
		return &barometer.ClientConfig{}
	}
	cloned := *cfg
	return &cloned
}
