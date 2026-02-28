package openapi

import (
	"strconv"
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	"gopkg.in/yaml.v3"

	"github.com/LukasParke/gossip/treesitter"
)

// Parser builds an OpenAPI Document from a tree-sitter parse tree.
type Parser struct {
	tree   *treesitter.Tree
	format FileFormat
}

// NewParser creates a parser for a given tree and file format.
func NewParser(tree *treesitter.Tree, format FileFormat) *Parser {
	return &Parser{tree: tree, format: format}
}

// Parse walks the tree-sitter tree and returns a typed OpenAPI Document.
func (p *Parser) Parse() *Document {
	root := p.tree.RootNode()
	if root == nil {
		return &Document{DocType: DocTypeUnknown}
	}

	var mappingNode *tree_sitter.Node
	switch p.format {
	case FormatYAML:
		mappingNode = p.findYAMLRoot(root)
	case FormatJSON:
		mappingNode = p.findJSONRoot(root)
	default:
		return &Document{DocType: DocTypeUnknown}
	}

	if mappingNode == nil {
		return &Document{DocType: DocTypeUnknown}
	}

	doc := &Document{
		Paths:      make(map[string]*PathItem),
		Extensions: make(map[string]*Node),
		Loc:        LocFromNode(mappingNode),
	}

	p.walkMapping(mappingNode, func(key, value *tree_sitter.Node) {
		k := p.nodeText(key)
		switch k {
		case "openapi", "swagger":
			doc.Version = unquote(p.nodeText(value))
			doc.ParsedVersion = VersionFromString(doc.Version)
			doc.DocType = DocTypeRoot
		case "info":
			doc.Info = p.parseInfo(value)
		case "servers":
			doc.Servers = p.parseServers(value)
		case "paths":
			doc.Paths = p.parsePaths(value)
		case "components":
			doc.Components = p.parseComponents(value)
		case "security":
			doc.Security = p.parseSecurityRequirements(value)
		case "tags":
			doc.Tags = p.parseTags(value)
		case "externalDocs":
			doc.ExternalDocs = p.parseExternalDocs(value)
		default:
			if strings.HasPrefix(k, "x-") {
				doc.Extensions[k] = &Node{Value: p.nodeText(value), RawNode: value, Loc: LocFromNode(value)}
			}
		}
	})

	if doc.ParsedVersion == VersionUnknown && doc.DocType != DocTypeRoot {
		doc.DocType = DocTypeUnknown
	}

	return doc
}

func (p *Parser) parseInfo(node *tree_sitter.Node) *Info {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	info := &Info{
		Extensions: make(map[string]*Node),
		Loc:        LocFromNode(node),
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		switch p.nodeText(key) {
		case "title":
			info.Title = unquote(p.nodeText(value))
			info.TitleLoc = LocFromNode(value)
		case "description":
			info.Description = p.parseDescription(value)
		case "termsOfService":
			info.TermsOfService = unquote(p.nodeText(value))
		case "version":
			info.Version = unquote(p.nodeText(value))
			info.VersionLoc = LocFromNode(value)
		case "contact":
			info.Contact = p.parseContact(value)
		case "license":
			info.License = p.parseLicense(value)
		default:
			k := p.nodeText(key)
			if strings.HasPrefix(k, "x-") {
				info.Extensions[k] = &Node{Value: p.nodeText(value), RawNode: value, Loc: LocFromNode(value)}
			}
		}
	})
	return info
}

func (p *Parser) parseContact(node *tree_sitter.Node) *Contact {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	c := &Contact{Loc: LocFromNode(node)}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		switch p.nodeText(key) {
		case "name":
			c.Name = unquote(p.nodeText(value))
		case "url":
			c.URL = unquote(p.nodeText(value))
		case "email":
			c.Email = unquote(p.nodeText(value))
		}
	})
	return c
}

func (p *Parser) parseLicense(node *tree_sitter.Node) *License {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	l := &License{Loc: LocFromNode(node)}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		switch p.nodeText(key) {
		case "name":
			l.Name = unquote(p.nodeText(value))
		case "identifier":
			l.Identifier = unquote(p.nodeText(value))
		case "url":
			l.URL = unquote(p.nodeText(value))
		}
	})
	return l
}

