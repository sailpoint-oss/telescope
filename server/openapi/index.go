package openapi

import (
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
//
// The navigator-backed index is computed lazily on first access via
// NavigatorIndex() / navIndex(); BuildIndex itself only invokes navigator for
// documents that are known-or-suspected to be Arazzo (which requires
// navigator's model to branch into IndexFromNavigator). For the common
// OpenAPI path we skip the ~400k-allocation navigator.ParseContent and
// amortize that cost across the features that actually dereference nav.
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

	// nav is the navigator index backing richer resolution/kind queries.
	// It is populated lazily by navIndex(); access via NavigatorIndex() or
	// navIndex() rather than the bare field.
	nav *navigator.Index
	// navSource captures the raw document source so navIndex() can run
	// navigator.ParseContent on demand when the eager path was skipped.
	// nil when the index came in through IndexFromNavigator (which already
	// owns its navigator.Index).
	navSource []byte
	navURI    string
	// navOnce is a pointer rather than an inline sync.Once so that the Index
	// struct remains copyable (tests in this package legitimately copy an
	// Index by value to mutate nav for fallback-path coverage, and go vet's
	// copylocks check forbids inlining locks). Shared Once across copies is
	// exactly what we want: once the navigator is materialized, every view
	// of the index observes the same value.
	navOnce *sync.Once
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
		source := tree.Source()
		// Arazzo documents require navigator's branch-sensitive index to
		// populate Arazzo-specific fields, so we MUST parse navigator
		// eagerly for them. Fast-path the common OpenAPI case by doing a
		// lightweight prefix check first.
		if looksLikeArazzo(source) {
			if navIdx := navigator.ParseContent(source, string(doc.URI())); navIdx != nil {
				if navIdx.IsArazzo() {
					return IndexFromNavigator(navIdx, doc.URI())
				}
				idx.nav = navIdx
				idx.Kind = navIdx.Kind
				if idx.Version == "" || idx.Version == VersionUnknown {
					idx.Version = navIdx.Version
				}
				// Eagerly populated — skip any future lazy work.
				idx.navOnce = &sync.Once{}
				idx.navOnce.Do(func() {})
			}
		} else {
			// Defer navigator parse until a feature actually needs it.
			idx.navSource = source
			idx.navURI = string(doc.URI())
			idx.navOnce = &sync.Once{}
		}
	}
	if idx.Kind == DocumentKindUnknown && idx.Document != nil && idx.Document.DocType != DocTypeUnknown {
		idx.Kind = DocumentKindOpenAPI
	}

	return idx
}

// looksLikeArazzo returns true when the source begins with an arazzo root
// key. The check is deliberately conservative: it scans only the first 4 KiB
// for `\narazzo:` (YAML) or `"arazzo":` (JSON). False positives fall back to
// navigator.ParseContent in BuildIndex, false negatives skip the nav parse
// entirely (recovered on demand via navIndex()).
func looksLikeArazzo(source []byte) bool {
	limit := len(source)
	if limit > 4096 {
		limit = 4096
	}
	head := source[:limit]
	for i := 0; i < limit; i++ {
		// YAML: line starts with "arazzo:" at column 0 (either first line or
		// after a newline).
		if head[i] == 'a' && (i == 0 || head[i-1] == '\n') {
			if i+len("arazzo:") <= limit && string(head[i:i+len("arazzo:")]) == "arazzo:" {
				return true
			}
		}
		// JSON: `"arazzo"` property name anywhere near the top of the doc.
		if head[i] == '"' && i+len(`"arazzo"`) <= limit && string(head[i:i+len(`"arazzo"`)]) == `"arazzo"` {
			return true
		}
	}
	return false
}

