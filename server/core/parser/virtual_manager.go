package parser

import (
	"sync"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// VirtualDocumentManager maintains the set of virtual documents for all source documents.
type VirtualDocumentManager struct {
	mu        sync.RWMutex
	docs      map[string][]VirtualDocument // parent URI -> virtual docs
	byURI     map[string]*VirtualDocument // virtual URI -> doc
	providers []EmbeddedLanguageProvider
}

// NewVirtualDocumentManager creates a manager with the given providers.
func NewVirtualDocumentManager(providers ...EmbeddedLanguageProvider) *VirtualDocumentManager {
	return &VirtualDocumentManager{
		docs:      make(map[string][]VirtualDocument),
		byURI:     make(map[string]*VirtualDocument),
		providers: providers,
	}
}

// Update regenerates virtual documents for a parent document.
func (m *VirtualDocumentManager) Update(parentURI string, root *SemanticNode) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Remove existing virtual docs for this parent
	for _, vd := range m.docs[parentURI] {
		delete(m.byURI, vd.URI)
	}
	delete(m.docs, parentURI)

	if root == nil {
		return
	}

	var all []VirtualDocument
	for _, p := range m.providers {
		all = append(all, p.Extract(root, parentURI)...)
	}

	m.docs[parentURI] = all
	for i := range all {
		m.byURI[all[i].URI] = &all[i]
	}
}

// Get returns the virtual document for a URI.
func (m *VirtualDocumentManager) Get(uri string) *VirtualDocument {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.byURI[uri]
}

// ForParent returns all virtual documents for a parent URI.
func (m *VirtualDocumentManager) ForParent(parentURI string) []VirtualDocument {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return append([]VirtualDocument(nil), m.docs[parentURI]...)
}

// Remove removes all virtual documents for a parent URI.
func (m *VirtualDocumentManager) Remove(parentURI string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, vd := range m.docs[parentURI] {
		delete(m.byURI, vd.URI)
	}
	delete(m.docs, parentURI)
}

// Providers returns the registered embedded language providers.
func (m *VirtualDocumentManager) Providers() []EmbeddedLanguageProvider {
	return m.providers
}

// FindAtPosition finds the virtual document containing the given position in the parent document.
func (m *VirtualDocumentManager) FindAtPosition(parentURI string, pos ctypes.Position) *VirtualDocument {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for i := range m.docs[parentURI] {
		vd := &m.docs[parentURI][i]
		if ctypes.ContainsPosition(vd.SourceRange, pos) {
			return vd
		}
	}
	return nil
}