func (p *Parser) parseServers(node *tree_sitter.Node) []Server {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	var servers []Server
	p.walkSequence(node, func(item *tree_sitter.Node) {
		s := p.parseServer(item)
		servers = append(servers, s)
	})
	return servers
}

func (p *Parser) parseServer(node *tree_sitter.Node) Server {
	node = p.unwrapValue(node)
	s := Server{Loc: LocFromNode(node)}
	if node == nil {
		return s
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		switch p.nodeText(key) {
		case "url":
			s.URL = unquote(p.nodeText(value))
			s.URLLoc = LocFromNode(value)
		case "description":
			s.Description = p.parseDescription(value)
		case "variables":
			s.Variables = p.parseServerVariables(value)
		}
	})
	return s
}

func (p *Parser) parseServerVariables(node *tree_sitter.Node) map[string]*ServerVariable {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	vars := make(map[string]*ServerVariable)
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		name := unquote(p.nodeText(key))
		sv := &ServerVariable{Loc: LocFromNode(value)}
		value = p.unwrapValue(value)
		if value != nil {
			p.walkMapping(value, func(k, v *tree_sitter.Node) {
				switch p.nodeText(k) {
				case "default":
					sv.Default = unquote(p.nodeText(v))
				case "description":
					sv.Description = p.parseDescription(v)
				case "enum":
					p.walkSequence(v, func(item *tree_sitter.Node) {
						sv.Enum = append(sv.Enum, unquote(p.nodeText(item)))
					})
				}
			})
		}
		vars[name] = sv
	})
	return vars
}

func (p *Parser) parsePaths(node *tree_sitter.Node) map[string]*PathItem {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	paths := make(map[string]*PathItem)
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		path := unquote(p.nodeText(key))
		item := p.parsePathItem(value)
		item.PathLoc = LocFromNode(key)
		paths[path] = item
	})
	return paths
}

func (p *Parser) parsePathItem(node *tree_sitter.Node) *PathItem {
	node = p.unwrapValue(node)
	item := &PathItem{
		Extensions: make(map[string]*Node),
		Loc:        LocFromNode(node),
	}
	if node == nil {
		return item
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		k := p.nodeText(key)
		switch k {
		case "summary":
			item.Summary = unquote(p.nodeText(value))
		case "description":
			item.Description = p.parseDescription(value)
		case "get":
			item.Get = p.parseOperation(value, "get")
		case "put":
			item.Put = p.parseOperation(value, "put")
		case "post":
			item.Post = p.parseOperation(value, "post")
		case "delete":
			item.Delete = p.parseOperation(value, "delete")
		case "options":
			item.Options = p.parseOperation(value, "options")
		case "head":
			item.Head = p.parseOperation(value, "head")
		case "patch":
			item.Patch = p.parseOperation(value, "patch")
		case "trace":
			item.Trace = p.parseOperation(value, "trace")
		case "parameters":
			item.Parameters = p.parseParameters(value)
		case "$ref":
			item.Ref = unquote(p.nodeText(value))
		default:
			if strings.HasPrefix(k, "x-") {
				item.Extensions[k] = &Node{Value: p.nodeText(value), RawNode: value, Loc: LocFromNode(value)}
			}
		}
	})
	return item
}

func (p *Parser) parseOperation(node *tree_sitter.Node, method string) *Operation {
	node = p.unwrapValue(node)
	op := &Operation{
		Responses:  make(map[string]*Response),
		Extensions: make(map[string]*Node),
		Loc:        LocFromNode(node),
	}
	if node == nil {
		return op
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		k := p.nodeText(key)
		switch k {
		case "operationId":
			op.OperationID = unquote(p.nodeText(value))
			op.OperationIDLoc = LocFromNode(value)
		case "summary":
			op.Summary = unquote(p.nodeText(value))
		case "description":
			op.Description = p.parseDescription(value)
		case "tags":
			op.TagsLoc = LocFromNode(value)
			p.walkSequence(value, func(item *tree_sitter.Node) {
				op.Tags = append(op.Tags, TagUsage{
					Name: unquote(p.nodeText(item)),
					Loc:  LocFromNode(item),
				})
			})
		case "parameters":
			op.Parameters = p.parseParameters(value)
		case "requestBody":
			op.RequestBody = p.parseRequestBody(value)
		case "responses":
			op.Responses = p.parseResponses(value)
		case "security":
			op.Security = p.parseSecurityRequirements(value)
		case "deprecated":
			op.Deprecated = p.nodeText(value) == "true"
		case "externalDocs":
			op.ExternalDocs = p.parseExternalDocs(value)
		default:
			if strings.HasPrefix(k, "x-") {
				op.Extensions[k] = &Node{Value: p.nodeText(value), RawNode: value, Loc: LocFromNode(value)}
			}
		}
	})
	return op
}

