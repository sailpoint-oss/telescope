package openapi

import (
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"gopkg.in/yaml.v3"
)

// ParseAndIndex parses raw YAML/JSON content into an OpenAPI Index without
// requiring tree-sitter. This is intended for plugin binaries that receive
// document content over RPC and need to build a typed model for rule evaluation.
// Location information comes from yaml.v3 node positions.
func ParseAndIndex(content []byte) *Index {
	var root yaml.Node
	if err := yaml.Unmarshal(content, &root); err != nil {
		return &Index{Document: &Document{DocType: DocTypeUnknown}}
	}

	if root.Kind != yaml.DocumentNode || len(root.Content) == 0 {
		return &Index{Document: &Document{DocType: DocTypeUnknown}}
	}

	mapping := root.Content[0]
	if mapping.Kind != yaml.MappingNode {
		return &Index{Document: &Document{DocType: DocTypeUnknown}}
	}

	p := &standaloneParser{root: mapping}
	doc := p.parseDocument()

	idx := &Index{
		Document:         doc,
		Operations:       make(map[string]*OperationRef),
		OperationsByPath: make(map[string][]OperationRef),
		Schemas:          make(map[string]*Schema),
		Parameters:       make(map[string]*Parameter),
		Responses:        make(map[string]*Response),
		SecuritySchemes:  make(map[string]*SecurityScheme),
		Refs:             make(map[string][]RefUsage),
		Tags:             make(map[string]*Tag),
	}

	// Index components
	if doc.Components != nil {
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

	// Index operations
	for pathStr, item := range doc.Paths {
		for _, mo := range item.Operations() {
			ref := OperationRef{Path: pathStr, Method: mo.Method, Operation: mo.Operation}
			idx.OperationsByPath[pathStr] = append(idx.OperationsByPath[pathStr], ref)
			if mo.Operation.OperationID != "" {
				idx.Operations[mo.Operation.OperationID] = &ref
			}
		}
	}

	// Index tags
	for i := range doc.Tags {
		idx.Tags[doc.Tags[i].Name] = &doc.Tags[i]
	}

	// Collect refs using yaml.v3 AST traversal so project-mode indexing
	// matches parser semantics and captures stable locations.
	collectRefsFromYAMLNode(idx, mapping, nil)

	idx.Version = doc.ParsedVersion

	return idx
}

func collectRefsFromYAMLNode(idx *Index, node *yaml.Node, path []string) {
	if node == nil {
		return
	}

	switch node.Kind {
	case yaml.DocumentNode:
		if len(node.Content) > 0 {
			collectRefsFromYAMLNode(idx, node.Content[0], path)
		}
	case yaml.MappingNode:
		for i := 0; i+1 < len(node.Content); i += 2 {
			keyNode := node.Content[i]
			valueNode := node.Content[i+1]
			keyText := yamlStr(keyNode)
			if keyText == "$ref" && valueNode != nil && valueNode.Kind == yaml.ScalarNode {
				target := yamlStr(valueNode)
				usage := RefUsage{
					Loc:    yamlLoc(valueNode),
					Target: target,
					From:   "/" + strings.Join(path, "/"),
				}
				idx.Refs[target] = append(idx.Refs[target], usage)
				idx.AllRefs = append(idx.AllRefs, usage)
				continue
			}

			childPath := append(path, escapeJSONPointer(keyText))
			collectRefsFromYAMLNode(idx, valueNode, childPath)
		}
	case yaml.SequenceNode:
		for i, child := range node.Content {
			childPath := append(path, strconv.Itoa(i))
			collectRefsFromYAMLNode(idx, child, childPath)
		}
	}
}

// standaloneParser builds the OpenAPI model from yaml.Node without tree-sitter.
type standaloneParser struct {
	root *yaml.Node
}

func yamlLoc(n *yaml.Node) Loc {
	if n == nil {
		return Loc{}
	}
	line := n.Line - 1
	col := n.Column - 1
	if line < 0 {
		line = 0
	}
	if col < 0 {
		col = 0
	}
	endCol := col
	if n.Kind == yaml.ScalarNode {
		endCol = col + utf16Len(n.Value)
	}
	return Loc{
		Range: ctypes.Range{
			Start: ctypes.Position{Line: uint32(line), Character: uint32(col)},    //nolint:gosec
			End:   ctypes.Position{Line: uint32(line), Character: uint32(endCol)}, //nolint:gosec
		},
	}
}

// utf16Len returns the number of UTF-16 code units needed to represent s.
func utf16Len(s string) int {
	n := 0
	for len(s) > 0 {
		r, size := utf8.DecodeRuneInString(s)
		s = s[size:]
		n += utf16.RuneLen(r)
	}
	return n
}

func yamlStr(n *yaml.Node) string {
	if n != nil && n.Kind == yaml.ScalarNode {
		return n.Value
	}
	return ""
}

func yamlMapGet(n *yaml.Node, key string) *yaml.Node {
	if n == nil || n.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(n.Content); i += 2 {
		if n.Content[i].Value == key {
			return n.Content[i+1]
		}
	}
	return nil
}

func yamlMapKeyNode(n *yaml.Node, key string) *yaml.Node {
	if n == nil || n.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(n.Content); i += 2 {
		if n.Content[i].Value == key {
			return n.Content[i]
		}
	}
	return nil
}

func yamlDescription(n *yaml.Node) DescriptionValue {
	if n == nil {
		return DescriptionValue{}
	}
	val := yamlMapGet(n, "description")
	if val == nil {
		return DescriptionValue{}
	}
	return DescriptionValue{
		Text: yamlStr(val),
		Loc:  yamlLoc(val),
	}
}

func yamlExtensions(n *yaml.Node) map[string]*Node {
	if n == nil || n.Kind != yaml.MappingNode {
		return nil
	}
	var exts map[string]*Node
	for i := 0; i+1 < len(n.Content); i += 2 {
		key := n.Content[i].Value
		if strings.HasPrefix(key, "x-") {
			if exts == nil {
				exts = make(map[string]*Node)
			}
			exts[key] = yamlNodeToNode(n.Content[i+1])
		}
	}
	return exts
}

func yamlNodeToNode(n *yaml.Node) *Node {
	if n == nil {
		return nil
	}
	node := &Node{Loc: yamlLoc(n)}
	if n.Kind == yaml.ScalarNode {
		node.Value = n.Value
	}
	return node
}

func yamlStringSlice(n *yaml.Node) []string {
	if n == nil || n.Kind != yaml.SequenceNode {
		return nil
	}
	out := make([]string, 0, len(n.Content))
	for _, c := range n.Content {
		if c.Kind == yaml.ScalarNode {
			out = append(out, c.Value)
		}
	}
	return out
}

func (p *standaloneParser) parseDocument() *Document {
	doc := &Document{
		Paths:      make(map[string]*PathItem),
		Extensions: make(map[string]*Node),
		Loc:        yamlLoc(p.root),
	}

	doc.Version = yamlStr(yamlMapGet(p.root, "openapi"))
	if doc.Version == "" {
		doc.Version = yamlStr(yamlMapGet(p.root, "swagger"))
	}
	doc.ParsedVersion = VersionFromString(doc.Version)
	if doc.Version != "" {
		doc.DocType = DocTypeRoot
	}
	doc.Extensions = yamlExtensions(p.root)

	if info := yamlMapGet(p.root, "info"); info != nil {
		doc.Info = p.parseInfo(info)
	}

	if servers := yamlMapGet(p.root, "servers"); servers != nil {
		doc.Servers = p.parseServers(servers)
	}

	if paths := yamlMapGet(p.root, "paths"); paths != nil {
		p.parsePaths(paths, doc)
	}

	if tags := yamlMapGet(p.root, "tags"); tags != nil && tags.Kind == yaml.SequenceNode {
		doc.Tags = p.parseTags(tags)
	}

	if components := yamlMapGet(p.root, "components"); components != nil {
		doc.Components = p.parseComponents(components)
	}

	if extDocs := yamlMapGet(p.root, "externalDocs"); extDocs != nil {
		doc.ExternalDocs = p.parseExternalDocs(extDocs)
	}

	if security := yamlMapGet(p.root, "security"); security != nil {
		doc.Security = p.parseSecurity(security)
	}

	return doc
}

func (p *standaloneParser) parseInfo(n *yaml.Node) *Info {
	info := &Info{
		Title:          yamlStr(yamlMapGet(n, "title")),
		Description:    yamlDescription(n),
		TermsOfService: yamlStr(yamlMapGet(n, "termsOfService")),
		Version:        yamlStr(yamlMapGet(n, "version")),
		Extensions:     yamlExtensions(n),
		Loc:            yamlLoc(n),
	}
	if titleNode := yamlMapKeyNode(n, "title"); titleNode != nil {
		info.TitleLoc = yamlLoc(yamlMapGet(n, "title"))
	}
	if verNode := yamlMapKeyNode(n, "version"); verNode != nil {
		info.VersionLoc = yamlLoc(yamlMapGet(n, "version"))
	}
	if contact := yamlMapGet(n, "contact"); contact != nil {
		info.Contact = &Contact{
			Name:  yamlStr(yamlMapGet(contact, "name")),
			URL:   yamlStr(yamlMapGet(contact, "url")),
			Email: yamlStr(yamlMapGet(contact, "email")),
			Loc:   yamlLoc(contact),
		}
	}
	if license := yamlMapGet(n, "license"); license != nil {
		info.License = &License{
			Name: yamlStr(yamlMapGet(license, "name")),
			URL:  yamlStr(yamlMapGet(license, "url")),
			Loc:  yamlLoc(license),
		}
	}
	return info
}

func (p *standaloneParser) parseServers(n *yaml.Node) []Server {
	if n.Kind != yaml.SequenceNode {
		return nil
	}
	servers := make([]Server, 0, len(n.Content))
	for _, s := range n.Content {
		srv := Server{
			URL:         yamlStr(yamlMapGet(s, "url")),
			Description: yamlDescription(s),
			Loc:         yamlLoc(s),
		}
		if urlNode := yamlMapGet(s, "url"); urlNode != nil {
			srv.URLLoc = yamlLoc(urlNode)
		}
		if vars := yamlMapGet(s, "variables"); vars != nil && vars.Kind == yaml.MappingNode {
			srv.Variables = make(map[string]*ServerVariable)
			for i := 0; i+1 < len(vars.Content); i += 2 {
				name := vars.Content[i].Value
				v := vars.Content[i+1]
				sv := &ServerVariable{
					Default:     yamlStr(yamlMapGet(v, "default")),
					Description: yamlDescription(v),
					Enum:        yamlStringSlice(yamlMapGet(v, "enum")),
					Loc:         yamlLoc(v),
				}
				srv.Variables[name] = sv
			}
		}
		servers = append(servers, srv)
	}
	return servers
}

func (p *standaloneParser) parsePaths(n *yaml.Node, doc *Document) {
	if n.Kind != yaml.MappingNode {
		return
	}
	for i := 0; i+1 < len(n.Content); i += 2 {
		pathStr := n.Content[i].Value
		pathNode := n.Content[i+1]
		item := p.parsePathItem(pathNode)
		item.Loc = yamlLoc(pathNode)
		item.PathLoc = yamlLoc(n.Content[i])
		doc.Paths[pathStr] = item
	}
}

func (p *standaloneParser) parsePathItem(n *yaml.Node) *PathItem {
	item := &PathItem{
		Description: yamlDescription(n),
		Extensions:  yamlExtensions(n),
	}

	if ref := yamlMapGet(n, "$ref"); ref != nil {
		item.Ref = yamlStr(ref)
	}

	methods := []string{"get", "put", "post", "delete", "options", "head", "patch", "trace"}
	for _, m := range methods {
		keyNode := yamlMapKeyNode(n, m)
		if opNode := yamlMapGet(n, m); opNode != nil {
			op := p.parseOperation(opNode)
			op.MethodLoc = yamlLoc(keyNode)
			switch m {
			case "get":
				item.Get = op
			case "put":
				item.Put = op
			case "post":
				item.Post = op
			case "delete":
				item.Delete = op
			case "options":
				item.Options = op
			case "head":
				item.Head = op
			case "patch":
				item.Patch = op
			case "trace":
				item.Trace = op
			}
		}
	}

	if params := yamlMapGet(n, "parameters"); params != nil {
		item.Parameters = p.parseParameters(params)
	}

	return item
}

func (p *standaloneParser) parseOperation(n *yaml.Node) *Operation {
	op := &Operation{
		Summary:     yamlStr(yamlMapGet(n, "summary")),
		Description: yamlDescription(n),
		OperationID: yamlStr(yamlMapGet(n, "operationId")),
		Deprecated:  yamlStr(yamlMapGet(n, "deprecated")) == "true",
		Extensions:  yamlExtensions(n),
		Loc:         yamlLoc(n),
		Responses:   make(map[string]*Response),
	}

	if tagsNode := yamlMapGet(n, "tags"); tagsNode != nil && tagsNode.Kind == yaml.SequenceNode {
		op.TagsLoc = yamlLoc(tagsNode)
		for _, t := range tagsNode.Content {
			if t.Kind == yaml.ScalarNode {
				op.Tags = append(op.Tags, TagUsage{Name: t.Value, Loc: yamlLoc(t)})
			}
		}
	}

	if opIdNode := yamlMapGet(n, "operationId"); opIdNode != nil {
		op.OperationIDLoc = yamlLoc(opIdNode)
	}

	if paramsKey := yamlMapKeyNode(n, "parameters"); paramsKey != nil {
		op.ParametersLoc = yamlLoc(paramsKey)
	}
	if params := yamlMapGet(n, "parameters"); params != nil {
		op.Parameters = p.parseParameters(params)
	}

	if rb := yamlMapGet(n, "requestBody"); rb != nil {
		op.RequestBody = p.parseRequestBody(rb)
	}

	if responsesKey := yamlMapKeyNode(n, "responses"); responsesKey != nil {
		op.ResponsesLoc = yamlLoc(responsesKey)
	}
	if responses := yamlMapGet(n, "responses"); responses != nil && responses.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(responses.Content); i += 2 {
			code := responses.Content[i].Value
			resp := p.parseResponse(responses.Content[i+1])
			resp.CodeLoc = yamlLoc(responses.Content[i])
			op.Responses[code] = resp
		}
	}

	if security := yamlMapGet(n, "security"); security != nil {
		op.Security = p.parseSecurity(security)
	}

	return op
}

