package script

import (
	"strconv"

	"github.com/dop251/goja"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// bridge connects the Go OpenAPI model to the goja JS runtime, exposing
// typed visitor methods and a diagnostic reporter.
type bridge struct {
	vm    *goja.Runtime
	idx   *openapi.Index
	diags []ScriptDiagnostic
}

func newBridge(vm *goja.Runtime, idx *openapi.Index) *bridge {
	return &bridge{vm: vm, idx: idx}
}

func (b *bridge) diagnostics() []ScriptDiagnostic {
	return b.diags
}

// buildContext creates the ctx object passed to check(ctx).
func (b *bridge) buildContext() goja.Value {
	ctx := b.vm.NewObject()
	ctx.Set("document", b.exposeDocument())
	ctx.Set("operations", b.operationsVisitor())
	ctx.Set("schemas", b.schemasVisitor())
	ctx.Set("recursiveSchemas", b.recursiveSchemasVisitor())
	ctx.Set("paths", b.pathsVisitor())
	ctx.Set("parameters", b.parametersVisitor())
	ctx.Set("tags", b.tagsVisitor())
	ctx.Set("servers", b.serversVisitor())
	ctx.Set("responses", b.responsesVisitor())
	ctx.Set("requestBodies", b.requestBodiesVisitor())
	ctx.Set("securitySchemes", b.securitySchemesVisitor())
	ctx.Set("report", b.reportFunc())
	return ctx
}

func (b *bridge) exposeDocument() goja.Value {
	doc := b.idx.Document
	if doc == nil {
		return goja.Undefined()
	}
	obj := b.vm.NewObject()
	obj.Set("version", doc.Version)
	obj.Set("docType", int(doc.DocType))
	if doc.Info != nil {
		obj.Set("info", b.exposeInfo(doc.Info))
	}
	obj.Set("security", b.exposeSecurityRequirements(doc.Security))
	obj.Set("loc", b.exposeLoc(doc.Loc))
	return obj
}

func (b *bridge) exposeInfo(info *openapi.Info) goja.Value {
	obj := b.vm.NewObject()
	obj.Set("title", info.Title)
	obj.Set("description", b.exposeDescription(info.Description))
	obj.Set("version", info.Version)
	obj.Set("termsOfService", info.TermsOfService)
	obj.Set("loc", b.exposeLoc(info.Loc))
	if info.Contact != nil {
		c := b.vm.NewObject()
		c.Set("name", info.Contact.Name)
		c.Set("url", info.Contact.URL)
		c.Set("email", info.Contact.Email)
		obj.Set("contact", c)
	}
	if info.License != nil {
		l := b.vm.NewObject()
		l.Set("name", info.License.Name)
		l.Set("url", info.License.URL)
		obj.Set("license", l)
	}
	return obj
}

func (b *bridge) exposeDescription(d openapi.DescriptionValue) goja.Value {
	obj := b.vm.NewObject()
	obj.Set("text", d.Text)
	obj.Set("loc", b.exposeLoc(d.Loc))
	return obj
}

func (b *bridge) exposeLoc(loc openapi.Loc) goja.Value {
	obj := b.vm.NewObject()
	obj.Set("startLine", loc.Range.Start.Line)
	obj.Set("startChar", loc.Range.Start.Character)
	obj.Set("endLine", loc.Range.End.Line)
	obj.Set("endChar", loc.Range.End.Character)
	return obj
}

func (b *bridge) exposeSecurityRequirements(reqs []openapi.SecurityRequirement) goja.Value {
	arr := b.vm.NewArray()
	for i, req := range reqs {
		obj := b.vm.NewObject()
		entries := b.vm.NewArray()
		for j, e := range req.Entries {
			entry := b.vm.NewObject()
			entry.Set("name", e.Name)
			entry.Set("scopes", b.stringSlice(e.Scopes))
			entries.Set(intStr(j), entry)
		}
		obj.Set("entries", entries)
		arr.Set(intStr(i), obj)
	}
	return arr
}

// --- Visitor functions ---

func (b *bridge) operationsVisitor() goja.Value {
	return b.vm.ToValue(func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 {
			return goja.Undefined()
		}
		fn, ok := goja.AssertFunction(call.Arguments[0])
		if !ok {
			return goja.Undefined()
		}
		doc := b.idx.Document
		if doc == nil {
			return goja.Undefined()
		}
		for pathStr, item := range doc.Paths {
			for _, mo := range item.Operations() {
				opObj := b.exposeOperation(mo.Operation)
				fn(goja.Undefined(), b.vm.ToValue(pathStr), b.vm.ToValue(mo.Method), opObj) //nolint:errcheck
			}
		}
		return goja.Undefined()
	})
}