func (p *Parser) parseParameters(node *tree_sitter.Node) []*Parameter {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	var params []*Parameter
	p.walkSequence(node, func(item *tree_sitter.Node) {
		params = append(params, p.parseParameter(item))
	})
	return params
}

func (p *Parser) parseParameter(node *tree_sitter.Node) *Parameter {
	node = p.unwrapValue(node)
	param := &Parameter{
		Extensions: make(map[string]*Node),
		Loc:        LocFromNode(node),
	}
	if node == nil {
		return param
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		k := p.nodeText(key)
		switch k {
		case "name":
			param.Name = unquote(p.nodeText(value))
			param.NameLoc = LocFromNode(value)
		case "in":
			param.In = unquote(p.nodeText(value))
		case "description":
			param.Description = p.parseDescription(value)
		case "required":
			param.Required = p.nodeText(value) == "true"
		case "deprecated":
			param.Deprecated = p.nodeText(value) == "true"
		case "allowEmptyValue":
			param.AllowEmptyValue = p.nodeText(value) == "true"
		case "schema":
			param.Schema = p.parseSchema(value, "")
		case "example":
			param.Example = &Node{Value: p.nodeText(value), RawNode: value, Loc: LocFromNode(value)}
		case "$ref":
			param.Ref = unquote(p.nodeText(value))
		default:
			if strings.HasPrefix(k, "x-") {
				param.Extensions[k] = &Node{Value: p.nodeText(value), RawNode: value, Loc: LocFromNode(value)}
			}
		}
	})
	return param
}

func (p *Parser) parseRequestBody(node *tree_sitter.Node) *RequestBody {
	node = p.unwrapValue(node)
	rb := &RequestBody{Loc: LocFromNode(node)}
	if node == nil {
		return rb
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		switch p.nodeText(key) {
		case "description":
			rb.Description = p.parseDescription(value)
		case "content":
			rb.Content = p.parseContent(value)
		case "required":
			rb.Required = p.nodeText(value) == "true"
		case "$ref":
			rb.Ref = unquote(p.nodeText(value))
		}
	})
	return rb
}

func (p *Parser) parseContent(node *tree_sitter.Node) map[string]*MediaType {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	content := make(map[string]*MediaType)
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		mt := &MediaType{Loc: LocFromNode(value)}
		value = p.unwrapValue(value)
		if value != nil {
			p.walkMapping(value, func(k, v *tree_sitter.Node) {
				switch p.nodeText(k) {
				case "schema":
					mt.Schema = p.parseSchema(v, "")
				case "example":
					mt.Example = &Node{Value: p.nodeText(v), RawNode: v, Loc: LocFromNode(v)}
				}
			})
		}
		content[unquote(p.nodeText(key))] = mt
	})
	return content
}

func (p *Parser) parseResponses(node *tree_sitter.Node) map[string]*Response {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	responses := make(map[string]*Response)
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		code := unquote(p.nodeText(key))
		resp := p.parseResponse(value)
		responses[code] = resp
	})
	return responses
}

func (p *Parser) parseResponse(node *tree_sitter.Node) *Response {
	node = p.unwrapValue(node)
	resp := &Response{
		Extensions: make(map[string]*Node),
		Loc:        LocFromNode(node),
	}
	if node == nil {
		return resp
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		k := p.nodeText(key)
		switch k {
		case "description":
			resp.Description = p.parseDescription(value)
		case "content":
			resp.Content = p.parseContent(value)
		case "headers":
			resp.Headers = p.parseHeaders(value)
		case "$ref":
			resp.Ref = unquote(p.nodeText(value))
		default:
			if strings.HasPrefix(k, "x-") {
				resp.Extensions[k] = &Node{Value: p.nodeText(value), RawNode: value, Loc: LocFromNode(value)}
			}
		}
	})
	return resp
}

