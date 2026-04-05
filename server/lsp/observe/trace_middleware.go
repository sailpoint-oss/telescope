package observe

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"

	"github.com/LukasParke/gossip/jsonrpc"
	"github.com/LukasParke/gossip/middleware"
)

type traceIDKey struct{}

func newTraceID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// TraceID returns middleware that generates a unique trace ID for each
// incoming LSP request and stores it in the context. The trace ID is
// also logged as a structured field for correlation.
func TraceID(logger *slog.Logger) middleware.Middleware {
	return func(next middleware.Handler) middleware.Handler {
		return func(ctx context.Context, method string, params jsonrpc.RawMessage) (interface{}, error) {
			tid := newTraceID()

			ctx = context.WithValue(ctx, traceIDKey{}, tid)

			if logger != nil {
				logger.Debug("lsp request",
					slog.String("trace_id", tid),
					slog.String("method", method))
			}

			return next(ctx, method, params)
		}
	}
}

// NewTraceID creates a random trace ID for non-request event correlation
// (e.g. notifications and background tasks).
func NewTraceID() string {
	return newTraceID()
}

// GetTraceID returns the trace ID from the context, or empty string if not set.
func GetTraceID(ctx context.Context) string {
	if v, ok := ctx.Value(traceIDKey{}).(string); ok {
		return v
	}
	return ""
}

// WithTraceID attaches a trace ID to the context. Useful for notifications
// or background tasks that need correlation with request logs.
func WithTraceID(ctx context.Context, traceID string) context.Context {
	return context.WithValue(ctx, traceIDKey{}, traceID)
}
