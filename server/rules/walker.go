package rules

import (
	"fmt"

	"github.com/sailpoint-oss/telescope/server/openapi"
)

// Visitors holds optional callback functions for each OpenAPI model element.
// Walk invokes only the non-nil visitors, handling traversal automatically.
type Visitors struct {
	Document        func(doc *openapi.Document, r *Reporter)
	Info            func(info *openapi.Info, r *Reporter)
	Path            func(path string, item *openapi.PathItem, r *Reporter)
	Operation       func(path string, method string, op *openapi.Operation, r *Reporter)
	Schema          func(name string, schema *openapi.Schema, pointer string, r *Reporter)
	RecursiveSchema func(name string, schema *openapi.Schema, pointer string, r *Reporter)
	Parameter       func(param *openapi.Parameter, r *Reporter)
	Response        func(code string, resp *openapi.Response, r *Reporter)
	Tag             func(tag *openapi.Tag, r *Reporter)
	Server          func(server *openapi.Server, r *Reporter)
	RequestBody     func(path string, method string, rb *openapi.RequestBody, r *Reporter)
	SecurityScheme  func(name string, ss *openapi.SecurityScheme, r *Reporter)
	Example         func(name string, ex *openapi.Example, r *Reporter)
	Custom          func(idx *openapi.Index, r *Reporter)
}

// Walk traverses the OpenAPI index and invokes the registered visitor
// callbacks. The traversal order is: tags, servers, paths (with nested
// operations, parameters, request bodies, responses), component schemas,
// then the custom callback.
func Walk(idx *openapi.Index, v Visitors, r *Reporter) {
	if idx == nil || idx.Document == nil {
		return
	}
	doc := idx.Document

	if v.Document != nil {
		v.Document(doc, r)
	}

	if v.Info != nil && doc.Info != nil {
		v.Info(doc.Info, r)
	}

	if v.Tag != nil {
		for i := range doc.Tags {
			v.Tag(&doc.Tags[i], r)
		}
	}

	if v.Server != nil {
		for i := range doc.Servers {
			v.Server(&doc.Servers[i], r)
		}
	}

	walkPaths(doc, idx, v, r)
	walkComponentSchemas(doc, idx, v, r)
	walkSecuritySchemes(doc, v, r)
	walkExamples(doc, v, r)

	if v.Custom != nil {
		v.Custom(idx, r)
	}
}

func walkPaths(doc *openapi.Document, idx *openapi.Index, v Visitors, r *Reporter) {
	needPaths := v.Path != nil || v.Operation != nil || v.Parameter != nil ||
		v.RequestBody != nil || v.Response != nil

	if !needPaths {
		return
	}

	for path, item := range doc.Paths {
		if v.Path != nil {
			v.Path(path, item, r)
		}

		for _, mo := range item.Operations() {
			if v.Operation != nil {
				v.Operation(path, mo.Method, mo.Operation, r)
			}

			if v.Parameter != nil {
				for _, p := range mo.Operation.Parameters {
					v.Parameter(p, r)
				}
			}

			if v.RequestBody != nil && mo.Operation.RequestBody != nil {
				v.RequestBody(path, mo.Method, mo.Operation.RequestBody, r)
			}

			if v.Response != nil {
				for code, resp := range mo.Operation.Responses {
					v.Response(code, resp, r)
				}
			}
		}

		// Path-level parameters
		if v.Parameter != nil {
			for _, p := range item.Parameters {
				v.Parameter(p, r)
			}
		}
	}
}

func walkSecuritySchemes(doc *openapi.Document, v Visitors, r *Reporter) {
	if v.SecurityScheme == nil || doc.Components == nil {
		return
	}
	for name, ss := range doc.Components.SecuritySchemes {
		v.SecurityScheme(name, ss, r)
	}
}

func walkExamples(doc *openapi.Document, v Visitors, r *Reporter) {
	if v.Example == nil || doc.Components == nil {
		return
	}
	for name, ex := range doc.Components.Examples {
		v.Example(name, ex, r)
	}
}

func walkComponentSchemas(doc *openapi.Document, idx *openapi.Index, v Visitors, r *Reporter) {
	hasFlat := v.Schema != nil
	hasRecursive := v.RecursiveSchema != nil
	if !hasFlat && !hasRecursive {
		return
	}

	visitSchema := func(name string, schema *openapi.Schema, pointer string) {
		if hasFlat {
			v.Schema(name, schema, pointer, r)
		}
		if hasRecursive {
			walkSchemaRecursive(schema, name, pointer, v.RecursiveSchema, r)
		}
	}

	if doc.Components != nil {
		for name, schema := range doc.Components.Schemas {
			visitSchema(name, schema, "components/schemas/"+name)
		}
	}

	for path, item := range doc.Paths {
		for _, mo := range item.Operations() {
			for _, p := range mo.Operation.Parameters {
				if p.Schema != nil {
					visitSchema("", p.Schema, fmt.Sprintf("paths/%s/%s/parameters/%s", path, mo.Method, p.Name))
				}
			}
			if mo.Operation.RequestBody != nil {
				for mt, media := range mo.Operation.RequestBody.Content {
					if media.Schema != nil {
						visitSchema("", media.Schema, fmt.Sprintf("paths/%s/%s/requestBody/%s", path, mo.Method, mt))
					}
				}
			}
			for code, resp := range mo.Operation.Responses {
				for mt, media := range resp.Content {
					if media.Schema != nil {
						visitSchema("", media.Schema, fmt.Sprintf("paths/%s/%s/responses/%s/%s", path, mo.Method, code, mt))
					}
				}
			}
		}
	}
}

// walkSchemaRecursive visits a schema and all nested schemas (properties, items,
// allOf, anyOf, oneOf, additionalProperties) depth-first.
func walkSchemaRecursive(schema *openapi.Schema, name, pointer string, fn func(string, *openapi.Schema, string, *Reporter), r *Reporter) {
	if schema == nil {
		return
	}
	fn(name, schema, pointer, r)

	for propName, propSchema := range schema.Properties {
		walkSchemaRecursive(propSchema, propName, pointer+"/properties/"+propName, fn, r)
	}
	if schema.Items != nil {
		walkSchemaRecursive(schema.Items, "", pointer+"/items", fn, r)
	}
	if schema.AdditionalProperties != nil {
		walkSchemaRecursive(schema.AdditionalProperties, "", pointer+"/additionalProperties", fn, r)
	}
	for i, sub := range schema.AllOf {
		walkSchemaRecursive(sub, "", fmt.Sprintf("%s/allOf/%d", pointer, i), fn, r)
	}
	for i, sub := range schema.AnyOf {
		walkSchemaRecursive(sub, "", fmt.Sprintf("%s/anyOf/%d", pointer, i), fn, r)
	}
	for i, sub := range schema.OneOf {
		walkSchemaRecursive(sub, "", fmt.Sprintf("%s/oneOf/%d", pointer, i), fn, r)
	}
	if schema.Not != nil {
		walkSchemaRecursive(schema.Not, "", pointer+"/not", fn, r)
	}
}
