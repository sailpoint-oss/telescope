// Package rules provides the rule registry, metadata types, and registration
// functions for all Telescope diagnostic rules.
package rules

import (
	"sync"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// Category groups related rules.
type Category string

const (
	CategoryNaming        Category = "naming"
	CategoryDocumentation Category = "documentation"
	CategoryStructure     Category = "structure"
	CategoryTypes         Category = "types"
	CategorySecurity      Category = "security"
	CategoryServers       Category = "servers"
	CategoryPaths         Category = "paths"
	CategoryReferences    Category = "references"
	CategorySyntax        Category = "syntax"
	CategoryOWASP         Category = "owasp"
)

// RuleMeta holds descriptive metadata for a rule. Decoupled from the actual
// Check/Analyzer implementation so that metadata can be queried independently.
type RuleMeta struct {
	ID          string
	Description string
	Severity    protocol.DiagnosticSeverity
	Category    Category
	Recommended bool
	Formats     []openapi.Format // which spec versions this rule applies to
	HowToFix    string
	DocURL      string
}

// Registry provides thread-safe lookup of rule metadata.
type Registry struct {
	mu    sync.RWMutex
	rules map[string]RuleMeta
}

// NewRegistry creates an empty rule registry.
func NewRegistry() *Registry {
	return &Registry{
		rules: make(map[string]RuleMeta),
	}
}

// Register adds rule metadata to the registry.
func (r *Registry) Register(meta RuleMeta) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.rules[meta.ID] = meta
}

// Get returns metadata for a rule, or false if not found.
func (r *Registry) Get(id string) (RuleMeta, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	meta, ok := r.rules[id]
	return meta, ok
}

// All returns all registered rule metadata.
func (r *Registry) All() []RuleMeta {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]RuleMeta, 0, len(r.rules))
	for _, m := range r.rules {
		result = append(result, m)
	}
	return result
}

// ByCategory returns all rules in a given category.
func (r *Registry) ByCategory(cat Category) []RuleMeta {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var result []RuleMeta
	for _, m := range r.rules {
		if m.Category == cat {
			result = append(result, m)
		}
	}
	return result
}

// Recommended returns only rules marked as recommended.
func (r *Registry) Recommended() []RuleMeta {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var result []RuleMeta
	for _, m := range r.rules {
		if m.Recommended {
			result = append(result, m)
		}
	}
	return result
}

// IDs returns all registered rule IDs.
func (r *Registry) IDs() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ids := make([]string, 0, len(r.rules))
	for id := range r.rules {
		ids = append(ids, id)
	}
	return ids
}

// DefaultRegistry is the global rule metadata registry populated by init functions
// in the checks/ and analyzers/ sub-packages.
var DefaultRegistry = NewRegistry()

// Source is the diagnostic source string used for all Telescope rules.
const Source = "telescope"

// DocBaseURL is the base URL for rule documentation.
const DocBaseURL = "https://telescope.dev/rules/"