func (p *standaloneParser) parseParameters(n *yaml.Node) []*Parameter {
	if n.Kind != yaml.SequenceNode {
		return nil
	}
	params := make([]*Parameter, 0, len(n.Content))
	for _, pn := range n.Content {
		param := &Parameter{
			Name:        yamlStr(yamlMapGet(pn, "name")),
			In:          yamlStr(yamlMapGet(pn, "in")),
			Description: yamlDescription(pn),
			Required:    yamlStr(yamlMapGet(pn, "required")) == "true",
			Deprecated:  yamlStr(yamlMapGet(pn, "deprecated")) == "true",
			Ref:         yamlStr(yamlMapGet(pn, "$ref")),
			Extensions:  yamlExtensions(pn),
			Loc:         yamlLoc(pn),
		}
		if nameNode := yamlMapGet(pn, "name"); nameNode != nil {
			param.NameLoc = yamlLoc(nameNode)
		}
		if schema := yamlMapGet(pn, "schema"); schema != nil {
			param.Schema = p.parseSchema(schema)
		}
		params = append(params, param)
	}
	return params
}

func (p *standaloneParser) parseRequestBody(n *yaml.Node) *RequestBody {
	rb := &RequestBody{
		Description: yamlDescription(n),
		Required:    yamlStr(yamlMapGet(n, "required")) == "true",
		Ref:         yamlStr(yamlMapGet(n, "$ref")),
		Loc:         yamlLoc(n),
		Content:     make(map[string]*MediaType),
	}

	if content := yamlMapGet(n, "content"); content != nil && content.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(content.Content); i += 2 {
			mt := content.Content[i].Value
			rb.Content[mt] = p.parseMediaType(content.Content[i+1])
		}
	}
	return rb
}