func (b *bridge) schemasVisitor() goja.Value {
	return b.vm.ToValue(func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 {
			return goja.Undefined()
		}
		fn, ok := goja.AssertFunction(call.Arguments[0])
		if !ok {
			return goja.Undefined()
		}
		for name, schema := range b.idx.Schemas {
			sObj := b.exposeSchema(schema)
			fn(goja.Undefined(), b.vm.ToValue(name), sObj, b.vm.ToValue("#/components/schemas/"+name)) //nolint:errcheck
		}
		return goja.Undefined()
	})
}

func (b *bridge) recursiveSchemasVisitor() goja.Value {
	return b.vm.ToValue(func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 {
			return goja.Undefined()
		}
		fn, ok := goja.AssertFunction(call.Arguments[0])
		if !ok {
			return goja.Undefined()
		}
		for name, schema := range b.idx.Schemas {
			b.walkSchema(name, schema, "#/components/schemas/"+name, fn)
		}
		return goja.Undefined()
	})
}

func (b *bridge) walkSchema(name string, s *openapi.Schema, pointer string, fn goja.Callable) {
	if s == nil {
		return
	}
	fn(goja.Undefined(), b.vm.ToValue(name), b.exposeSchema(s), b.vm.ToValue(pointer)) //nolint:errcheck

	for pName, prop := range s.Properties {
		b.walkSchema(pName, prop, pointer+"/properties/"+pName, fn)
	}
	if s.Items != nil {
		b.walkSchema(name+".items", s.Items, pointer+"/items", fn)
	}
	for i, sub := range s.AllOf {
		b.walkSchema(name, sub, pointer+"/allOf/"+intStr(i), fn)
	}
	for i, sub := range s.AnyOf {
		b.walkSchema(name, sub, pointer+"/anyOf/"+intStr(i), fn)
	}
	for i, sub := range s.OneOf {
		b.walkSchema(name, sub, pointer+"/oneOf/"+intStr(i), fn)
	}
	if s.AdditionalProperties != nil {
		b.walkSchema(name, s.AdditionalProperties, pointer+"/additionalProperties", fn)
	}
}

func (b *bridge) pathsVisitor() goja.Value {
	return b.vm.ToValue(func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 {
			return goja.Undefined()
		}
		fn, ok := goja.AssertFunction(call.Arguments[0])
		if !ok {
			return goja.Undefined()
		}
		doc := b.idx.Document
		if doc == nil {
			return goja.Undefined()
		}
		for pathStr, item := range doc.Paths {
			fn(goja.Undefined(), b.vm.ToValue(pathStr), b.exposePathItem(item)) //nolint:errcheck
		}
		return goja.Undefined()
	})
}

func (b *bridge) parametersVisitor() goja.Value {
	return b.vm.ToValue(func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 {
			return goja.Undefined()
		}
		fn, ok := goja.AssertFunction(call.Arguments[0])
		if !ok {
			return goja.Undefined()
		}
		doc := b.idx.Document
		if doc == nil {
			return goja.Undefined()
		}
		for _, item := range doc.Paths {
			for _, p := range item.Parameters {
				fn(goja.Undefined(), b.exposeParameter(p)) //nolint:errcheck
			}
			for _, mo := range item.Operations() {
				for _, p := range mo.Operation.Parameters {
					fn(goja.Undefined(), b.exposeParameter(p)) //nolint:errcheck
				}
			}
		}
		return goja.Undefined()
	})
}

func (b *bridge) tagsVisitor() goja.Value {
	return b.vm.ToValue(func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 {
			return goja.Undefined()
		}
		fn, ok := goja.AssertFunction(call.Arguments[0])
		if !ok {
			return goja.Undefined()
		}
		doc := b.idx.Document
		if doc == nil {
			return goja.Undefined()
		}
		for i := range doc.Tags {
			fn(goja.Undefined(), b.exposeTag(&doc.Tags[i])) //nolint:errcheck
		}
		return goja.Undefined()
	})
}

func (b *bridge) serversVisitor() goja.Value {
	return b.vm.ToValue(func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 {
			return goja.Undefined()
		}
		fn, ok := goja.AssertFunction(call.Arguments[0])
		if !ok {
			return goja.Undefined()
		}
		doc := b.idx.Document
		if doc == nil {
			return goja.Undefined()
		}
		for i := range doc.Servers {
			fn(goja.Undefined(), b.exposeServer(&doc.Servers[i])) //nolint:errcheck
		}
		return goja.Undefined()
	})
}

func (b *bridge) responsesVisitor() goja.Value {
	return b.vm.ToValue(func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 {
			return goja.Undefined()
		}
		fn, ok := goja.AssertFunction(call.Arguments[0])
		if !ok {
			return goja.Undefined()
		}
		doc := b.idx.Document
		if doc == nil {
			return goja.Undefined()
		}
		for _, item := range doc.Paths {
			for _, mo := range item.Operations() {
				for code, resp := range mo.Operation.Responses {
					fn(goja.Undefined(), b.vm.ToValue(code), b.exposeResponse(resp)) //nolint:errcheck
				}
			}
		}
		return goja.Undefined()
	})
}

