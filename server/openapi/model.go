package openapi

import (
	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/LukasParke/gossip/protocol"
)

// Loc tracks source location for any model element, linking back to the
// tree-sitter node that produced it.
type Loc struct {
	Range protocol.Range
	Node  *tree_sitter.Node
}

// LocFromNode creates a Loc from a tree-sitter node.
func LocFromNode(node *tree_sitter.Node) Loc {
	if node == nil {
		return Loc{}
	}
	start := node.StartPosition()
	end := node.EndPosition()
	return Loc{
		Range: protocol.Range{
			Start: protocol.Position{Line: uint32(start.Row), Character: uint32(start.Column)},
			End:   protocol.Position{Line: uint32(end.Row), Character: uint32(end.Column)},
		},
		Node: node,
	}
}

// DescriptionValue holds a decoded description string alongside source
// geometry needed for translating markdown-relative positions back to
// absolute LSP ranges.
type DescriptionValue struct {
	Text       string // decoded markdown content (block scalar indicators and indentation stripped)
	Loc        Loc    // source position of the YAML value node
	LineOffset int    // 0 for plain/quoted scalars, 1 for block scalars (| or >)
	IndentCols int    // leading whitespace stripped from block scalar content lines
}

// Document is the top-level OpenAPI document model.
type Document struct {
	Version       string // raw version string, e.g. "3.1.0"
	ParsedVersion Version
	DocType       DocType
	Info          *Info
	Servers       []Server
	Paths         map[string]*PathItem
	Components    *Components
	Security      []SecurityRequirement
	Tags          []Tag
	ExternalDocs  *ExternalDocs
	Extensions    map[string]*Node
	Loc           Loc
}

// Info object provides metadata about the API.
type Info struct {
	Title          string
	Description    DescriptionValue
	TermsOfService string
	Contact        *Contact
	License        *License
	Version        string
	Extensions     map[string]*Node
	Loc            Loc
	TitleLoc       Loc
	VersionLoc     Loc
}

type Contact struct {
	Name  string
	URL   string
	Email string
	Loc   Loc
}

type License struct {
	Name       string
	Identifier string
	URL        string
	Loc        Loc
}

// Server describes a server.
type Server struct {
	URL         string
	Description DescriptionValue
	Variables   map[string]*ServerVariable
	Loc         Loc
	URLLoc      Loc
}

type ServerVariable struct {
	Enum        []string
	Default     string
	Description DescriptionValue
	Loc         Loc
}

// PathItem describes the operations available on a single path.
type PathItem struct {
	Summary     string
	Description DescriptionValue
	Get         *Operation
	Put         *Operation
	Post        *Operation
	Delete      *Operation
	Options     *Operation
	Head        *Operation
	Patch       *Operation
	Trace       *Operation
	Parameters  []*Parameter
	Servers     []Server
	Ref        string
	Extensions map[string]*Node
	Loc        Loc
	PathLoc    Loc // location of the path key itself
}

// Operations returns all non-nil operations on this path item with their HTTP method.
func (p *PathItem) Operations() []MethodOperation {
	var ops []MethodOperation
	if p.Get != nil {
		ops = append(ops, MethodOperation{"get", p.Get})
	}
	if p.Put != nil {
		ops = append(ops, MethodOperation{"put", p.Put})
	}
	if p.Post != nil {
		ops = append(ops, MethodOperation{"post", p.Post})
	}
	if p.Delete != nil {
		ops = append(ops, MethodOperation{"delete", p.Delete})
	}
	if p.Options != nil {
		ops = append(ops, MethodOperation{"options", p.Options})
	}
	if p.Head != nil {
		ops = append(ops, MethodOperation{"head", p.Head})
	}
	if p.Patch != nil {
		ops = append(ops, MethodOperation{"patch", p.Patch})
	}
	if p.Trace != nil {
		ops = append(ops, MethodOperation{"trace", p.Trace})
	}
	return ops
}

type MethodOperation struct {
	Method    string
	Operation *Operation
}

// TagUsage tracks an individual tag reference within an operation's tags array,
// preserving per-tag source location for precise rename and highlight operations.
type TagUsage struct {
	Name string
	Loc  Loc
}

// Operation describes a single API operation on a path.
type Operation struct {
	OperationID  string
	Summary      string
	Description  DescriptionValue
	Tags         []TagUsage
	Parameters   []*Parameter
	RequestBody  *RequestBody
	Responses    map[string]*Response
	Security     []SecurityRequirement
	Deprecated   bool
	Servers      []Server
	ExternalDocs *ExternalDocs
	Extensions   map[string]*Node
	Loc            Loc
	OperationIDLoc Loc
	TagsLoc        Loc
}

// TagNames returns the tag names as a plain string slice.
func (op *Operation) TagNames() []string {
	names := make([]string, len(op.Tags))
	for i, t := range op.Tags {
		names[i] = t.Name
	}
	return names
}

// HasTag returns the TagUsage for the given name, if present.
func (op *Operation) HasTag(name string) (TagUsage, bool) {
	for _, t := range op.Tags {
		if t.Name == name {
			return t, true
		}
	}
	return TagUsage{}, false
}