func (p *standaloneParser) parseResponse(n *yaml.Node) *Response {
	resp := &Response{
		Description: yamlDescription(n),
		Ref:         yamlStr(yamlMapGet(n, "$ref")),
		Extensions:  yamlExtensions(n),
		Loc:         yamlLoc(n),
		Content:     make(map[string]*MediaType),
		Headers:     make(map[string]*Header),
	}

	if content := yamlMapGet(n, "content"); content != nil && content.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(content.Content); i += 2 {
			mt := content.Content[i].Value
			resp.Content[mt] = p.parseMediaType(content.Content[i+1])
		}
	}

	if headers := yamlMapGet(n, "headers"); headers != nil && headers.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(headers.Content); i += 2 {
			name := headers.Content[i].Value
			resp.Headers[name] = p.parseHeader(headers.Content[i+1])
		}
	}

	return resp
}

func (p *standaloneParser) parseMediaType(n *yaml.Node) *MediaType {
	mt := &MediaType{
		Loc: yamlLoc(n),
	}
	if schema := yamlMapGet(n, "schema"); schema != nil {
		mt.Schema = p.parseSchema(schema)
	}
	return mt
}

func (p *standaloneParser) parseHeader(n *yaml.Node) *Header {
	h := &Header{
		Description: yamlDescription(n),
		Required:    yamlStr(yamlMapGet(n, "required")) == "true",
		Deprecated:  yamlStr(yamlMapGet(n, "deprecated")) == "true",
		Ref:         yamlStr(yamlMapGet(n, "$ref")),
		Loc:         yamlLoc(n),
	}
	if schema := yamlMapGet(n, "schema"); schema != nil {
		h.Schema = p.parseSchema(schema)
	}
	return h
}

