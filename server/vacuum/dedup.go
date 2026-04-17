package vacuum

import (
	"fmt"
	"strings"

	"github.com/LukasParke/gossip/protocol"
)

// ruleAliases maps human-friendly rule IDs to the canonical SailPoint rule ID
// they duplicate at the same source position. When two diagnostics collide on
// (line, character) and land in the same bucket via this map, the secondary
// is dropped.
//
// Pairs chosen from docs/pr-review-tooling.md gap #8 in cloud-api-client-common:
// reviewers saw the same violation twice (sp-115 AND parameter-description,
// sp-403 AND missing-error-responses, sp-602 AND missing-pagination). The
// SailPoint rule is preferred because it carries the guideline-link metadata.
var ruleAliases = map[string]string{
	"parameter-description":   "sp-115",
	"missing-error-responses": "sp-403",
	"missing-pagination":      "sp-602",
}

// canonicalRuleID returns the SailPoint rule ID for an aliased alternative,
// or the input unchanged if no alias applies.
func canonicalRuleID(code string) string {
	if alias, ok := ruleAliases[code]; ok {
		return alias
	}
	return code
}

// Deduplicate keeps all primary diagnostics and drops secondary diagnostics
// that collide on start position plus a canonical category bucket. The
// canonical bucket folds known alias pairs (e.g. parameter-description and
// sp-115) onto a single key so reviewers see one row per underlying rule.
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
// results to ensure the combined set does not emit both sp-115 and
// parameter-description for the same location.
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
