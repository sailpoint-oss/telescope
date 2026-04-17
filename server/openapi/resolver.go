package openapi

import (
	"fmt"
	"strings"
)

// ResolveRef resolves a JSON Reference ($ref) string to the corresponding model
// element within this index. Supports local references like #/components/schemas/Pet.
func (idx *Index) ResolveRef(ref string) (interface{}, error) {
	if idx == nil {
		return nil, fmt.Errorf("nil index")
	}
	if nav := idx.navIndex(); nav != nil {
		return nav.ResolveRef(ref)
	}
	if idx.Document == nil {
		return nil, fmt.Errorf("no document")
	}

	// Strip file path portion if present (cross-file refs handled by caller)
	localRef := ref
	if i := strings.Index(ref, "#"); i >= 0 {
		localRef = ref[i:]
	} else {
		return nil, fmt.Errorf("not a local ref: %s", ref)
	}

	if !strings.HasPrefix(localRef, "#/") {
		return nil, fmt.Errorf("invalid ref format: %s", ref)
	}

	parts := strings.Split(localRef[2:], "/")
	return idx.resolveRefParts(parts)
}

func (idx *Index) resolveRefParts(parts []string) (interface{}, error) {
	if len(parts) == 0 {
		return idx.Document, nil
	}

	// Unescape JSON Pointer encoding
	for i, part := range parts {
		parts[i] = unescapeJSONPointer(part)
	}

	switch parts[0] {
	case "components":
		return idx.resolveComponent(parts[1:])
	case "paths":
		return idx.resolvePath(parts[1:])
	case "info":
		if idx.Document.Info == nil {
			return nil, fmt.Errorf("info not found")
		}
		return idx.Document.Info, nil
	case "servers":
		return idx.resolveByIndex(parts[1:], len(idx.Document.Servers), func(i int) interface{} {
			return &idx.Document.Servers[i]
		})
	case "tags":
		return idx.resolveByIndex(parts[1:], len(idx.Document.Tags), func(i int) interface{} {
			return &idx.Document.Tags[i]
		})
	default:
		return nil, fmt.Errorf("cannot resolve path segment: %s", parts[0])
	}
}

func (idx *Index) resolveComponent(parts []string) (interface{}, error) {
	if len(parts) < 2 || idx.Document.Components == nil {
		return nil, fmt.Errorf("invalid component ref")
	}

	kind := parts[0]
	name := parts[1]

	switch kind {
	case "schemas":
		if s, ok := idx.Document.Components.Schemas[name]; ok {
			return s, nil
		}
	case "responses":
		if r, ok := idx.Document.Components.Responses[name]; ok {
			return r, nil
		}
	case "parameters":
		if p, ok := idx.Document.Components.Parameters[name]; ok {
			return p, nil
		}
	case "examples":
		if e, ok := idx.Document.Components.Examples[name]; ok {
			return e, nil
		}
	case "requestBodies":
		if rb, ok := idx.Document.Components.RequestBodies[name]; ok {
			return rb, nil
		}
	case "headers":
		if h, ok := idx.Document.Components.Headers[name]; ok {
			return h, nil
		}
	case "securitySchemes":
		if ss, ok := idx.Document.Components.SecuritySchemes[name]; ok {
			return ss, nil
		}
	case "links":
		if l, ok := idx.Document.Components.Links[name]; ok {
			return l, nil
		}
	case "pathItems":
		if pi, ok := idx.Document.Components.PathItems[name]; ok {
			return pi, nil
		}
	}

	return nil, fmt.Errorf("component %s/%s not found", kind, name)
}

func (idx *Index) resolvePath(parts []string) (interface{}, error) {
	if len(parts) == 0 {
		return idx.Document.Paths, nil
	}

	// Path templates use ~1 encoding in JSON Pointer
	path := unescapeJSONPointer(parts[0])
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	item, ok := idx.Document.Paths[path]
	if !ok {
		return nil, fmt.Errorf("path %s not found", path)
	}

	if len(parts) == 1 {
		return item, nil
	}

	method := parts[1]
	for _, mo := range item.Operations() {
		if mo.Method == method {
			return mo.Operation, nil
		}
	}

	return nil, fmt.Errorf("method %s not found on path %s", method, path)
}

func (idx *Index) resolveByIndex(parts []string, length int, getter func(int) interface{}) (interface{}, error) {
	if len(parts) == 0 || length == 0 {
		return nil, fmt.Errorf("index out of range")
	}
	i := 0
	for _, c := range parts[0] {
		if c < '0' || c > '9' {
			return nil, fmt.Errorf("invalid index: %s", parts[0])
		}
		i = i*10 + int(c-'0')
	}
	if i >= length {
		return nil, fmt.Errorf("index %d out of range (length %d)", i, length)
	}
	return getter(i), nil
}

// unescapeJSONPointer reverses JSON Pointer encoding (RFC 6901).
func unescapeJSONPointer(s string) string {
	s = strings.ReplaceAll(s, "~1", "/")
	s = strings.ReplaceAll(s, "~0", "~")
	return s
}

// escapeJSONPointer applies JSON Pointer encoding (RFC 6901).
func escapeJSONPointer(s string) string {
	s = strings.ReplaceAll(s, "~", "~0")
	s = strings.ReplaceAll(s, "/", "~1")
	return s
}

// ComponentRefPath returns the $ref string for a component.
func ComponentRefPath(kind, name string) string {
	return "#/components/" + kind + "/" + escapeJSONPointer(name)
}
