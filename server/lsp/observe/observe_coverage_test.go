package observe

import (
	"context"
	"encoding/hex"
	"log/slog"
	"testing"

	"github.com/LukasParke/gossip/jsonrpc"
)

func TestNewTraceID_Format(t *testing.T) {
	for i := range 50 {
		id := NewTraceID()
		if len(id) != 16 {
			t.Fatalf("iteration %d: len = %d, want 16", i, len(id))
		}
		if _, err := hex.DecodeString(id); err != nil {
			t.Fatalf("iteration %d: %q is not valid hex: %v", i, id, err)
		}
	}
}

func TestNewTraceID_Unique(t *testing.T) {
	seen := make(map[string]struct{}, 100)
	for range 100 {
		id := NewTraceID()
		if _, dup := seen[id]; dup {
			t.Fatalf("duplicate trace id: %s", id)
		}
		seen[id] = struct{}{}
	}
}

func TestWithTraceID_GetTraceID_Roundtrip(t *testing.T) {
	ctx := context.Background()
	ctx = WithTraceID(ctx, "abc123")
	if got := GetTraceID(ctx); got != "abc123" {
		t.Errorf("GetTraceID = %q, want %q", got, "abc123")
	}
}

func TestGetTraceID_EmptyOnBareContext(t *testing.T) {
	if got := GetTraceID(context.Background()); got != "" {
		t.Errorf("GetTraceID on bare context = %q, want empty", got)
	}
}

func TestGetTraceID_EmptyOnNilValue(t *testing.T) {
	ctx := context.WithValue(context.Background(), traceIDKey{}, 12345)
	if got := GetTraceID(ctx); got != "" {
		t.Errorf("GetTraceID with non-string value = %q, want empty", got)
	}
}

func TestTraceIDMiddleware_InjectsTraceID(t *testing.T) {
	logger := slog.Default()
	mw := TraceID(logger)

	var captured string
	handler := mw(func(ctx context.Context, method string, params jsonrpc.RawMessage) (interface{}, error) {
		captured = GetTraceID(ctx)
		return nil, nil
	})

	_, err := handler(context.Background(), "textDocument/hover", nil)
	if err != nil {
		t.Fatalf("handler returned error: %v", err)
	}

	if len(captured) != 16 {
		t.Errorf("trace id len = %d, want 16", len(captured))
	}
	if _, err := hex.DecodeString(captured); err != nil {
		t.Errorf("trace id %q is not valid hex: %v", captured, err)
	}
}

func TestTraceIDMiddleware_NilLogger(t *testing.T) {
	mw := TraceID(nil)

	var captured string
	handler := mw(func(ctx context.Context, method string, params jsonrpc.RawMessage) (interface{}, error) {
		captured = GetTraceID(ctx)
		return "ok", nil
	})

	result, err := handler(context.Background(), "textDocument/completion", nil)
	if err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if result != "ok" {
		t.Errorf("result = %v, want %q", result, "ok")
	}
	if len(captured) != 16 {
		t.Errorf("trace id len = %d, want 16", len(captured))
	}
}

func TestTraceIDMiddleware_PassesThroughResult(t *testing.T) {
	mw := TraceID(nil)
	handler := mw(func(ctx context.Context, method string, params jsonrpc.RawMessage) (interface{}, error) {
		return map[string]string{"key": "value"}, nil
	})

	result, err := handler(context.Background(), "custom/method", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	m, ok := result.(map[string]string)
	if !ok || m["key"] != "value" {
		t.Errorf("result = %v, want map with key=value", result)
	}
}

func TestTraceIDMiddleware_UniquePerRequest(t *testing.T) {
	mw := TraceID(nil)
	var ids []string
	handler := mw(func(ctx context.Context, method string, params jsonrpc.RawMessage) (interface{}, error) {
		ids = append(ids, GetTraceID(ctx))
		return nil, nil
	})

	for range 10 {
		handler(context.Background(), "test/method", nil)
	}

	seen := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		if _, dup := seen[id]; dup {
			t.Fatalf("duplicate trace id across requests: %s", id)
		}
		seen[id] = struct{}{}
	}
}
