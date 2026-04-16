package vacuum

import (
	"fmt"
	"strings"

	"github.com/LukasParke/gossip/protocol"
)

// Deduplicate keeps all primary diagnostics and drops secondary diagnostics that
// collide on start position plus a coarse category bucket.
func Deduplicate(primary []protocol.Diagnostic, secondary []protocol.Diagnostic) []protocol.Diagnostic {
	if len(primary) == 0 {
		return append([]protocol.Diagnostic(nil), secondary...)
	}
	if len(secondary) == 0 {
		return append([]protocol.Diagnostic(nil), primary...)
	}
	out := append([]protocol.Diagnostic(nil), primary...)
	seen := make(map[string]struct{}, len(primary))
	for _, diag := range primary {
		seen[dedupKey(diag)] = struct{}{}
	}
	for _, diag := range secondary {
		key := dedupKey(diag)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, diag)
	}
	return out
}

func dedupKey(diag protocol.Diagnostic) string {
	return fmt.Sprintf("%d:%d:%s",
		diag.Range.Start.Line,
		diag.Range.Start.Character,
		categoryBucket(diag))
}

func categoryBucket(diag protocol.Diagnostic) string {
	if code, ok := diag.Code.(string); ok && strings.TrimSpace(code) != "" {
		return strings.ToLower(strings.TrimSpace(code))
	}
	msg := strings.ToLower(strings.TrimSpace(diag.Message))
	if idx := strings.Index(msg, ":"); idx > 0 {
		msg = msg[:idx]
	}
	if msg == "" {
		return strings.ToLower(strings.TrimSpace(diag.Source))
	}
	return msg
}