func (p *Parser) parseHeaders(node *tree_sitter.Node) map[string]*Header {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	headers := make(map[string]*Header)
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		h := &Header{Loc: LocFromNode(value)}
		value = p.unwrapValue(value)
		if value != nil {
			p.walkMapping(value, func(k, v *tree_sitter.Node) {
				switch p.nodeText(k) {
				case "description":
					h.Description = p.parseDescription(v)
				case "required":
					h.Required = p.nodeText(v) == "true"
				case "schema":
					h.Schema = p.parseSchema(v, "")
				case "$ref":
					h.Ref = unquote(p.nodeText(v))
				}
			})
		}
		headers[unquote(p.nodeText(key))] = h
	})
	return headers
}

func (p *Parser) parseSchema(node *tree_sitter.Node, name string) *Schema {
	node = p.unwrapValue(node)
	s := &Schema{
		Properties: make(map[string]*Schema),
		Extensions: make(map[string]*Node),
		Loc:        LocFromNode(node),
	}
	if node == nil {
		return s
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		k := p.nodeText(key)
		switch k {
		case "type":
			s.Type = unquote(p.nodeText(value))
			s.TypeLoc = LocFromNode(value)
		case "format":
			s.Format = unquote(p.nodeText(value))
		case "title":
			s.Title = unquote(p.nodeText(value))
		case "description":
			s.Description = p.parseDescription(value)
		case "default":
			s.Default = &Node{Value: p.nodeText(value), RawNode: value, Loc: LocFromNode(value)}
		case "enum":
			p.walkSequence(value, func(item *tree_sitter.Node) {
				s.Enum = append(s.Enum, unquote(p.nodeText(item)))
			})
		case "required":
			p.walkSequence(value, func(item *tree_sitter.Node) {
				s.Required = append(s.Required, unquote(p.nodeText(item)))
			})
		case "properties":
			s.Properties = p.parseSchemaMap(value)
		case "additionalProperties":
			t := p.nodeText(value)
			if t != "true" && t != "false" {
				s.AdditionalProperties = p.parseSchema(value, "")
			}
		case "allOf":
			s.AllOf = p.parseSchemaList(value)
		case "anyOf":
			s.AnyOf = p.parseSchemaList(value)
		case "oneOf":
			s.OneOf = p.parseSchemaList(value)
		case "not":
			s.Not = p.parseSchema(value, "")
		case "items":
			s.Items = p.parseSchema(value, "")
		case "minLength":
			if v := parseInt(p.nodeText(value)); v >= 0 {
				s.MinLength = &v
			}
		case "maxLength":
			if v := parseInt(p.nodeText(value)); v >= 0 {
				s.MaxLength = &v
			}
		case "minimum":
			if v := parseFloat(p.nodeText(value)); v != nil {
				s.Minimum = v
			}
		case "maximum":
			if v := parseFloat(p.nodeText(value)); v != nil {
				s.Maximum = v
			}
		case "minItems":
			if v := parseInt(p.nodeText(value)); v >= 0 {
				s.MinItems = &v
			}
		case "maxItems":
			if v := parseInt(p.nodeText(value)); v >= 0 {
				s.MaxItems = &v
			}
		case "pattern":
			s.Pattern = unquote(p.nodeText(value))
		case "nullable":
			s.Nullable = p.nodeText(value) == "true"
		case "readOnly":
			s.ReadOnly = p.nodeText(value) == "true"
		case "writeOnly":
			s.WriteOnly = p.nodeText(value) == "true"
		case "deprecated":
			s.Deprecated = p.nodeText(value) == "true"
		case "example":
			s.Example = &Node{Value: p.nodeText(value), RawNode: value, Loc: LocFromNode(value)}
		case "externalDocs":
			s.ExternalDocs = p.parseExternalDocs(value)
		case "discriminator":
			s.Discriminator = p.parseDiscriminator(value)
		case "$ref":
			s.Ref = unquote(p.nodeText(value))
		default:
			if strings.HasPrefix(k, "x-") {
				s.Extensions[k] = &Node{Value: p.nodeText(value), RawNode: value, Loc: LocFromNode(value)}
			}
		}
	})
	return s
}

