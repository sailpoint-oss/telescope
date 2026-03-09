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

// TraceID returns middleware that generates a unique trace ID for each
// incoming LSP request and stores it in the context. The trace ID is
// also logged as a structured field for correlation.
func TraceID(logger *slog.Logger) middleware.Middleware {
	return func(next middleware.Handler) middleware.Handler {
		return func(ctx context.Context, method string, params jsonrpc.RawMessage) (interface{}, error) {
			var b [8]byte
			_, _ = rand.Read(b[:])
			tid := hex.EncodeToString(b[:])

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

// GetTraceID returns the trace ID from the context, or empty string if not set.
func GetTraceID(ctx context.Context) string {
	if v, ok := ctx.Value(traceIDKey{}).(string); ok {
		return v
	}
	return ""
}
