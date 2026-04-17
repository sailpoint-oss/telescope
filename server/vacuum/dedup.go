package vacuum

import (
	"fmt"
	"strings"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/barrelman/rulesets/bridge"
)

// canonicalRuleID returns the canonical SailPoint slug for an aliased
// rule id (vacuum, spectral, or legacy kebab), or the input unchanged
// if no bridge entry applies. Lookups go through barrelman's bridge
// so telescope and barrelman stay in sync.
func canonicalRuleID(code string) string {
	return bridge.Canonical(code)
}

// Deduplicate keeps all primary diagnostics and drops secondary diagnostics
// that collide on start position plus a canonical category bucket. The
// canonical bucket folds aliased rule pairs (for example
// `parameter-description` and `sailpoint-parameter-description`) onto a
// single key so reviewers see one row per underlying rule.
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

// DeduplicateWithin folds aliased rule IDs within a single diagnostic stream.
// Callers like the lintengine apply this after merging Barrelman + Vacuum
// results to ensure the combined set does not emit both the canonical
// SailPoint slug and its vacuum/spectral/legacy alias for the same
// source location.
func DeduplicateWithin(diags []protocol.Diagnostic) []protocol.Diagnostic {
	if len(diags) <= 1 {
		return diags
	}
	out := make([]protocol.Diagnostic, 0, len(diags))
	seen := make(map[string]int, len(diags))
	for _, diag := range diags {
		key := dedupKey(diag)
		if idx, ok := seen[key]; ok {
			// Prefer the diagnostic whose code already matches the canonical
			// bucket (has the richer guideline-link metadata). If the existing
			// entry is canonical, keep it; otherwise swap.
			existingCode, _ := out[idx].Code.(string)
			newCode, _ := diag.Code.(string)
			if existingCode != canonicalRuleID(existingCode) && newCode == canonicalRuleID(newCode) {
				out[idx] = diag
			}
			continue
		}
		seen[key] = len(out)
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
		return canonicalRuleID(strings.ToLower(strings.TrimSpace(code)))
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