func (p *Parser) parseSchemaMap(node *tree_sitter.Node) map[string]*Schema {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	schemas := make(map[string]*Schema)
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		name := unquote(p.nodeText(key))
		s := p.parseSchema(value, name)
		s.NameLoc = LocFromNode(key)
		schemas[name] = s
	})
	return schemas
}

func (p *Parser) parseSchemaList(node *tree_sitter.Node) []*Schema {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	var schemas []*Schema
	p.walkSequence(node, func(item *tree_sitter.Node) {
		schemas = append(schemas, p.parseSchema(item, ""))
	})
	return schemas
}

func (p *Parser) parseDiscriminator(node *tree_sitter.Node) *Discriminator {
	node = p.unwrapValue(node)
	d := &Discriminator{Loc: LocFromNode(node)}
	if node == nil {
		return d
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		switch p.nodeText(key) {
		case "propertyName":
			d.PropertyName = unquote(p.nodeText(value))
		case "mapping":
			d.Mapping = make(map[string]string)
			p.walkMapping(p.unwrapValue(value), func(k, v *tree_sitter.Node) {
				d.Mapping[unquote(p.nodeText(k))] = unquote(p.nodeText(v))
			})
		}
	})
	return d
}

func (p *Parser) parseComponents(node *tree_sitter.Node) *Components {
	node = p.unwrapValue(node)
	c := &Components{
		Schemas:         make(map[string]*Schema),
		Responses:       make(map[string]*Response),
		Parameters:      make(map[string]*Parameter),
		Examples:        make(map[string]*Example),
		RequestBodies:   make(map[string]*RequestBody),
		Headers:         make(map[string]*Header),
		SecuritySchemes: make(map[string]*SecurityScheme),
		Links:           make(map[string]*Link),
		PathItems:       make(map[string]*PathItem),
		Loc:             LocFromNode(node),
	}
	if node == nil {
		return c
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		switch p.nodeText(key) {
		case "schemas":
			value = p.unwrapValue(value)
			if value != nil {
				p.walkMapping(value, func(k, v *tree_sitter.Node) {
					name := unquote(p.nodeText(k))
					s := p.parseSchema(v, name)
					s.NameLoc = LocFromNode(k)
					c.Schemas[name] = s
				})
			}
		case "responses":
			value = p.unwrapValue(value)
			if value != nil {
				p.walkMapping(value, func(k, v *tree_sitter.Node) {
					c.Responses[unquote(p.nodeText(k))] = p.parseResponse(v)
				})
			}
		case "parameters":
			value = p.unwrapValue(value)
			if value != nil {
				p.walkMapping(value, func(k, v *tree_sitter.Node) {
					c.Parameters[unquote(p.nodeText(k))] = p.parseParameter(v)
				})
			}
		case "examples":
			value = p.unwrapValue(value)
			if value != nil {
				p.walkMapping(value, func(k, v *tree_sitter.Node) {
					c.Examples[unquote(p.nodeText(k))] = p.parseExample(v)
				})
			}
		case "requestBodies":
			value = p.unwrapValue(value)
			if value != nil {
				p.walkMapping(value, func(k, v *tree_sitter.Node) {
					c.RequestBodies[unquote(p.nodeText(k))] = p.parseRequestBody(v)
				})
			}
		case "headers":
			c.Headers = p.parseHeaders(value)
		case "securitySchemes":
			value = p.unwrapValue(value)
			if value != nil {
				p.walkMapping(value, func(k, v *tree_sitter.Node) {
					c.SecuritySchemes[unquote(p.nodeText(k))] = p.parseSecurityScheme(v)
				})
			}
		case "links":
			value = p.unwrapValue(value)
			if value != nil {
				p.walkMapping(value, func(k, v *tree_sitter.Node) {
					c.Links[unquote(p.nodeText(k))] = p.parseLink(v)
				})
			}
		case "pathItems":
			value = p.unwrapValue(value)
			if value != nil {
				p.walkMapping(value, func(k, v *tree_sitter.Node) {
					c.PathItems[unquote(p.nodeText(k))] = p.parsePathItem(v)
				})
			}
		}
	})
	return c
}

