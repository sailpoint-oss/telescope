package contractrunner

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/sailpoint-oss/barometer/pkg/barometer"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/wiretap"
)

// fakeSidecar implements wiretapSession for tests that don't want to spawn
// an actual wiretap binary. Flags let individual tests simulate specific
// branch outcomes (WaitReady error, Stop error, CollectReport data).
type fakeSidecar struct {
	proxyURL        string
	monitorURL      string
	readyErr        error
	stopErr         error
	stopCalled      int
	collectErr      error
	collectFindings []wiretap.WiretapFinding
}

func (f *fakeSidecar) ProxyURL() string                           { return f.proxyURL }
func (f *fakeSidecar) MonitorURL() string                         { return f.monitorURL }
func (f *fakeSidecar) WaitReady(ctx context.Context) error        { return f.readyErr }
func (f *fakeSidecar) Stop() error                                { f.stopCalled++; return f.stopErr }
func (f *fakeSidecar) CollectReport() ([]wiretap.WiretapFinding, error) {
	return f.collectFindings, f.collectErr
}

func withFakeStart(t *testing.T, mk func(ctx context.Context, opts wiretap.SidecarOpts) (wiretapSession, error)) {
	t.Helper()
	orig := startWiretapSidecar
	startWiretapSidecar = mk
	t.Cleanup(func() { startWiretapSidecar = orig })
}

func TestBuildBarometerClientConfig_DefaultsWhenNil(t *testing.T) {
	cfg := BuildBarometerClientConfig(nil, "/workspace")
	if cfg == nil {
		t.Fatal("expected non-nil config for nil input")
	}
	if cfg.SkipTLSVerify {
		t.Fatal("default SkipTLSVerify should be false")
	}
}

func TestBuildBarometerClientConfig_PopulatesTLSAndTimeout(t *testing.T) {
	ct := &config.ContractTestsConfig{
		SkipTLSVerify:  true,
		RequestTimeout: 15 * time.Second,
		TLS: config.ContractTLSConfig{
			ClientCertFile: "certs/client.crt",
			ClientKeyFile:  "certs/client.key",
			CACertFile:     "certs/ca.pem",
		},
	}
	workspace := "/workspace"
	cfg := BuildBarometerClientConfig(ct, workspace)
	if !cfg.SkipTLSVerify {
		t.Fatal("SkipTLSVerify should flow through")
	}
	if cfg.Timeout != 15*time.Second {
		t.Fatalf("Timeout = %v, want 15s", cfg.Timeout)
	}
	// Relative TLS paths should resolve against the workspace root.
	if cfg.TLSClientCertFile != filepath.Join(workspace, "certs", "client.crt") {
		t.Fatalf("ClientCertFile not resolved: %q", cfg.TLSClientCertFile)
	}
	if cfg.TLSClientKeyFile != filepath.Join(workspace, "certs", "client.key") {
		t.Fatalf("ClientKeyFile not resolved: %q", cfg.TLSClientKeyFile)
	}
	if cfg.TLSCACertFile != filepath.Join(workspace, "certs", "ca.pem") {
		t.Fatalf("CACertFile not resolved: %q", cfg.TLSCACertFile)
	}
}

func TestBuildBarometerClientConfig_ZeroTimeoutLeavesUnset(t *testing.T) {
	ct := &config.ContractTestsConfig{}
	cfg := BuildBarometerClientConfig(ct, "")
	if cfg.Timeout != 0 {
		t.Fatalf("Timeout should stay zero when unset; got %v", cfg.Timeout)
	}
}

func TestRunner_AcquireRelease(t *testing.T) {
	r := New(&config.Config{})
	if err := r.Acquire(context.Background()); err != nil {
		t.Fatalf("Acquire: %v", err)
	}
	r.Release()
}

