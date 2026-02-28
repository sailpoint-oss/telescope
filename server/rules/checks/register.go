// Package checks implements syntactic diagnostic rules as gossip Checks.
// These are pattern-based tree-sitter queries that run incrementally on
// changed ranges without needing the OpenAPI index.
package checks

import (
	"github.com/LukasParke/gossip"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// RegisterAll registers all syntactic checks on the given server and populates
// the rule registry with their metadata. All rules are registered
// unconditionally; filtering is handled by the DiagnosticTransformer.
func RegisterAll(s *gossip.Server) {
	all := []struct {
		register func(s *gossip.Server)
		meta     rules.RuleMeta
	}{
		{registerSyntaxErrors, syntaxErrorMeta},
		{registerDuplicateKeys, duplicateKeysMeta},
		{registerASCII, asciiMeta},
	}

	for _, entry := range all {
		rules.DefaultRegistry.Register(entry.meta)
		entry.register(s)
	}
}