func (p *Parser) parseSecurityScheme(node *tree_sitter.Node) *SecurityScheme {
	node = p.unwrapValue(node)
	ss := &SecurityScheme{
		Extensions: make(map[string]*Node),
		Loc:        LocFromNode(node),
	}
	if node == nil {
		return ss
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		k := p.nodeText(key)
		switch k {
		case "type":
			ss.Type = unquote(p.nodeText(value))
		case "description":
			ss.Description = p.parseDescription(value)
		case "name":
			ss.Name = unquote(p.nodeText(value))
		case "in":
			ss.In = unquote(p.nodeText(value))
		case "scheme":
			ss.Scheme = unquote(p.nodeText(value))
		case "bearerFormat":
			ss.BearerFormat = unquote(p.nodeText(value))
		case "flows":
			ss.Flows = p.parseOAuthFlows(value)
		case "openIdConnectUrl":
			ss.OpenIDConnectURL = unquote(p.nodeText(value))
		case "$ref":
			ss.Ref = unquote(p.nodeText(value))
		default:
			if strings.HasPrefix(k, "x-") {
				ss.Extensions[k] = &Node{Value: p.nodeText(value), RawNode: value, Loc: LocFromNode(value)}
			}
		}
	})
	return ss
}

func (p *Parser) parseOAuthFlows(node *tree_sitter.Node) *OAuthFlows {
	node = p.unwrapValue(node)
	flows := &OAuthFlows{Loc: LocFromNode(node)}
	if node == nil {
		return flows
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		switch p.nodeText(key) {
		case "implicit":
			flows.Implicit = p.parseOAuthFlow(value)
		case "password":
			flows.Password = p.parseOAuthFlow(value)
		case "clientCredentials":
			flows.ClientCredentials = p.parseOAuthFlow(value)
		case "authorizationCode":
			flows.AuthorizationCode = p.parseOAuthFlow(value)
		}
	})
	return flows
}

func (p *Parser) parseOAuthFlow(node *tree_sitter.Node) *OAuthFlow {
	node = p.unwrapValue(node)
	f := &OAuthFlow{Loc: LocFromNode(node)}
	if node == nil {
		return f
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		switch p.nodeText(key) {
		case "authorizationUrl":
			f.AuthorizationURL = unquote(p.nodeText(value))
			f.AuthorizationURLLoc = LocFromNode(value)
		case "tokenUrl":
			f.TokenURL = unquote(p.nodeText(value))
			f.TokenURLLoc = LocFromNode(value)
		case "refreshUrl":
			f.RefreshURL = unquote(p.nodeText(value))
		case "scopes":
			f.Scopes = make(map[string]string)
			p.walkMapping(p.unwrapValue(value), func(k, v *tree_sitter.Node) {
				f.Scopes[unquote(p.nodeText(k))] = unquote(p.nodeText(v))
			})
		}
	})
	return f
}

func (p *Parser) parseSecurityRequirements(node *tree_sitter.Node) []SecurityRequirement {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	var reqs []SecurityRequirement
	p.walkSequence(node, func(item *tree_sitter.Node) {
		req := SecurityRequirement{Loc: LocFromNode(item)}
		inner := p.unwrapValue(item)
		if inner != nil {
			p.walkMapping(inner, func(key, value *tree_sitter.Node) {
				name := unquote(p.nodeText(key))
				var scopes []string
				p.walkSequence(p.unwrapValue(value), func(s *tree_sitter.Node) {
					scopes = append(scopes, unquote(p.nodeText(s)))
				})
				req.Entries = append(req.Entries, SecurityRequirementEntry{
					Name:    name,
					Scopes:  scopes,
					NameLoc: LocFromNode(key),
				})
			})
		}
		reqs = append(reqs, req)
	})
	return reqs
}