func TestRunner_AcquireRespectsCancelledContext(t *testing.T) {
	r := New(&config.Config{})
	// Fill the semaphore to block the next Acquire.
	if err := r.Acquire(context.Background()); err != nil {
		t.Fatalf("prime: %v", err)
	}
	if err := r.Acquire(context.Background()); err != nil {
		t.Fatalf("second Acquire: %v", err)
	}
	// New runner defaults to 2 slots; fill again to block.
	r2 := &Runner{sem: make(chan struct{}, 1), cfg: nil}
	r2.sem <- struct{}{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := r2.Acquire(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
}

func TestRunner_ConfigRoundTrip(t *testing.T) {
	r := New(nil)
	if r.Config() != nil {
		t.Fatal("expected nil config")
	}
	cfg := &config.Config{}
	r.SetConfig(cfg)
	if r.Config() != cfg {
		t.Fatal("SetConfig did not persist")
	}
}

func TestEnsureWiretap_NilRunner(t *testing.T) {
	var r *Runner
	if err := r.EnsureWiretap(context.Background(), "", "", "", config.WiretapConfig{}); err != nil {
		t.Fatalf("nil runner should be a no-op: %v", err)
	}
}

func TestEnsureWiretap_DisabledIsNoop(t *testing.T) {
	r := New(nil)
	withFakeStart(t, func(ctx context.Context, opts wiretap.SidecarOpts) (wiretapSession, error) {
		t.Fatal("start should not be invoked when wiretap is disabled")
		return nil, nil
	})
	if err := r.EnsureWiretap(context.Background(), "", "spec.yaml", "http://up", config.WiretapConfig{Enabled: false}); err != nil {
		t.Fatalf("EnsureWiretap disabled: %v", err)
	}
}

func TestEnsureWiretap_RequiresSpec(t *testing.T) {
	r := New(nil)
	err := r.EnsureWiretap(context.Background(), "", "", "http://up", config.WiretapConfig{Enabled: true})
	if err == nil {
		t.Fatal("expected error when spec path missing")
	}
}

func TestEnsureWiretap_RequiresBaseURL(t *testing.T) {
	r := New(nil)
	err := r.EnsureWiretap(context.Background(), "", "spec.yaml", "", config.WiretapConfig{Enabled: true})
	if err == nil {
		t.Fatal("expected error when base URL missing")
	}
}

func TestEnsureWiretap_StartFailurePropagates(t *testing.T) {
	r := New(nil)
	withFakeStart(t, func(ctx context.Context, opts wiretap.SidecarOpts) (wiretapSession, error) {
		return nil, errors.New("boom")
	})
	err := r.EnsureWiretap(context.Background(), "", "spec.yaml", "http://up", config.WiretapConfig{Enabled: true})
	if err == nil || err.Error() != "boom" {
		t.Fatalf("expected 'boom', got %v", err)
	}
}

func TestEnsureWiretap_WaitReadyFailureStops(t *testing.T) {
	r := New(nil)
	fake := &fakeSidecar{readyErr: errors.New("not ready")}
	withFakeStart(t, func(ctx context.Context, opts wiretap.SidecarOpts) (wiretapSession, error) {
		return fake, nil
	})
	err := r.EnsureWiretap(context.Background(), "", "spec.yaml", "http://up", config.WiretapConfig{Enabled: true})
	if err == nil {
		t.Fatal("expected readiness error")
	}
	if fake.stopCalled == 0 {
		t.Fatal("sidecar Stop should have been called to clean up after WaitReady failure")
	}
}

func TestEnsureWiretap_SuccessInstallsSession(t *testing.T) {
	r := New(nil)
	fake := &fakeSidecar{monitorURL: "http://127.0.0.1:3000", proxyURL: "http://127.0.0.1:3001"}
	withFakeStart(t, func(ctx context.Context, opts wiretap.SidecarOpts) (wiretapSession, error) {
		return fake, nil
	})
	if err := r.EnsureWiretap(context.Background(), "", "spec.yaml", "http://up", config.WiretapConfig{Enabled: true}); err != nil {
		t.Fatalf("EnsureWiretap: %v", err)
	}
	if got := r.WiretapMonitorURL(); got != "http://127.0.0.1:3000" {
		t.Fatalf("MonitorURL = %q", got)
	}
	r.StopWiretap()
	if fake.stopCalled == 0 {
		t.Fatal("StopWiretap should have called Stop on the sidecar")
	}
	// Second EnsureWiretap should Stop the previous sidecar before starting a new one.
	fake2 := &fakeSidecar{monitorURL: "http://127.0.0.1:3002"}
	withFakeStart(t, func(ctx context.Context, opts wiretap.SidecarOpts) (wiretapSession, error) {
		return fake2, nil
	})
	if err := r.EnsureWiretap(context.Background(), "", "spec.yaml", "http://up", config.WiretapConfig{Enabled: true}); err != nil {
		t.Fatalf("second EnsureWiretap: %v", err)
	}
	if r.WiretapMonitorURL() != "http://127.0.0.1:3002" {
		t.Fatalf("second monitor URL not applied: %q", r.WiretapMonitorURL())
	}
}

func TestWiretapMonitorURL_NoSidecar(t *testing.T) {
	r := New(nil)
	if got := r.WiretapMonitorURL(); got != "" {
		t.Fatalf("no sidecar should produce empty string, got %q", got)
	}
}

func TestStopWiretap_NilSafe(t *testing.T) {
	var r *Runner
	r.StopWiretap() // must not panic
}

func TestCloneClientConfig_NilReturnsEmpty(t *testing.T) {
	got := cloneClientConfig(nil)
	if got == nil {
		t.Fatal("clone of nil should return a non-nil zero config")
	}
}

func TestCloneClientConfig_CopiesFields(t *testing.T) {
	orig := &barometer.ClientConfig{Timeout: 5 * time.Second, SkipTLSVerify: true}
	cloned := cloneClientConfig(orig)
	if cloned == orig {
		t.Fatal("clone should return a distinct pointer")
	}
	if cloned.Timeout != orig.Timeout || cloned.SkipTLSVerify != orig.SkipTLSVerify {
		t.Fatal("fields not copied")
	}
}
