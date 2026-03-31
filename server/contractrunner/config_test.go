package contractrunner

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/sailpoint-oss/telescope/server/config"
)

func TestBuildBarometerClientConfig_nil(t *testing.T) {
	cfg := BuildBarometerClientConfig(nil, "/workspace")
	if cfg == nil {
		t.Fatal("expected non-nil config")
	}
	if cfg.SkipTLSVerify {
		t.Error("SkipTLSVerify should be false when config is nil")
	}
	if cfg.Timeout != 0 {
		t.Errorf("Timeout: got %v want 0", cfg.Timeout)
	}
}

func TestBuildBarometerClientConfig_mapsTLSAndTimeouts(t *testing.T) {
	ws := filepath.FromSlash("/tmp/ws")
	ct := &config.ContractTestsConfig{
		RequestTimeout: 7 * time.Second,
		SkipTLSVerify:  true,
		TLS: config.ContractTLSConfig{
			ClientCertFile: "certs/a.pem",
			ClientKeyFile:    "certs/a.key",
			CACertFile:       "certs/ca.pem",
		},
	}
	cfg := BuildBarometerClientConfig(ct, ws)
	if !cfg.SkipTLSVerify {
		t.Error("SkipTLSVerify")
	}
	if cfg.Timeout != 7*time.Second {
		t.Errorf("Timeout: got %v", cfg.Timeout)
	}
	if got := filepath.ToSlash(cfg.TLSClientCertFile); got != filepath.ToSlash(filepath.Join(ws, "certs/a.pem")) {
		t.Errorf("TLSClientCertFile: got %q", got)
	}
	if got := filepath.ToSlash(cfg.TLSClientKeyFile); got != filepath.ToSlash(filepath.Join(ws, "certs/a.key")) {
		t.Errorf("TLSClientKeyFile: got %q", got)
	}
	if got := filepath.ToSlash(cfg.TLSCACertFile); got != filepath.ToSlash(filepath.Join(ws, "certs/ca.pem")) {
		t.Errorf("TLSCACertFile: got %q", got)
	}
}

func TestBuildBarometerClientConfig_absoluteTLSPathsUnchanged(t *testing.T) {
	absCert := filepath.FromSlash("/etc/ssl/client.pem")
	ct := &config.ContractTestsConfig{
		TLS: config.ContractTLSConfig{
			ClientCertFile: absCert,
		},
	}
	cfg := BuildBarometerClientConfig(ct, "/workspace")
	if cfg.TLSClientCertFile != absCert {
		t.Errorf("got %q want %q", cfg.TLSClientCertFile, absCert)
	}
}