func (p *Parser) parseTags(node *tree_sitter.Node) []Tag {
	node = p.unwrapValue(node)
	if node == nil {
		return nil
	}
	var tags []Tag
	p.walkSequence(node, func(item *tree_sitter.Node) {
		t := Tag{Loc: LocFromNode(item)}
		item = p.unwrapValue(item)
		if item != nil {
			p.walkMapping(item, func(key, value *tree_sitter.Node) {
				switch p.nodeText(key) {
				case "name":
					t.Name = unquote(p.nodeText(value))
					t.NameLoc = LocFromNode(value)
				case "description":
					t.Description = p.parseDescription(value)
				case "externalDocs":
					t.ExternalDocs = p.parseExternalDocs(value)
				}
			})
		}
		tags = append(tags, t)
	})
	return tags
}

func (p *Parser) parseExternalDocs(node *tree_sitter.Node) *ExternalDocs {
	node = p.unwrapValue(node)
	ed := &ExternalDocs{Loc: LocFromNode(node)}
	if node == nil {
		return ed
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		switch p.nodeText(key) {
		case "description":
			ed.Description = p.parseDescription(value)
		case "url":
			ed.URL = unquote(p.nodeText(value))
		}
	})
	return ed
}

func (p *Parser) parseExample(node *tree_sitter.Node) *Example {
	node = p.unwrapValue(node)
	ex := &Example{Loc: LocFromNode(node)}
	if node == nil {
		return ex
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		switch p.nodeText(key) {
		case "summary":
			ex.Summary = unquote(p.nodeText(value))
		case "description":
			ex.Description = p.parseDescription(value)
		case "value":
			ex.Value = &Node{Value: p.nodeText(value), RawNode: value, Loc: LocFromNode(value)}
		case "externalValue":
			ex.ExternalValue = unquote(p.nodeText(value))
		case "$ref":
			ex.Ref = unquote(p.nodeText(value))
		}
	})
	return ex
}

func (p *Parser) parseLink(node *tree_sitter.Node) *Link {
	node = p.unwrapValue(node)
	l := &Link{Loc: LocFromNode(node)}
	if node == nil {
		return l
	}
	p.walkMapping(node, func(key, value *tree_sitter.Node) {
		switch p.nodeText(key) {
		case "operationRef":
			l.OperationRef = unquote(p.nodeText(value))
		case "operationId":
			l.OperationID = unquote(p.nodeText(value))
		case "description":
			l.Description = p.parseDescription(value)
		case "$ref":
			l.Ref = unquote(p.nodeText(value))
		}
	})
	return l
}

// walkMapping iterates over key-value pairs in a mapping node (YAML or JSON).
func (p *Parser) walkMapping(node *tree_sitter.Node, fn func(key, value *tree_sitter.Node)) {
	if node == nil {
		return
	}

	kind := node.Kind()
	switch {
	case p.format == FormatYAML && (kind == "block_mapping" || kind == "flow_mapping"):
		for i := uint(0); i < node.ChildCount(); i++ {
			child := node.Child(i)
			if child == nil {
				continue
			}
			ck := child.Kind()
			if ck == "block_mapping_pair" || ck == "flow_pair" {
				keyNode := child.ChildByFieldName("key")
				valueNode := child.ChildByFieldName("value")
				if keyNode != nil {
					fn(keyNode, valueNode)
				}
			}
		}

	case p.format == FormatJSON && kind == "object":
		for i := uint(0); i < node.ChildCount(); i++ {
			child := node.Child(i)
			if child == nil || child.Kind() != "pair" {
				continue
			}
			keyNode := child.ChildByFieldName("key")
			valueNode := child.ChildByFieldName("value")
			if keyNode != nil {
				fn(keyNode, valueNode)
			}
		}

	default:
		// Try to find a mapping within this node (e.g., block_node wrapping block_mapping)
		for i := uint(0); i < node.ChildCount(); i++ {
			child := node.Child(i)
			if child == nil {
				continue
			}
			ck := child.Kind()
			if ck == "block_mapping" || ck == "flow_mapping" || ck == "object" {
				p.walkMapping(child, fn)
				return
			}
		}
	}
}

