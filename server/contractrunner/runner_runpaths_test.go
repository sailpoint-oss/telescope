package contractrunner

import (
	"context"
	"strings"
	"testing"

	"github.com/sailpoint-oss/barometer/pkg/barometer"
)

func TestRunHelpers_ReturnClientConfigErrors(t *testing.T) {
	badClientCfg := &barometer.ClientConfig{
		TLSClientCertFile: "client-cert.pem",
	}

	if _, err := RunOpenAPISync(context.Background(), "http://localhost:8080", nil, nil, nil, "", badClientCfg); err == nil {
		t.Fatal("expected RunOpenAPISync to return client construction error")
	}

	if _, err := RunArazzoSync(context.Background(), &barometer.Config{}, badClientCfg); err == nil {
		t.Fatal("expected RunArazzoSync to return client construction error")
	}

	job, err := StartOpenAPIAsync(context.Background(), "http://localhost:8080", nil, nil, nil, "", badClientCfg)
	if err == nil {
		t.Fatal("expected StartOpenAPIAsync to return client construction error")
	}
	if job != nil {
		t.Fatalf("expected nil job on client error, got %+v", job)
	}
}

func TestRunHelpers_ErrorMessageIncludesTLSHint(t *testing.T) {
	_, err := RunOpenAPISync(context.Background(), "http://localhost:8080", nil, nil, nil, "", &barometer.ClientConfig{
		TLSCACertFile: "missing-ca.pem",
	})
	if err == nil {
		t.Fatal("expected TLS CA file error")
	}
	if !strings.Contains(err.Error(), "TLS CA") {
		t.Fatalf("expected TLS CA hint in error, got %q", err)
	}
}
