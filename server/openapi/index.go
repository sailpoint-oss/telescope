package openapi

import (
	"strings"
	"sync"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
)

// OperationRef links an operation to its path and method.
type OperationRef struct {
	Path      string
	Method    string
	Operation *Operation
}

// RefUsage tracks where a $ref is used.
type RefUsage struct {
	URI    protocol.DocumentURI
	Loc    Loc
	Target string // the $ref target value (e.g. "#/components/schemas/Foo")
	From   string // JSONPath-like location of the reference
}

// Index provides fast lookups into a parsed OpenAPI document.
type Index struct {
	Document         *Document
	Arazzo           *ArazzoDocument
	Operations       map[string]*OperationRef   // operationId -> ref
	OperationsByPath map[string][]OperationRef  // path -> operations
	Schemas          map[string]*Schema         // component name -> schema
	Parameters       map[string]*Parameter      // component name -> parameter
	Responses        map[string]*Response       // component name -> response
	SecuritySchemes  map[string]*SecurityScheme // scheme name -> scheme
	Refs             map[string][]RefUsage      // $ref target -> usages
	AllRefs          []RefUsage                 // all $ref usages in the doc
	Tags             map[string]*Tag            // tag name -> tag
	Version          Version
	Format           FileFormat
	Kind             DocumentKind
	nav              *navigator.Index
}

// BuildIndex creates a full index from a parsed tree and document.
func BuildIndex(tree *treesitter.Tree, doc *document.Document) *Index {
	format := FormatFromURI(string(doc.URI()))
	parser := NewParser(tree, format)
	oaDoc := parser.Parse()

	idx := &Index{
		Document:         oaDoc,
		Operations:       make(map[string]*OperationRef),
		OperationsByPath: make(map[string][]OperationRef),
		Schemas:          make(map[string]*Schema),
		Parameters:       make(map[string]*Parameter),
		Responses:        make(map[string]*Response),
		SecuritySchemes:  make(map[string]*SecurityScheme),
		Refs:             make(map[string][]RefUsage),
		Tags:             make(map[string]*Tag),
		Version:          oaDoc.ParsedVersion,
		Format:           format,
	}

	idx.indexPaths(oaDoc, doc.URI())
	idx.indexComponents(oaDoc)
	idx.indexTags(oaDoc)
	idx.collectRefs(tree, doc, format)

	if doc != nil && tree != nil {
		if navIdx := navigator.ParseContent(tree.Source(), string(doc.URI())); navIdx != nil {
			if navIdx.IsArazzo() {
				return IndexFromNavigator(navIdx, doc.URI())
			}
			idx.nav = navIdx
			idx.Kind = navIdx.Kind
			if idx.Version == "" || idx.Version == VersionUnknown {
				idx.Version = navIdx.Version
			}
		}
	}
	if idx.Kind == DocumentKindUnknown && idx.Document != nil && idx.Document.DocType != DocTypeUnknown {
		idx.Kind = DocumentKindOpenAPI
	}

	return idx
}

func (idx *Index) indexPaths(doc *Document, uri protocol.DocumentURI) {
	for path, item := range doc.Paths {
		var ops []OperationRef
		for _, mo := range item.Operations() {
			ref := OperationRef{
				Path:      path,
				Method:    mo.Method,
				Operation: mo.Operation,
			}
			ops = append(ops, ref)
			if mo.Operation.OperationID != "" {
				idx.Operations[mo.Operation.OperationID] = &ref
			}
		}
		idx.OperationsByPath[path] = ops
	}
}

func (idx *Index) indexComponents(doc *Document) {
	if doc.Components == nil {
		return
	}
	for name, s := range doc.Components.Schemas {
		idx.Schemas[name] = s
	}
	for name, p := range doc.Components.Parameters {
		idx.Parameters[name] = p
	}
	for name, r := range doc.Components.Responses {
		idx.Responses[name] = r
	}
	for name, ss := range doc.Components.SecuritySchemes {
		idx.SecuritySchemes[name] = ss
	}
}

func (idx *Index) indexTags(doc *Document) {
	for i := range doc.Tags {
		t := &doc.Tags[i]
		idx.Tags[t.Name] = t
	}
}

// collectRefs scans the tree for all $ref values and records them via manual
// tree walking. This avoids needing a tree-sitter language reference for queries.
func (idx *Index) collectRefs(tree *treesitter.Tree, doc *document.Document, format FileFormat) {
	if tree == nil {
		return
	}
	root := tree.RootNode()
	if root == nil {
		return
	}
	idx.walkForRefs(root, tree, format, nil)
	for i := range idx.AllRefs {
		idx.AllRefs[i].URI = doc.URI()
	}
	for target := range idx.Refs {
		for i := range idx.Refs[target] {
			idx.Refs[target][i].URI = doc.URI()
		}
	}
}