func (b *bridge) requestBodiesVisitor() goja.Value {
	return b.vm.ToValue(func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 {
			return goja.Undefined()
		}
		fn, ok := goja.AssertFunction(call.Arguments[0])
		if !ok {
			return goja.Undefined()
		}
		doc := b.idx.Document
		if doc == nil {
			return goja.Undefined()
		}
		for pathStr, item := range doc.Paths {
			for _, mo := range item.Operations() {
				if mo.Operation.RequestBody != nil {
					fn(goja.Undefined(), b.vm.ToValue(pathStr), b.vm.ToValue(mo.Method), b.exposeRequestBody(mo.Operation.RequestBody)) //nolint:errcheck
				}
			}
		}
		return goja.Undefined()
	})
}

func (b *bridge) securitySchemesVisitor() goja.Value {
	return b.vm.ToValue(func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) == 0 {
			return goja.Undefined()
		}
		fn, ok := goja.AssertFunction(call.Arguments[0])
		if !ok {
			return goja.Undefined()
		}
		for name, ss := range b.idx.SecuritySchemes {
			fn(goja.Undefined(), b.vm.ToValue(name), b.exposeSecurityScheme(ss)) //nolint:errcheck
		}
		return goja.Undefined()
	})
}

// --- Report function ---

func (b *bridge) reportFunc() goja.Value {
	return b.vm.ToValue(func(call goja.FunctionCall) goja.Value {
		if len(call.Arguments) < 2 {
			return goja.Undefined()
		}

		locObj := call.Arguments[0].ToObject(b.vm)
		msg := call.Arguments[1].String()

		d := ScriptDiagnostic{
			StartLine: getUint32(locObj, "startLine"),
			StartChar: getUint32(locObj, "startChar"),
			EndLine:   getUint32(locObj, "endLine"),
			EndChar:   getUint32(locObj, "endChar"),
			Message:   msg,
		}
		b.diags = append(b.diags, d)
		return goja.Undefined()
	})
}

// --- Model exposure helpers ---

func (b *bridge) exposeOperation(op *openapi.Operation) goja.Value {
	obj := b.vm.NewObject()
	obj.Set("operationId", op.OperationID)
	obj.Set("summary", op.Summary)
	obj.Set("description", b.exposeDescription(op.Description))
	obj.Set("deprecated", op.Deprecated)
	obj.Set("loc", b.exposeLoc(op.Loc))

	tags := b.vm.NewArray()
	for i, t := range op.Tags {
		tags.Set(intStr(i), t.Name)
	}
	obj.Set("tags", tags)

	obj.Set("security", b.exposeSecurityRequirements(op.Security))

	params := b.vm.NewArray()
	for i, p := range op.Parameters {
		params.Set(intStr(i), b.exposeParameter(p))
	}
	obj.Set("parameters", params)

	responses := b.vm.NewObject()
	for code, resp := range op.Responses {
		responses.Set(code, b.exposeResponse(resp))
	}
	obj.Set("responses", responses)

	if op.RequestBody != nil {
		obj.Set("requestBody", b.exposeRequestBody(op.RequestBody))
	}

	obj.Set("extensions", b.exposeExtensions(op.Extensions))

	return obj
}

func (b *bridge) exposeSchema(s *openapi.Schema) goja.Value {
	if s == nil {
		return goja.Undefined()
	}
	obj := b.vm.NewObject()
	obj.Set("type", s.Type)
	obj.Set("format", s.Format)
	obj.Set("title", s.Title)
	obj.Set("description", b.exposeDescription(s.Description))
	obj.Set("pattern", s.Pattern)
	obj.Set("nullable", s.Nullable)
	obj.Set("readOnly", s.ReadOnly)
	obj.Set("writeOnly", s.WriteOnly)
	obj.Set("deprecated", s.Deprecated)
	obj.Set("ref", s.Ref)
	obj.Set("loc", b.exposeLoc(s.Loc))

	obj.Set("enum", b.stringSlice(s.Enum))
	obj.Set("required", b.stringSlice(s.Required))

	props := b.vm.NewObject()
	for name, prop := range s.Properties {
		props.Set(name, b.exposeSchema(prop))
	}
	obj.Set("properties", props)

	obj.Set("extensions", b.exposeExtensions(s.Extensions))

	return obj
}