func (p *standaloneParser) parseSchema(n *yaml.Node) *Schema {
	return p.parseSchemaDepth(n, 0)
}

func (p *standaloneParser) parseSchemaDepth(n *yaml.Node, depth int) *Schema {
	if n == nil {
		return nil
	}
	if depth > maxSchemaDepth {
		return nil
	}

	s := &Schema{
		Type:        yamlStr(yamlMapGet(n, "type")),
		Format:      yamlStr(yamlMapGet(n, "format")),
		Title:       yamlStr(yamlMapGet(n, "title")),
		Description: yamlDescription(n),
		Default:     yamlNodeToNode(yamlMapGet(n, "default")),
		Pattern:     yamlStr(yamlMapGet(n, "pattern")),
		Deprecated:  yamlStr(yamlMapGet(n, "deprecated")) == "true",
		ReadOnly:    yamlStr(yamlMapGet(n, "readOnly")) == "true",
		WriteOnly:   yamlStr(yamlMapGet(n, "writeOnly")) == "true",
		Nullable:    yamlStr(yamlMapGet(n, "nullable")) == "true",
		Ref:         yamlStr(yamlMapGet(n, "$ref")),
		Extensions:  yamlExtensions(n),
		Loc:         yamlLoc(n),
		Properties:  make(map[string]*Schema),
	}

	if typeNode := yamlMapGet(n, "type"); typeNode != nil {
		s.TypeLoc = yamlLoc(typeNode)
	}

	if props := yamlMapGet(n, "properties"); props != nil && props.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(props.Content); i += 2 {
			name := props.Content[i].Value
			s.Properties[name] = p.parseSchemaDepth(props.Content[i+1], depth+1)
		}
	}

	if items := yamlMapGet(n, "items"); items != nil {
		s.Items = p.parseSchemaDepth(items, depth+1)
	}

	if allOf := yamlMapGet(n, "allOf"); allOf != nil && allOf.Kind == yaml.SequenceNode {
		for _, c := range allOf.Content {
			s.AllOf = append(s.AllOf, p.parseSchemaDepth(c, depth+1))
		}
	}
	if anyOf := yamlMapGet(n, "anyOf"); anyOf != nil && anyOf.Kind == yaml.SequenceNode {
		for _, c := range anyOf.Content {
			s.AnyOf = append(s.AnyOf, p.parseSchemaDepth(c, depth+1))
		}
	}
	if oneOf := yamlMapGet(n, "oneOf"); oneOf != nil && oneOf.Kind == yaml.SequenceNode {
		for _, c := range oneOf.Content {
			s.OneOf = append(s.OneOf, p.parseSchemaDepth(c, depth+1))
		}
	}
	if not := yamlMapGet(n, "not"); not != nil {
		s.Not = p.parseSchemaDepth(not, depth+1)
	}
	if addl := yamlMapGet(n, "additionalProperties"); addl != nil {
		if addl.Kind == yaml.MappingNode {
			s.AdditionalProperties = p.parseSchemaDepth(addl, depth+1)
		}
	}

	if enum := yamlMapGet(n, "enum"); enum != nil && enum.Kind == yaml.SequenceNode {
		for _, c := range enum.Content {
			s.Enum = append(s.Enum, yamlStr(c))
		}
	}

	if req := yamlMapGet(n, "required"); req != nil && req.Kind == yaml.SequenceNode {
		s.Required = yamlStringSlice(req)
	}

	return s
}