func (idx *Index) walkForRefs(node *tree_sitter.Node, tree *treesitter.Tree, format FileFormat, path []string) {
	if node == nil {
		return
	}
	kind := node.Kind()

	isKVPair := (format == FormatYAML && (kind == "block_mapping_pair" || kind == "flow_pair")) ||
		(format == FormatJSON && kind == "pair")

	if isKVPair {
		keyNode := node.ChildByFieldName("key")
		valueNode := node.ChildByFieldName("value")
		if keyNode != nil && valueNode != nil {
			keyText := unquote(tree.NodeText(keyNode))
			if keyText == "$ref" {
				refTarget := unquote(tree.NodeText(valueNode))
				usage := RefUsage{
					Loc:    Loc{Range: adapt.RangeFromProtocol(tree.NodeRange(valueNode)), Node: valueNode},
					Target: refTarget,
					From:   "/" + strings.Join(path, "/"),
				}
				idx.Refs[refTarget] = append(idx.Refs[refTarget], usage)
				idx.AllRefs = append(idx.AllRefs, usage)
				return // $ref nodes don't have meaningful children
			}
			// Descend into the value with the key appended to the path.
			childPath := append(path, escapeJSONPointer(keyText))
			idx.walkForRefs(valueNode, tree, format, childPath)
			return
		}
	}

	for i := uint(0); i < node.ChildCount(); i++ {
		child := node.Child(i)
		if child != nil {
			idx.walkForRefs(child, tree, format, path)
		}
	}
}

// Resolve resolves a $ref string to a model element. Returns nil and an error
// if the ref cannot be resolved within this index.
func (idx *Index) Resolve(ref string) (interface{}, error) {
	return idx.ResolveRef(ref)
}

// PrimaryValue returns the canonical top-level value for this index.
// Navigator-backed indexes use Navigator's whole-document/fragment semantics.
func (idx *Index) PrimaryValue() interface{} {
	if idx == nil {
		return nil
	}
	if idx.nav != nil {
		if pv, ok := any(idx.nav).(interface{ PrimaryValue() interface{} }); ok {
			return pv.PrimaryValue()
		}
	}
	return idx.Document
}

// DocumentKind returns the API-description family represented by the index.
func (idx *Index) DocumentKind() DocumentKind {
	if idx == nil {
		return DocumentKindUnknown
	}
	if idx.Kind != DocumentKindUnknown {
		return idx.Kind
	}
	if idx.nav != nil {
		return idx.nav.Kind
	}
	if idx.Document != nil {
		return DocumentKindOpenAPI
	}
	if idx.Arazzo != nil {
		return DocumentKindArazzo
	}
	return DocumentKindUnknown
}

// NavigatorIndex returns the navigator-backed index when available.
func (idx *Index) NavigatorIndex() *navigator.Index {
	if idx == nil {
		return nil
	}
	return idx.nav
}

// IsOpenAPI returns true if the index represents a root OpenAPI document.
func (idx *Index) IsOpenAPI() bool {
	return idx != nil &&
		idx.DocumentKind() == DocumentKindOpenAPI &&
		idx.Document != nil &&
		idx.Document.DocType == DocTypeRoot
}

// IsArazzo returns true if the index represents a root Arazzo document.
func (idx *Index) IsArazzo() bool {
	return idx != nil &&
		idx.DocumentKind() == DocumentKindArazzo &&
		idx.Arazzo != nil
}

// IsRootDocument returns true for root OpenAPI or Arazzo documents.
func (idx *Index) IsRootDocument() bool {
	return idx.IsOpenAPI() || idx.IsArazzo()
}

// IsAPIDescription returns true when Telescope recognized the file as a
// supported API-description document.
func (idx *Index) IsAPIDescription() bool {
	kind := idx.DocumentKind()
	return kind == DocumentKindOpenAPI || kind == DocumentKindArazzo
}

// HasPath returns true if the given path template exists.
func (idx *Index) HasPath(path string) bool {
	if idx == nil || idx.Document == nil {
		return false
	}
	_, ok := idx.Document.Paths[path]
	return ok
}

// AllOperations returns all indexed operations.
func (idx *Index) AllOperations() []*OperationRef {
	ops := make([]*OperationRef, 0, len(idx.Operations))
	for _, op := range idx.Operations {
		ops = append(ops, op)
	}
	return ops
}

// SchemaNames returns all component schema names.
func (idx *Index) SchemaNames() []string {
	names := make([]string, 0, len(idx.Schemas))
	for name := range idx.Schemas {
		names = append(names, name)
	}
	return names
}

