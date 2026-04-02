package contractrunner

import (
	"context"
	"testing"
	"time"

	"github.com/sailpoint-oss/telescope/server/config"
)

func TestNew_UsesConfiguredConcurrency(t *testing.T) {
	r := New(&config.Config{
		ContractTests: config.ContractTestsConfig{Concurrency: 5},
	})
	if got := cap(r.sem); got != 5 {
		t.Fatalf("runner semaphore cap = %d, want 5", got)
	}
}

func TestAcquireReleaseAndConfig(t *testing.T) {
	r := New(nil)
	if r.Config() != nil {
		t.Fatal("expected nil config initially")
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := r.Acquire(ctx); err != nil {
		t.Fatalf("Acquire: %v", err)
	}
	r.Release()
	r.Release()

	cfg := &config.Config{
		ContractTests: config.ContractTestsConfig{Concurrency: 3},
	}
	r.SetConfig(cfg)
	if r.Config() != cfg {
		t.Fatal("expected config snapshot to be updated")
	}
}

func TestAcquire_RespectsCanceledContext(t *testing.T) {
	r := New(&config.Config{
		ContractTests: config.ContractTestsConfig{Concurrency: 1},
	})
	if err := r.Acquire(context.Background()); err != nil {
		t.Fatalf("initial Acquire: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := r.Acquire(ctx); err == nil {
		t.Fatal("expected canceled Acquire to return an error")
	}
}