func (p *standaloneParser) parseTags(n *yaml.Node) []Tag {
	if n.Kind != yaml.SequenceNode {
		return nil
	}
	tags := make([]Tag, 0, len(n.Content))
	for _, t := range n.Content {
		tag := Tag{
			Name:        yamlStr(yamlMapGet(t, "name")),
			Description: yamlDescription(t),
			Extensions:  yamlExtensions(t),
			Loc:         yamlLoc(t),
		}
		if nameNode := yamlMapGet(t, "name"); nameNode != nil {
			tag.NameLoc = yamlLoc(nameNode)
		}
		if ed := yamlMapGet(t, "externalDocs"); ed != nil {
			tag.ExternalDocs = p.parseExternalDocs(ed)
		}
		tags = append(tags, tag)
	}
	return tags
}

func (p *standaloneParser) parseExternalDocs(n *yaml.Node) *ExternalDocs {
	ed := &ExternalDocs{
		Description: yamlDescription(n),
		URL:         yamlStr(yamlMapGet(n, "url")),
		Loc:         yamlLoc(n),
	}
	if urlNode := yamlMapGet(n, "url"); urlNode != nil {
		ed.URLLoc = yamlLoc(urlNode)
	}
	return ed
}

func (p *standaloneParser) parseComponents(n *yaml.Node) *Components {
	comp := &Components{
		Schemas:         make(map[string]*Schema),
		Responses:       make(map[string]*Response),
		Parameters:      make(map[string]*Parameter),
		RequestBodies:   make(map[string]*RequestBody),
		Headers:         make(map[string]*Header),
		SecuritySchemes: make(map[string]*SecurityScheme),
		Examples:        make(map[string]*Example),
		Links:           make(map[string]*Link),
		Loc:             yamlLoc(n),
	}

	if schemas := yamlMapGet(n, "schemas"); schemas != nil && schemas.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(schemas.Content); i += 2 {
			name := schemas.Content[i].Value
			comp.Schemas[name] = p.parseSchema(schemas.Content[i+1])
		}
	}

	if responses := yamlMapGet(n, "responses"); responses != nil && responses.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(responses.Content); i += 2 {
			name := responses.Content[i].Value
			resp := p.parseResponse(responses.Content[i+1])
			resp.CodeLoc = yamlLoc(responses.Content[i])
			resp.NameLoc = yamlLoc(responses.Content[i])
			comp.Responses[name] = resp
		}
	}

	if params := yamlMapGet(n, "parameters"); params != nil && params.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(params.Content); i += 2 {
			name := params.Content[i].Value
			pNode := params.Content[i+1]
			param := &Parameter{
				Name:        yamlStr(yamlMapGet(pNode, "name")),
				In:          yamlStr(yamlMapGet(pNode, "in")),
				Description: yamlDescription(pNode),
				Required:    yamlStr(yamlMapGet(pNode, "required")) == "true",
				Ref:         yamlStr(yamlMapGet(pNode, "$ref")),
				Extensions:  yamlExtensions(pNode),
				Loc:         yamlLoc(pNode),
				NameLoc:     yamlLoc(params.Content[i]),
			}
			comp.Parameters[name] = param
		}
	}

	if rbs := yamlMapGet(n, "requestBodies"); rbs != nil && rbs.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(rbs.Content); i += 2 {
			name := rbs.Content[i].Value
			rb := p.parseRequestBody(rbs.Content[i+1])
			rb.NameLoc = yamlLoc(rbs.Content[i])
			comp.RequestBodies[name] = rb
		}
	}

	if headers := yamlMapGet(n, "headers"); headers != nil && headers.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(headers.Content); i += 2 {
			name := headers.Content[i].Value
			h := p.parseHeader(headers.Content[i+1])
			h.NameLoc = yamlLoc(headers.Content[i])
			comp.Headers[name] = h
		}
	}

	if ss := yamlMapGet(n, "securitySchemes"); ss != nil && ss.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(ss.Content); i += 2 {
			name := ss.Content[i].Value
			scheme := p.parseSecurityScheme(ss.Content[i+1])
			scheme.NameLoc = yamlLoc(ss.Content[i])
			comp.SecuritySchemes[name] = scheme
		}
	}

	if examples := yamlMapGet(n, "examples"); examples != nil && examples.Kind == yaml.MappingNode {
		for i := 0; i+1 < len(examples.Content); i += 2 {
			name := examples.Content[i].Value
			ex := p.parseExample(examples.Content[i+1])
			ex.NameLoc = yamlLoc(examples.Content[i])
			comp.Examples[name] = ex
		}
	}

	return comp
}