// ComponentNames returns the names of all components of a given kind.
func (idx *Index) ComponentNames(kind string) []string {
	if idx.Document == nil || idx.Document.Components == nil {
		return nil
	}
	switch kind {
	case "schemas":
		return mapKeys(idx.Document.Components.Schemas)
	case "responses":
		return mapKeys(idx.Document.Components.Responses)
	case "parameters":
		return mapKeys(idx.Document.Components.Parameters)
	case "examples":
		return mapKeys(idx.Document.Components.Examples)
	case "requestBodies":
		return mapKeys(idx.Document.Components.RequestBodies)
	case "headers":
		return mapKeys(idx.Document.Components.Headers)
	case "securitySchemes":
		return mapKeys(idx.Document.Components.SecuritySchemes)
	case "links":
		return mapKeys(idx.Document.Components.Links)
	default:
		return nil
	}
}

func mapKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

// RefsTo returns all usages that reference the given target.
func (idx *Index) RefsTo(target string) []RefUsage {
	return idx.Refs[target]
}

// IndexCache provides a thread-safe cache of per-document indexes.
type IndexCache struct {
	mu      sync.RWMutex
	indexes map[protocol.DocumentURI]*Index
	builder func(protocol.DocumentURI) *Index
}

// NewIndexCache creates a new index cache.
func NewIndexCache() *IndexCache {
	return &IndexCache{
		indexes: make(map[protocol.DocumentURI]*Index),
	}
}

// NormalizeURI canonicalizes a file:// URI so that URIs produced by the LSP
// client and by the server's pathToURI function compare equal as map keys.
// It delegates to gossip's protocol.NormalizeURI which cleans the path,
// removes host/query/fragment, and re-serializes.
func NormalizeURI(uri string) string {
	return string(protocol.NormalizeURI(protocol.DocumentURI(uri)))
}

// SetBuilder registers a fallback function that builds the index on-demand
// when Get finds no cached entry. The builder must be safe for concurrent use.
func (c *IndexCache) SetBuilder(fn func(protocol.DocumentURI) *Index) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.builder = fn
}

// Get returns the cached index for a URI. If no cached entry exists and a
// builder has been registered via SetBuilder, it builds, caches, and returns
// the index on demand. The URI is normalized before lookup.
func (c *IndexCache) Get(uri protocol.DocumentURI) *Index {
	norm := protocol.NormalizeURI(uri)
	c.mu.RLock()
	idx := c.indexes[norm]
	builder := c.builder
	c.mu.RUnlock()
	if idx != nil {
		return idx
	}
	if builder == nil {
		return nil
	}
	idx = builder(uri)
	if idx != nil {
		c.Set(uri, idx)
	}
	return idx
}

// Rebuild forces the registered builder to run even when a cached entry
// already exists. Handlers for open documents can use this to prefer the
// freshest live-buffer view over a potentially stale cached projection.
func (c *IndexCache) Rebuild(uri protocol.DocumentURI) *Index {
	norm := protocol.NormalizeURI(uri)
	c.mu.RLock()
	builder := c.builder
	c.mu.RUnlock()
	if builder == nil {
		return nil
	}
	idx := builder(uri)
	if idx != nil {
		c.Set(norm, idx)
	}
	return idx
}

// Set stores an index for a URI. The URI is normalized before storage.
func (c *IndexCache) Set(uri protocol.DocumentURI, idx *Index) {
	norm := protocol.NormalizeURI(uri)
	c.mu.Lock()
	defer c.mu.Unlock()
	c.indexes[norm] = idx
}

// Delete removes the index for a URI. The URI is normalized before lookup.
func (c *IndexCache) Delete(uri protocol.DocumentURI) {
	norm := protocol.NormalizeURI(uri)
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.indexes, norm)
}

// All returns all cached indexes.
func (c *IndexCache) All() map[protocol.DocumentURI]*Index {
	c.mu.RLock()
	defer c.mu.RUnlock()
	result := make(map[protocol.DocumentURI]*Index, len(c.indexes))
	for k, v := range c.indexes {
		result[k] = v
	}
	return result
}

// FindByOperationID searches all cached indexes for an operationId.
func (c *IndexCache) FindByOperationID(opID string) (protocol.DocumentURI, *OperationRef) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for uri, idx := range c.indexes {
		if ref, ok := idx.Operations[opID]; ok {
			return uri, ref
		}
	}
	return "", nil
}

// FindRefTarget searches all cached indexes for a $ref target.
func (c *IndexCache) FindRefTarget(ref string) (protocol.DocumentURI, interface{}) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for uri, idx := range c.indexes {
		if result, err := idx.Resolve(ref); err == nil {
			return uri, result
		}
	}
	return "", nil
}