// Parameter describes a single operation parameter.
type Parameter struct {
	Name            string
	In              string // "query", "header", "path", "cookie"
	Description     DescriptionValue
	Required        bool
	Deprecated      bool
	AllowEmptyValue bool
	Schema          *Schema
	Example         *Node
	Examples        map[string]*Example
	Ref             string
	Extensions      map[string]*Node
	Loc             Loc
	NameLoc         Loc
}

// RequestBody describes a request body.
type RequestBody struct {
	Description DescriptionValue
	Content     map[string]*MediaType
	Required    bool
	Ref         string
	Loc         Loc
}

// MediaType describes a media type with schema and examples.
type MediaType struct {
	Schema   *Schema
	Example  *Node
	Examples map[string]*Example
	Loc      Loc
}

// Response describes a single response from an API operation.
type Response struct {
	Description DescriptionValue
	Headers     map[string]*Header
	Content     map[string]*MediaType
	Links       map[string]*Link
	Ref         string
	Extensions  map[string]*Node
	Loc         Loc
}

type Header struct {
	Description DescriptionValue
	Required    bool
	Deprecated  bool
	Schema      *Schema
	Ref         string
	Loc         Loc
}

type Link struct {
	OperationRef string
	OperationID  string
	Description  DescriptionValue
	Ref          string
	Loc          Loc
}

// Schema describes a data type.
type Schema struct {
	Type                 string
	Format               string
	Title                string
	Description          DescriptionValue
	Default              *Node
	Enum                 []string
	Required             []string
	Properties           map[string]*Schema
	AdditionalProperties *Schema
	AllOf                []*Schema
	AnyOf                []*Schema
	OneOf                []*Schema
	Not                  *Schema
	Items                *Schema
	MinLength            *int
	MaxLength            *int
	Minimum              *float64
	Maximum              *float64
	MinItems             *int
	MaxItems             *int
	Pattern              string
	Nullable             bool
	ReadOnly             bool
	WriteOnly            bool
	Deprecated           bool
	Example              *Node
	ExternalDocs         *ExternalDocs
	Discriminator        *Discriminator
	Ref                  string
	Extensions           map[string]*Node
	Loc                  Loc
	TypeLoc              Loc
	NameLoc              Loc // location of the schema name key in components
}

type Discriminator struct {
	PropertyName string
	Mapping      map[string]string
	Loc          Loc
}

// Components holds reusable objects.
type Components struct {
	Schemas         map[string]*Schema
	Responses       map[string]*Response
	Parameters      map[string]*Parameter
	Examples        map[string]*Example
	RequestBodies   map[string]*RequestBody
	Headers         map[string]*Header
	SecuritySchemes map[string]*SecurityScheme
	Links           map[string]*Link
	Callbacks       map[string]*Callback
	PathItems       map[string]*PathItem
	Loc             Loc
}

type Example struct {
	Summary       string
	Description   DescriptionValue
	Value         *Node
	ExternalValue string
	Ref           string
	Loc           Loc
}

// SecurityScheme defines a security mechanism.
type SecurityScheme struct {
	Type             string
	Description      DescriptionValue
	Name             string
	In               string
	Scheme           string
	BearerFormat     string
	Flows            *OAuthFlows
	OpenIDConnectURL string
	Ref              string
	Extensions       map[string]*Node
	Loc              Loc
}

type OAuthFlows struct {
	Implicit          *OAuthFlow
	Password          *OAuthFlow
	ClientCredentials *OAuthFlow
	AuthorizationCode *OAuthFlow
	Loc               Loc
}

type OAuthFlow struct {
	AuthorizationURL string
	TokenURL         string
	RefreshURL       string
	Scopes           map[string]string
	Loc              Loc
	AuthorizationURLLoc Loc
	TokenURLLoc         Loc
}

type Callback = map[string]*PathItem

// SecurityRequirementEntry represents a single scheme entry within a security
// requirement object, tracking the source location of the scheme name key.
type SecurityRequirementEntry struct {
	Name    string
	Scopes  []string
	NameLoc Loc
}

// SecurityRequirement is a security requirement object (one element in the
// security array). Each object can contain multiple scheme entries.
type SecurityRequirement struct {
	Entries []SecurityRequirementEntry
	Loc     Loc
}

// SchemeNames returns the scheme names referenced in this requirement.
func (sr SecurityRequirement) SchemeNames() []string {
	names := make([]string, len(sr.Entries))
	for i, e := range sr.Entries {
		names[i] = e.Name
	}
	return names
}

// HasScheme returns the entry for the given scheme name, if present.
func (sr SecurityRequirement) HasScheme(name string) (SecurityRequirementEntry, bool) {
	for _, e := range sr.Entries {
		if e.Name == name {
			return e, true
		}
	}
	return SecurityRequirementEntry{}, false
}

// Tag adds metadata to a single tag used by operations.
type Tag struct {
	Name         string
	Description  DescriptionValue
	ExternalDocs *ExternalDocs
	Loc          Loc
	NameLoc      Loc
}

type ExternalDocs struct {
	Description DescriptionValue
	URL         string
	Loc         Loc
}

// Node is a lightweight wrapper for raw tree-sitter values that haven't been
// typed into a specific model struct.
type Node struct {
	Value    string
	RawNode  *tree_sitter.Node
	Loc      Loc
}
