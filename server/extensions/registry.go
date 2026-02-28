package extensions

import (
	"encoding/json"
	"fmt"
	"sync"
)

// Registry holds all registered extension definitions and provides lookup
// by scope and extension name.
type Registry struct {
	mu         sync.RWMutex
	extensions map[string]*CompiledExtension // name -> extension
	byScope    map[Scope][]*CompiledExtension
	required   map[string]bool // extension names that must be present
}

// NewRegistry creates an empty extension registry.
func NewRegistry() *Registry {
	return &Registry{
		extensions: make(map[string]*CompiledExtension),
		byScope:    make(map[Scope][]*CompiledExtension),
		required:   make(map[string]bool),
	}
}

// Register adds an extension definition to the registry.
func (r *Registry) Register(meta ExtensionMeta) error {
	var schemaData map[string]interface{}
	if len(meta.Schema) > 0 {
		if err := json.Unmarshal(meta.Schema, &schemaData); err != nil {
			return fmt.Errorf("invalid schema for extension %s: %w", meta.Name, err)
		}
	}

	ext := &CompiledExtension{
		Meta:       meta,
		SchemaData: schemaData,
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	r.extensions[meta.Name] = ext
	for _, scope := range meta.Scopes {
		r.byScope[scope] = append(r.byScope[scope], ext)
		if scope == ScopeAny {
			for _, s := range AllScopes {
				r.byScope[s] = append(r.byScope[s], ext)
			}
		}
	}
	return nil
}

// SetRequired marks extension names that must be present where scoped.
func (r *Registry) SetRequired(names []string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.required = make(map[string]bool, len(names))
	for _, name := range names {
		r.required[name] = true
	}
}

// GetForScope returns all extensions registered for the given scope.
func (r *Registry) GetForScope(scope Scope) []*CompiledExtension {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.byScope[scope]
}

// Get returns a single extension by name.
func (r *Registry) Get(name string) (*CompiledExtension, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ext, ok := r.extensions[name]
	return ext, ok
}

// IsRequired returns whether the named extension is required.
func (r *Registry) IsRequired(name string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.required[name]
}

// RequiredForScope returns extensions that are required for the given scope.
func (r *Registry) RequiredForScope(scope Scope) []*CompiledExtension {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []*CompiledExtension
	for _, ext := range r.byScope[scope] {
		if r.required[ext.Meta.Name] {
			result = append(result, ext)
		}
	}
	return result
}

// IsRegistered returns whether an extension name is known to the registry.
func (r *Registry) IsRegistered(name string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.extensions[name]
	return ok
}

// ValidAtScope returns whether the named extension is valid at the given scope.
func (r *Registry) ValidAtScope(name string, scope Scope) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ext, ok := r.extensions[name]
	if !ok {
		return true // unknown extensions are not validated by scope
	}
	for _, s := range ext.Meta.Scopes {
		if s == ScopeAny || s == scope {
			return true
		}
	}
	return false
}

// Count returns the number of registered extensions.
func (r *Registry) Count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.extensions)
}