func (b *bridge) exposePathItem(item *openapi.PathItem) goja.Value {
	obj := b.vm.NewObject()
	obj.Set("summary", item.Summary)
	obj.Set("description", b.exposeDescription(item.Description))
	obj.Set("ref", item.Ref)
	obj.Set("loc", b.exposeLoc(item.Loc))
	obj.Set("extensions", b.exposeExtensions(item.Extensions))
	return obj
}

func (b *bridge) exposeParameter(p *openapi.Parameter) goja.Value {
	obj := b.vm.NewObject()
	obj.Set("name", p.Name)
	obj.Set("in", p.In)
	obj.Set("description", b.exposeDescription(p.Description))
	obj.Set("required", p.Required)
	obj.Set("deprecated", p.Deprecated)
	obj.Set("ref", p.Ref)
	obj.Set("loc", b.exposeLoc(p.Loc))
	if p.Schema != nil {
		obj.Set("schema", b.exposeSchema(p.Schema))
	}
	return obj
}

func (b *bridge) exposeResponse(resp *openapi.Response) goja.Value {
	obj := b.vm.NewObject()
	obj.Set("description", b.exposeDescription(resp.Description))
	obj.Set("ref", resp.Ref)
	obj.Set("loc", b.exposeLoc(resp.Loc))

	headers := b.vm.NewObject()
	for name, h := range resp.Headers {
		hObj := b.vm.NewObject()
		hObj.Set("description", b.exposeDescription(h.Description))
		hObj.Set("required", h.Required)
		hObj.Set("loc", b.exposeLoc(h.Loc))
		headers.Set(name, hObj)
	}
	obj.Set("headers", headers)

	content := b.vm.NewObject()
	for mt, mediaType := range resp.Content {
		mtObj := b.vm.NewObject()
		if mediaType.Schema != nil {
			mtObj.Set("schema", b.exposeSchema(mediaType.Schema))
		}
		mtObj.Set("loc", b.exposeLoc(mediaType.Loc))
		content.Set(mt, mtObj)
	}
	obj.Set("content", content)

	return obj
}

func (b *bridge) exposeRequestBody(rb *openapi.RequestBody) goja.Value {
	obj := b.vm.NewObject()
	obj.Set("description", b.exposeDescription(rb.Description))
	obj.Set("required", rb.Required)
	obj.Set("ref", rb.Ref)
	obj.Set("loc", b.exposeLoc(rb.Loc))

	content := b.vm.NewObject()
	for mt, mediaType := range rb.Content {
		mtObj := b.vm.NewObject()
		if mediaType.Schema != nil {
			mtObj.Set("schema", b.exposeSchema(mediaType.Schema))
		}
		mtObj.Set("loc", b.exposeLoc(mediaType.Loc))
		content.Set(mt, mtObj)
	}
	obj.Set("content", content)

	return obj
}

func (b *bridge) exposeTag(t *openapi.Tag) goja.Value {
	obj := b.vm.NewObject()
	obj.Set("name", t.Name)
	obj.Set("description", b.exposeDescription(t.Description))
	obj.Set("loc", b.exposeLoc(t.Loc))
	return obj
}

func (b *bridge) exposeServer(s *openapi.Server) goja.Value {
	obj := b.vm.NewObject()
	obj.Set("url", s.URL)
	obj.Set("description", b.exposeDescription(s.Description))
	obj.Set("loc", b.exposeLoc(s.Loc))
	return obj
}

func (b *bridge) exposeSecurityScheme(ss *openapi.SecurityScheme) goja.Value {
	obj := b.vm.NewObject()
	obj.Set("type", ss.Type)
	obj.Set("description", b.exposeDescription(ss.Description))
	obj.Set("name", ss.Name)
	obj.Set("in", ss.In)
	obj.Set("scheme", ss.Scheme)
	obj.Set("bearerFormat", ss.BearerFormat)
	obj.Set("openIdConnectUrl", ss.OpenIDConnectURL)
	obj.Set("ref", ss.Ref)
	obj.Set("loc", b.exposeLoc(ss.Loc))
	return obj
}

func (b *bridge) exposeExtensions(exts map[string]*openapi.Node) goja.Value {
	if len(exts) == 0 {
		return b.vm.NewObject()
	}
	obj := b.vm.NewObject()
	for k, v := range exts {
		if v != nil {
			obj.Set(k, v.Value)
		}
	}
	return obj
}

func (b *bridge) stringSlice(ss []string) goja.Value {
	arr := b.vm.NewArray()
	for i, s := range ss {
		arr.Set(intStr(i), s)
	}
	return arr
}

func getUint32(obj *goja.Object, key string) uint32 {
	v := obj.Get(key)
	if v == nil || goja.IsUndefined(v) || goja.IsNull(v) {
		return 0
	}
	return uint32(v.ToInteger()) //nolint:gosec
}

func intStr(i int) string {
	return strconv.Itoa(i)
}