// navIndex returns the navigator-backed index, parsing it from navSource on
// first access. Thread-safe: the sync.Once guard guarantees a single parse
// even when several LSP handlers race on the same document.
func (idx *Index) navIndex() *navigator.Index {
	if idx == nil {
		return nil
	}
	if idx.navOnce == nil {
		// Index was constructed without BuildIndex (e.g. IndexFromNavigator
		// or a hand-crafted test value). Fall back to the raw field.
		return idx.nav
	}
	idx.navOnce.Do(func() {
		if idx.nav != nil || len(idx.navSource) == 0 {
			return
		}
		if parsed := navigator.ParseContent(idx.navSource, idx.navURI); parsed != nil {
			idx.nav = parsed
			if idx.Kind == DocumentKindUnknown {
				idx.Kind = parsed.Kind
			}
			if idx.Version == "" || idx.Version == VersionUnknown {
				idx.Version = parsed.Version
			}
		}
		// Release the source so repeated Nav() calls don't keep the raw bytes alive.
		idx.navSource = nil
	})
	return idx.nav
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
	// Pre-size the path buffer to a depth that covers typical OpenAPI structures
	// (components.schemas.FooBar.properties.name is 5 segments deep). A single
	// reusable byte buffer is mutated via push/pop to avoid the per-descent
	// slice allocation and per-ref strings.Join the previous implementation
	// paid for every reference.
	var from fromPath
	from.buf = make([]byte, 0, 256)
	idx.walkForRefs(root, tree, format, &from)
	uri := doc.URI()
	for i := range idx.AllRefs {
		idx.AllRefs[i].URI = uri
	}
	for target := range idx.Refs {
		for i := range idx.Refs[target] {
			idx.Refs[target][i].URI = uri
		}
	}
}

// fromPath is a mutable JSON-Pointer-like buffer used during the ref walk.
// push appends "/escaped-key" and returns the checkpoint for a matching pop;
// string() returns a fresh Go string snapshot suitable for storing on a
// RefUsage. Using a reusable buffer instead of a []string path avoids the
// append-on-descent allocation for every nested value and the strings.Join
// allocation every time a $ref is recorded.
type fromPath struct {
	buf []byte
}

func (p *fromPath) push(escapedKey string) int {
	checkpoint := len(p.buf)
	p.buf = append(p.buf, '/')
	p.buf = append(p.buf, escapedKey...)
	return checkpoint
}

func (p *fromPath) pop(checkpoint int) {
	p.buf = p.buf[:checkpoint]
}

func (p *fromPath) string() string {
	if len(p.buf) == 0 {
		return "/"
	}
	return string(p.buf)
}

func (idx *Index) walkForRefs(node *tree_sitter.Node, tree *treesitter.Tree, format FileFormat, from *fromPath) {
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
					From:   from.string(),
				}
				idx.Refs[refTarget] = append(idx.Refs[refTarget], usage)
				idx.AllRefs = append(idx.AllRefs, usage)
				return // $ref nodes don't have meaningful children
			}
			// Descend into the value with the key appended to the path.
			checkpoint := from.push(escapeJSONPointer(keyText))
			idx.walkForRefs(valueNode, tree, format, from)
			from.pop(checkpoint)
			return
		}
	}

	for i := uint(0); i < node.ChildCount(); i++ {
		child := node.Child(i)
		if child != nil {
			idx.walkForRefs(child, tree, format, from)
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
	if nav := idx.navIndex(); nav != nil {
		if pv, ok := any(nav).(interface{ PrimaryValue() interface{} }); ok {
			return pv.PrimaryValue()
		}
	}
	return idx.Document
}

// DocumentKind returns the API-description family represented by the index.
// This accessor does NOT trigger lazy navigator parsing because the kind is
// populated eagerly whenever BuildIndex can determine it — the only path that
// would still need navigator is a document whose telescope parser produced
// an unknown DocType, and in that case falling back to the parsed Document
// type already reports the correct kind.
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

// NavigatorIndex returns the navigator-backed index, parsing it lazily on
// first access. Returns nil only when the original BuildIndex invocation had
// no tree/document source to parse from.
func (idx *Index) NavigatorIndex() *navigator.Index {
	if idx == nil {
		return nil
	}
	return idx.navIndex()
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