func (p *standaloneParser) parseSecurityScheme(n *yaml.Node) *SecurityScheme {
	ss := &SecurityScheme{
		Type:             yamlStr(yamlMapGet(n, "type")),
		Description:      yamlDescription(n),
		Name:             yamlStr(yamlMapGet(n, "name")),
		In:               yamlStr(yamlMapGet(n, "in")),
		Scheme:           yamlStr(yamlMapGet(n, "scheme")),
		BearerFormat:     yamlStr(yamlMapGet(n, "bearerFormat")),
		OpenIDConnectURL: yamlStr(yamlMapGet(n, "openIdConnectUrl")),
		Ref:              yamlStr(yamlMapGet(n, "$ref")),
		Extensions:       yamlExtensions(n),
		Loc:              yamlLoc(n),
	}
	if flows := yamlMapGet(n, "flows"); flows != nil {
		ss.Flows = p.parseOAuthFlows(flows)
	}
	return ss
}

func (p *standaloneParser) parseOAuthFlows(n *yaml.Node) *OAuthFlows {
	flows := &OAuthFlows{Loc: yamlLoc(n)}
	if implicit := yamlMapGet(n, "implicit"); implicit != nil {
		flows.Implicit = p.parseOAuthFlow(implicit)
	}
	if password := yamlMapGet(n, "password"); password != nil {
		flows.Password = p.parseOAuthFlow(password)
	}
	if cc := yamlMapGet(n, "clientCredentials"); cc != nil {
		flows.ClientCredentials = p.parseOAuthFlow(cc)
	}
	if ac := yamlMapGet(n, "authorizationCode"); ac != nil {
		flows.AuthorizationCode = p.parseOAuthFlow(ac)
	}
	return flows
}

