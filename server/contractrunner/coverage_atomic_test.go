package contractrunner

import (
	"context"
	"runtime"
	"testing"
	"time"

	"github.com/sailpoint-oss/telescope/server/config"
)

func TestNew_DefaultConcurrency(t *testing.T) {
	r := New(nil)
	if r == nil {
		t.Fatal("New(nil) returned nil")
	}
	if cap(r.sem) != 2 {
		t.Errorf("default concurrency = %d, want 2", cap(r.sem))
	}
}

func TestNew_CustomConcurrency(t *testing.T) {
	cfg := &config.Config{
		ContractTests: config.ContractTestsConfig{Concurrency: 5},
	}
	r := New(cfg)
	if cap(r.sem) != 5 {
		t.Errorf("concurrency = %d, want 5", cap(r.sem))
	}
}

func TestAcquireRelease(t *testing.T) {
	r := New(nil)
	ctx := context.Background()
	if err := r.Acquire(ctx); err != nil {
		t.Fatalf("Acquire: %v", err)
	}
	r.Release()
}

func TestAcquire_CancelledContext(t *testing.T) {
	cfg := &config.Config{
		ContractTests: config.ContractTestsConfig{Concurrency: 1},
	}
	r := New(cfg)

	ctx := context.Background()
	if err := r.Acquire(ctx); err != nil {
		t.Fatalf("first Acquire: %v", err)
	}

	ctx2, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	err := r.Acquire(ctx2)
	if err == nil {
		t.Error("expected context deadline error when semaphore is full")
	}
	r.Release()
}

func TestRelease_ExtraRelease(t *testing.T) {
	r := New(nil)
	r.Release()
}

func TestConfig_NilSafe(t *testing.T) {
	r := New(nil)
	if r.Config() != nil {
		t.Error("Config() should be nil when created with nil")
	}
}

func TestSetConfig(t *testing.T) {
	r := New(nil)
	cfg := &config.Config{Extends: "telescope:all"}
	r.SetConfig(cfg)
	if r.Config() != cfg {
		t.Error("SetConfig did not store the config")
	}
}

func TestSetConfig_OverwritesPrevious(t *testing.T) {
	cfg1 := &config.Config{Extends: "telescope:recommended"}
	cfg2 := &config.Config{Extends: "telescope:strict"}
	r := New(cfg1)
	if r.Config() != cfg1 {
		t.Error("initial config not stored")
	}
	r.SetConfig(cfg2)
	if r.Config() != cfg2 {
		t.Error("SetConfig did not overwrite previous config")
	}
}

func TestBuildBarometerClientConfig_NilContractTests(t *testing.T) {
	cfg := BuildBarometerClientConfig(nil, "/workspace")
	if cfg == nil {
		t.Fatal("expected non-nil client config")
	}
	if cfg.SkipTLSVerify {
		t.Error("SkipTLSVerify should default to false")
	}
}

func TestBuildBarometerClientConfig_SkipTLS(t *testing.T) {
	ct := &config.ContractTestsConfig{SkipTLSVerify: true}
	cfg := BuildBarometerClientConfig(ct, "/workspace")
	if !cfg.SkipTLSVerify {
		t.Error("SkipTLSVerify should be true")
	}
}

func TestBuildBarometerClientConfig_Timeout(t *testing.T) {
	ct := &config.ContractTestsConfig{RequestTimeout: 30 * time.Second}
	cfg := BuildBarometerClientConfig(ct, "/workspace")
	if cfg.Timeout != 30*time.Second {
		t.Errorf("Timeout = %v, want 30s", cfg.Timeout)
	}
}

func TestBuildBarometerClientConfig_TLSPaths(t *testing.T) {
	var absCA string
	if runtime.GOOS == "windows" {
		// On Windows, filepath.IsAbs("/absolute/...") is false, so ResolveWorkspacePath would join.
		absCA = `C:\absolute\ca.pem`
	} else {
		absCA = "/absolute/ca.pem"
	}
	ct := &config.ContractTestsConfig{
		TLS: config.ContractTLSConfig{
			ClientCertFile: "certs/client.pem",
			ClientKeyFile:  "certs/client-key.pem",
			CACertFile:     absCA,
		},
	}
	cfg := BuildBarometerClientConfig(ct, "/workspace")
	if cfg.TLSClientCertFile == "" {
		t.Error("TLSClientCertFile should be resolved")
	}
	if cfg.TLSCACertFile != absCA {
		t.Errorf("absolute CA path should be preserved, got %q want %q", cfg.TLSCACertFile, absCA)
	}
}

func TestBuildBarometerClientConfig_ZeroTimeout(t *testing.T) {
	ct := &config.ContractTestsConfig{RequestTimeout: 0}
	cfg := BuildBarometerClientConfig(ct, "/workspace")
	if cfg.Timeout != 0 {
		t.Errorf("zero timeout should remain 0, got %v", cfg.Timeout)
	}
}

func TestAcquire_MultipleSlots(t *testing.T) {
	cfg := &config.Config{
		ContractTests: config.ContractTestsConfig{Concurrency: 3},
	}
	r := New(cfg)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		if err := r.Acquire(ctx); err != nil {
			t.Fatalf("Acquire %d: %v", i, err)
		}
	}

	ctx2, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if err := r.Acquire(ctx2); err == nil {
		t.Error("expected timeout when all 3 slots consumed")
	}

	for i := 0; i < 3; i++ {
		r.Release()
	}

	if err := r.Acquire(ctx); err != nil {
		t.Fatalf("Acquire after release: %v", err)
	}
	r.Release()
}