// walkSequence iterates over items in a sequence node (YAML or JSON).
func (p *Parser) walkSequence(node *tree_sitter.Node, fn func(item *tree_sitter.Node)) {
	if node == nil {
		return
	}

	kind := node.Kind()
	switch {
	case p.format == FormatYAML && (kind == "block_sequence" || kind == "flow_sequence"):
		for i := uint(0); i < node.ChildCount(); i++ {
			child := node.Child(i)
			if child == nil {
				continue
			}
			if child.Kind() == "block_sequence_item" {
				for j := uint(0); j < child.ChildCount(); j++ {
					inner := child.Child(j)
					if inner != nil && inner.Kind() != "-" {
						fn(inner)
						break
					}
				}
			} else if child.IsNamed() {
				fn(child)
			}
		}

	case p.format == FormatJSON && kind == "array":
		for i := uint(0); i < node.ChildCount(); i++ {
			child := node.Child(i)
			if child != nil && child.IsNamed() {
				fn(child)
			}
		}

	default:
		for i := uint(0); i < node.ChildCount(); i++ {
			child := node.Child(i)
			if child == nil {
				continue
			}
			ck := child.Kind()
			if ck == "block_sequence" || ck == "flow_sequence" || ck == "array" {
				p.walkSequence(child, fn)
				return
			}
		}
	}
}

// unwrapValue descends through YAML wrapper nodes (block_node, flow_node) to reach
// the actual content node.
func (p *Parser) unwrapValue(node *tree_sitter.Node) *tree_sitter.Node {
	if node == nil {
		return nil
	}
	for {
		kind := node.Kind()
		if kind == "block_node" || kind == "flow_node" || kind == "document" {
			if node.ChildCount() > 0 {
				child := node.Child(0)
				if child != nil {
					node = child
					continue
				}
			}
		}
		return node
	}
}

// findYAMLRoot locates the top-level block_mapping in a YAML document.
func (p *Parser) findYAMLRoot(root *tree_sitter.Node) *tree_sitter.Node {
	if root == nil {
		return nil
	}
	// stream -> document -> block_node -> block_mapping
	for i := uint(0); i < root.ChildCount(); i++ {
		child := root.Child(i)
		if child == nil {
			continue
		}
		if child.Kind() == "document" {
			return p.unwrapValue(child)
		}
	}
	return p.unwrapValue(root)
}

// findJSONRoot locates the top-level object in a JSON document.
func (p *Parser) findJSONRoot(root *tree_sitter.Node) *tree_sitter.Node {
	if root == nil {
		return nil
	}
	// document -> object
	for i := uint(0); i < root.ChildCount(); i++ {
		child := root.Child(i)
		if child != nil && child.Kind() == "object" {
			return child
		}
	}
	return nil
}

func (p *Parser) nodeText(node *tree_sitter.Node) string {
	return p.tree.NodeText(node)
}

// unquote removes surrounding quotes from YAML/JSON string values.
func unquote(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	return s
}

// parseDescription decodes a YAML description value node into a
// DescriptionValue with clean markdown content and source geometry.
func (p *Parser) parseDescription(node *tree_sitter.Node) DescriptionValue {
	if node == nil {
		return DescriptionValue{}
	}
	raw := p.nodeText(node)
	loc := LocFromNode(node)
	text, lineOffset, indentCols := decodeYAMLDescription(raw)
	return DescriptionValue{Text: text, Loc: loc, LineOffset: lineOffset, IndentCols: indentCols}
}

// decodeYAMLDescription decodes raw YAML scalar text into clean content
// and computes the source geometry for position translation.
func decodeYAMLDescription(raw string) (text string, lineOffset, indentCols int) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", 0, 0
	}
	if trimmed[0] == '|' || trimmed[0] == '>' {
		var s string
		if err := yaml.Unmarshal([]byte(raw), &s); err != nil {
			return unquote(raw), 0, 0
		}
		return s, 1, blockScalarIndent(raw)
	}
	return unquote(raw), 0, 0
}

// blockScalarIndent returns the number of leading whitespace columns on the
// first non-empty content line of a block scalar.
func blockScalarIndent(raw string) int {
	lines := strings.Split(raw, "\n")
	for _, line := range lines[1:] {
		stripped := strings.TrimLeft(line, " \t")
		if len(stripped) > 0 {
			return len(line) - len(stripped)
		}
	}
	return 0
}

func parseInt(s string) int {
	s = strings.TrimSpace(s)
	v, err := strconv.Atoi(s)
	if err != nil {
		return -1
	}
	return v
}

func parseFloat(s string) *float64 {
	s = strings.TrimSpace(s)
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nil
	}
	return &v
}