func (p *standaloneParser) parseOAuthFlow(n *yaml.Node) *OAuthFlow {
	flow := &OAuthFlow{
		AuthorizationURL: yamlStr(yamlMapGet(n, "authorizationUrl")),
		TokenURL:         yamlStr(yamlMapGet(n, "tokenUrl")),
		RefreshURL:       yamlStr(yamlMapGet(n, "refreshUrl")),
		Loc:              yamlLoc(n),
	}
	if scopes := yamlMapGet(n, "scopes"); scopes != nil && scopes.Kind == yaml.MappingNode {
		flow.Scopes = make(map[string]string)
		for i := 0; i+1 < len(scopes.Content); i += 2 {
			flow.Scopes[scopes.Content[i].Value] = yamlStr(scopes.Content[i+1])
		}
	}
	return flow
}

func (p *standaloneParser) parseExample(n *yaml.Node) *Example {
	return &Example{
		Summary:     yamlStr(yamlMapGet(n, "summary")),
		Description: yamlDescription(n),
		Value:       yamlNodeToNode(yamlMapGet(n, "value")),
		Ref:         yamlStr(yamlMapGet(n, "$ref")),
		Loc:         yamlLoc(n),
	}
}

func (p *standaloneParser) parseSecurity(n *yaml.Node) []SecurityRequirement {
	if n.Kind != yaml.SequenceNode {
		return nil
	}
	reqs := make([]SecurityRequirement, 0, len(n.Content))
	for _, item := range n.Content {
		if item.Kind != yaml.MappingNode {
			continue
		}
		req := SecurityRequirement{Loc: yamlLoc(item)}
		for i := 0; i+1 < len(item.Content); i += 2 {
			entry := SecurityRequirementEntry{
				Name:    item.Content[i].Value,
				Scopes:  yamlStringSlice(item.Content[i+1]),
				NameLoc: yamlLoc(item.Content[i]),
			}
			req.Entries = append(req.Entries, entry)
		}
		reqs = append(reqs, req)
	}
	return reqs
}
