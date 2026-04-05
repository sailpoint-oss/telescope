package bun

import (
	"encoding/json"
	"strings"

	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/core/graph"

	"gopkg.in/yaml.v3"
)

// SerializedDoc is the read-only projection of a document sent to the Bun sidecar.
type SerializedDoc struct {
	URI      string               `json:"uri"`
	AST      map[string]any       `json:"ast"`
	RawText  string               `json:"rawText"`
	Format   string               `json:"format"`
	Version  string               `json:"version"`
	Pointers map[string][4]uint32 `json:"pointers"`
}

// SerializedProjectIndex is the cross-file index sent to the Bun sidecar.
type SerializedProjectIndex struct {
	OperationIDs  map[string][]string `json:"operationIds"`
	ComponentRefs map[string][]string `json:"componentRefs"`
	Tags          map[string][]string `json:"tags"`
}

// SerializeRawContent parses raw YAML/JSON content into a map for the AST field.
func SerializeRawContent(content []byte, format string) (map[string]any, error) {
	var ast map[string]any
	switch format {
	case "json":
		if err := json.Unmarshal(content, &ast); err != nil {
			return nil, err
		}
	default:
		if err := yaml.Unmarshal(content, &ast); err != nil {
			return nil, err
		}
	}
	return ast, nil
}

// PointersFromContent parses raw document content and projects navigator ranges
// into the Bun sidecar pointer format.
func PointersFromContent(content string, uri string) map[string][4]uint32 {
	idx := navigator.ParseContent([]byte(content), uri)
	if idx == nil || idx.SemanticRoot() == nil {
		return map[string][4]uint32{}
	}

	pi := navigator.BuildPointerIndex(idx.SemanticRoot())
	pointers := make(map[string][4]uint32, pi.Len())
	for ptr, r := range pi.All() {
		pointers[ptr] = [4]uint32{r.Start.Line, r.Start.Character, r.End.Line, r.End.Character}
	}
	return pointers
}

// SerializeDoc builds a SerializedDoc from a graph node and optional snapshot.
func SerializeDoc(uri string, node *graph.GraphNode, snap *graph.Snapshot) SerializedDoc {
	if node == nil {
		return SerializedDoc{URI: uri}
	}

	content := string(node.Raw)
	format := "yaml"
	if strings.HasSuffix(uri, ".json") {
		format = "json"
	}

	ast, _ := SerializeRawContent(node.Raw, format)
	if ast == nil {
		ast = make(map[string]any)
	}

	version := ""
	if v, ok := ast["openapi"]; ok {
		version, _ = v.(string)
	}

	pointers := PointersFromContent(content, uri)
	if snap != nil {
		if pi := snap.PointerIndices[uri]; pi != nil {
			pointers = make(map[string][4]uint32, pi.Len())
			for ptr, r := range pi.All() {
				pointers[ptr] = [4]uint32{r.Start.Line, r.Start.Character, r.End.Line, r.End.Character}
			}
		}
	}

	return SerializedDoc{
		URI:      uri,
		AST:      ast,
		RawText:  content,
		Format:   format,
		Version:  version,
		Pointers: pointers,
	}
}

// SerializeIndex builds a cross-file project index from the snapshot.
func SerializeIndex(snap *graph.Snapshot) SerializedProjectIndex {
	idx := SerializedProjectIndex{
		OperationIDs:  make(map[string][]string),
		ComponentRefs: make(map[string][]string),
		Tags:          make(map[string][]string),
	}

	if snap == nil {
		return idx
	}

	for uri, node := range snap.Nodes {
		ast, _ := SerializeRawContent(node.Raw, detectFormat(uri))
		if ast == nil {
			continue
		}
		extractCrossFileData(uri, ast, &idx)
	}

	return idx
}

func extractCrossFileData(uri string, ast map[string]any, idx *SerializedProjectIndex) {
	paths, _ := ast["paths"].(map[string]any)
	for _, pathItem := range paths {
		pi, _ := pathItem.(map[string]any)
		for _, method := range []string{"get", "put", "post", "delete", "options", "head", "patch", "trace"} {
			op, _ := pi[method].(map[string]any)
			if op == nil {
				continue
			}
			if opID, ok := op["operationId"].(string); ok && opID != "" {
				idx.OperationIDs[opID] = append(idx.OperationIDs[opID], uri)
			}
		}
	}

	tags, _ := ast["tags"].([]any)
	for _, t := range tags {
		if tm, ok := t.(map[string]any); ok {
			if name, ok := tm["name"].(string); ok && name != "" {
				idx.Tags[name] = append(idx.Tags[name], uri)
			}
		}
	}

	components, _ := ast["components"].(map[string]any)
	for compType, compMap := range components {
		cm, _ := compMap.(map[string]any)
		for name := range cm {
			ref := "#/components/" + compType + "/" + name
			idx.ComponentRefs[ref] = append(idx.ComponentRefs[ref], uri)
		}
	}
}

func detectFormat(uri string) string {
	if strings.HasSuffix(uri, ".json") {
		return "json"
	}
	return "yaml"
}
