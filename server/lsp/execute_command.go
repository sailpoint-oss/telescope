package lsp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/project"
	"gopkg.in/yaml.v3"
)

// NewExecuteCommandHandler handles custom telescope commands.
// Commands expect a document URI as the first argument.
func NewExecuteCommandHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.ExecuteCommandHandler {
	return func(ctx *gossip.Context, params *protocol.ExecuteCommandParams) (interface{}, error) {
		uri := extractDocURI(params.Arguments)

		switch params.Command {
		case "telescope.sortTags":
			return executeSortTags(ctx, cache, uri)
		case "telescope.sortPaths":
			return executeSortPaths(ctx, cache, uri)
		case "telescope.generateResponseSkeletons":
			return executeGenerateResponses(ctx, cache, uri)
		case "telescope.bundlePreview":
			return executeBundlePreview(ctx, cache, uri)
		case "telescope.validateExamples":
			return executeValidateExamples(cache, uri)
		case "telescope.runContractTests":
			return executeRunContractTests(ctx, cache, uri, params.Arguments)
		default:
			return nil, nil
		}
	}
}

func extractDocURI(args []interface{}) protocol.DocumentURI {
	if len(args) == 0 {
		return ""
	}
	if s, ok := args[0].(string); ok {
		return protocol.DocumentURI(s)
	}
	return ""
}

type contractRunOptions struct {
	BaseURL     string
	OperationID string
	Tags        []string
}

func extractContractRunOptions(args []interface{}) contractRunOptions {
	opts := contractRunOptions{BaseURL: "http://localhost:8080"}
	if len(args) < 2 {
		return opts
	}

	switch arg := args[1].(type) {
	case string:
		if strings.TrimSpace(arg) != "" {
			opts.BaseURL = strings.TrimSpace(arg)
		}
	case map[string]interface{}:
		if baseURL, ok := arg["baseUrl"].(string); ok && strings.TrimSpace(baseURL) != "" {
			opts.BaseURL = strings.TrimSpace(baseURL)
		}
		if operationID, ok := arg["operationId"].(string); ok {
			opts.OperationID = strings.TrimSpace(operationID)
		}
		if tags, ok := arg["tags"].([]interface{}); ok {
			for _, tag := range tags {
				if s, ok := tag.(string); ok && strings.TrimSpace(s) != "" {
					opts.Tags = append(opts.Tags, strings.TrimSpace(s))
				}
			}
		}
	}

	return opts
}

func executeSortTags(ctx *gossip.Context, cache *openapi.IndexCache, uri protocol.DocumentURI) (interface{}, error) {
	idx := cache.Get(uri)
	if idx == nil || !idx.IsOpenAPI() {
		return nil, nil
	}

	doc := ctx.Documents.Get(uri)
	if doc == nil {
		return nil, nil
	}

	// Sort root-level tags alphabetically by name
	tags := make([]openapi.Tag, len(idx.Document.Tags))
	copy(tags, idx.Document.Tags)
	sort.Slice(tags, func(i, j int) bool {
		return tags[i].Name < tags[j].Name
	})

	// Build YAML replacement for the tags section
	if len(tags) == 0 {
		return nil, nil
	}

	isYAML := idx.Format == openapi.FormatYAML
	var sb strings.Builder
	for _, tag := range tags {
		if isYAML {
			sb.WriteString(fmt.Sprintf("  - name: %s\n", tag.Name))
			if tag.Description.Text != "" {
				sb.WriteString(fmt.Sprintf("    description: %s\n", tag.Description.Text))
			}
		} else {
			sb.WriteString(fmt.Sprintf("    {\"name\": \"%s\"", tag.Name))
			if tag.Description.Text != "" {
				sb.WriteString(fmt.Sprintf(", \"description\": \"%s\"", tag.Description.Text))
			}
			sb.WriteString("},\n")
		}
	}

	// Find the range of the tags array
	first := idx.Document.Tags[0]
	last := idx.Document.Tags[len(idx.Document.Tags)-1]
	editRange := protocol.Range{
		Start: adapt.PositionToProtocol(first.Loc.Range.Start),
		End:   adapt.PositionToProtocol(last.Loc.Range.End),
	}

	edit := &protocol.WorkspaceEdit{
		Changes: map[protocol.DocumentURI][]protocol.TextEdit{
			uri: {{Range: editRange, NewText: strings.TrimRight(sb.String(), "\n")}},
		},
	}

	if ctx.Client != nil {
		_, _ = ctx.Client.ApplyEdit(ctx, &protocol.ApplyWorkspaceEditParams{
			Label: "Sort tags",
			Edit:  *edit,
		})
	}

	return nil, nil
}

func executeSortPaths(ctx *gossip.Context, cache *openapi.IndexCache, uri protocol.DocumentURI) (interface{}, error) {
	idx := cache.Get(uri)
	if idx == nil || !idx.IsOpenAPI() || len(idx.Document.Paths) == 0 {
		return nil, nil
	}

	doc := ctx.Documents.Get(uri)
	if doc == nil {
		return nil, nil
	}

	// Collect path keys and sort them
	type pathEntry struct {
		key  string
		item *openapi.PathItem
	}

	entries := make([]pathEntry, 0, len(idx.Document.Paths))
	for path, item := range idx.Document.Paths {
		entries = append(entries, pathEntry{key: path, item: item})
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].key < entries[j].key
	})

	// Find the total range spanning all path items
	var startLine, endLine uint32
	first := true
	for _, e := range entries {
		r := e.item.Loc.Range
		if first || r.Start.Line < startLine {
			startLine = r.Start.Line
		}
		if first || r.End.Line > endLine {
			endLine = r.End.Line
		}
		first = false
	}

	// Get the original text and rebuild with sorted path order
	// For now, just return the sorted order as a rebuild
	var sb strings.Builder
	for _, e := range entries {
		startL := e.item.Loc.Range.Start.Line
		endL := e.item.Loc.Range.End.Line
		for l := startL; l <= endL; l++ {
			lineContent := doc.LineAt(l)
			sb.WriteString(lineContent)
			if !strings.HasSuffix(lineContent, "\n") {
				sb.WriteString("\n")
			}
		}
	}

	editRange := protocol.Range{
		Start: protocol.Position{Line: startLine, Character: 0},
		End:   protocol.Position{Line: endLine + 1, Character: 0},
	}

	edit := &protocol.WorkspaceEdit{
		Changes: map[protocol.DocumentURI][]protocol.TextEdit{
			uri: {{Range: editRange, NewText: sb.String()}},
		},
	}

	if ctx.Client != nil {
		_, _ = ctx.Client.ApplyEdit(ctx, &protocol.ApplyWorkspaceEditParams{
			Label: "Sort paths",
			Edit:  *edit,
		})
	}

	return nil, nil
}

func executeGenerateResponses(ctx *gossip.Context, cache *openapi.IndexCache, uri protocol.DocumentURI) (interface{}, error) {
	idx := cache.Get(uri)
	if idx == nil || !idx.IsOpenAPI() {
		return nil, nil
	}

	isYAML := idx.Format == openapi.FormatYAML
	var edits []protocol.TextEdit

	for _, item := range idx.Document.Paths {
		for _, mo := range item.Operations() {
			op := mo.Operation
			responses := op.Responses

			has2xx := false
			has4xx := false
			has5xx := false
			for code := range responses {
				if strings.HasPrefix(code, "2") {
					has2xx = true
				}
				if strings.HasPrefix(code, "4") {
					has4xx = true
				}
				if strings.HasPrefix(code, "5") {
					has5xx = true
				}
			}

			var missing []string
			if !has2xx {
				missing = append(missing, "200")
			}
			if !has4xx {
				missing = append(missing, "400")
			}
			if !has5xx {
				missing = append(missing, "500")
			}

			if len(missing) == 0 {
				continue
			}

			// Insert at the end of the responses block
			insertLine := op.Loc.Range.End.Line
			for _, resp := range responses {
				if resp == nil {
					continue
				}
				if resp.Loc.Range.End.Line >= insertLine {
					insertLine = resp.Loc.Range.End.Line
				}
			}

			var sb strings.Builder
			for _, code := range missing {
				desc := statusDescription(code)
				if isYAML {
					sb.WriteString(fmt.Sprintf("        '%s':\n          description: %s\n", code, desc))
				} else {
					sb.WriteString(fmt.Sprintf("          \"%s\": {\"description\": \"%s\"},\n", code, desc))
				}
			}

			edits = append(edits, protocol.TextEdit{
				Range: protocol.Range{
					Start: protocol.Position{Line: insertLine, Character: 0},
					End:   protocol.Position{Line: insertLine, Character: 0},
				},
				NewText: sb.String(),
			})
		}
	}

	if len(edits) == 0 {
		return nil, nil
	}

	edit := &protocol.WorkspaceEdit{
		Changes: map[protocol.DocumentURI][]protocol.TextEdit{uri: edits},
	}

	if ctx.Client != nil {
		_, _ = ctx.Client.ApplyEdit(ctx, &protocol.ApplyWorkspaceEditParams{
			Label: "Generate response skeletons",
			Edit:  *edit,
		})
	}

	return nil, nil
}

func executeRunContractTests(ctx *gossip.Context, cache *openapi.IndexCache, uri protocol.DocumentURI, args []interface{}) (interface{}, error) {
	idx := cache.Get(uri)
	if idx == nil && ctx != nil && ctx.Documents != nil {
		if doc := ctx.Documents.Get(uri); doc != nil {
			idx = openapi.ParseAndIndex([]byte(doc.Text()))
		}
	}
	if idx == nil {
		return nil, fmt.Errorf("no parsed document available for %s", uri)
	}
	if !idx.IsAPIDescription() || !idx.IsRootDocument() {
		return nil, fmt.Errorf("contract tests currently require an OpenAPI or Arazzo root document")
	}

	opts := extractContractRunOptions(args)
	runCtx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	docPath, cleanup, err := materializeContractTestDocument(ctx, uri)
	if err != nil {
		return nil, err
	}
	defer cleanup()
	configPath, configCleanup, err := materializeContractTestConfig(idx.DocumentKind(), docPath, opts)
	if err != nil {
		return nil, err
	}
	defer configCleanup()

	barometerBin, barometerPrefix, err := resolveBarometerCommand()
	if err != nil {
		return nil, err
	}
	cmdArgs := append([]string{}, barometerPrefix...)
	cmdArgs = append(cmdArgs, "contract", "test", "--config", configPath, "--output", "json")
	cmd := exec.CommandContext(runCtx, barometerBin, cmdArgs...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err = cmd.Run()
	if stdout.Len() == 0 {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			return nil, err
		}
		if err != nil {
			return nil, fmt.Errorf("%w: %s", err, msg)
		}
		return nil, fmt.Errorf("%s", msg)
	}

	var result map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return nil, fmt.Errorf("parse barometer json: %w", err)
	}
	payload := map[string]any{
		"baseUrl": opts.BaseURL,
		"result":  result,
	}
	if msg := strings.TrimSpace(stderr.String()); msg != "" {
		payload["stderr"] = msg
	}
	return payload, nil
}

func materializeContractTestDocument(ctx *gossip.Context, uri protocol.DocumentURI) (string, func(), error) {
	if ctx != nil && ctx.Documents != nil {
		if doc := ctx.Documents.Get(uri); doc != nil {
			path, err := fileURIToPath(uri)
			if err != nil {
				return "", nil, err
			}
			pattern := "telescope-contract-*"
			if suffix := filepath.Ext(path); suffix != "" {
				pattern += suffix
			}
			tmp, err := os.CreateTemp("", pattern)
			if err != nil {
				return "", nil, err
			}
			if _, err := tmp.WriteString(doc.Text()); err != nil {
				tmp.Close()
				os.Remove(tmp.Name())
				return "", nil, err
			}
			if err := tmp.Close(); err != nil {
				os.Remove(tmp.Name())
				return "", nil, err
			}
			_ = path
			return tmp.Name(), func() { _ = os.Remove(tmp.Name()) }, nil
		}
	}

	path, err := fileURIToPath(uri)
	if err != nil {
		return "", nil, err
	}
	return path, func() {}, nil
}

func materializeContractTestConfig(kind openapi.DocumentKind, docPath string, opts contractRunOptions) (string, func(), error) {
	config := map[string]any{
		"baseUrl": opts.BaseURL,
		"output":  "json",
	}
	switch kind {
	case openapi.DocumentKindOpenAPI:
		openapiCfg := map[string]any{"spec": docPath}
		if len(opts.Tags) > 0 {
			openapiCfg["tags"] = append([]string(nil), opts.Tags...)
		}
		config["openapi"] = openapiCfg
	case openapi.DocumentKindArazzo:
		config["arazzo"] = map[string]any{"doc": docPath}
	default:
		return "", nil, fmt.Errorf("unsupported contract test document kind %q", kind.String())
	}

	tmp, err := os.CreateTemp("", "telescope-contract-*.json")
	if err != nil {
		return "", nil, err
	}
	enc := json.NewEncoder(tmp)
	enc.SetIndent("", "  ")
	if err := enc.Encode(config); err != nil {
		tmp.Close()
		os.Remove(tmp.Name())
		return "", nil, err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmp.Name())
		return "", nil, err
	}
	return tmp.Name(), func() { _ = os.Remove(tmp.Name()) }, nil
}

func resolveBarometerCommand() (string, []string, error) {
	if override := strings.TrimSpace(os.Getenv("TELESCOPE_BAROMETER_BIN")); override != "" {
		return override, nil, nil
	}
	if path, err := exec.LookPath("barometer"); err == nil {
		return path, nil, nil
	}
	if goBin, err := exec.LookPath("go"); err == nil {
		return goBin, []string{"run", "github.com/sailpoint-oss/barometer/cmd/barometer@latest"}, nil
	}
	return "", nil, fmt.Errorf("barometer CLI not found on PATH and Go fallback unavailable")
}

func statusDescription(code string) string {
	switch code {
	case "200":
		return "OK"
	case "201":
		return "Created"
	case "204":
		return "No Content"
	case "400":
		return "Bad Request"
	case "401":
		return "Unauthorized"
	case "403":
		return "Forbidden"
	case "404":
		return "Not Found"
	case "500":
		return "Internal Server Error"
	default:
		return "Response"
	}
}

func executeValidateExamples(cache *openapi.IndexCache, uri protocol.DocumentURI) (interface{}, error) {
	idx := cache.Get(uri)
	if idx == nil || !idx.IsOpenAPI() || idx.Document == nil || idx.Document.Components == nil {
		return map[string]interface{}{
			"checked": 0,
			"invalid": 0,
			"issues":  []string{},
		}, nil
	}

	checked := 0
	invalid := 0
	issues := make([]string, 0)

	for name, schema := range idx.Document.Components.Schemas {
		if schema == nil || schema.Example == nil || schema.Type == "" {
			continue
		}
		checked++
		if !exampleMatchesSchemaType(schema.Example.Value, schema.Type) {
			invalid++
			issues = append(issues, fmt.Sprintf("components.schemas.%s example does not match type %q", name, schema.Type))
		}
	}

	return map[string]interface{}{
		"checked": checked,
		"invalid": invalid,
		"issues":  issues,
	}, nil
}

func executeBundlePreview(ctx *gossip.Context, cache *openapi.IndexCache, uri protocol.DocumentURI) (interface{}, error) {
	idx := cache.Get(uri)
	if idx == nil || idx.Document == nil || !idx.IsOpenAPI() {
		return nil, nil
	}

	proj, err := project.BuildProjectContext(string(uri), cache, nil)
	if err != nil {
		return nil, fmt.Errorf("bundle preview: %w", err)
	}

	order := []string{string(uri)}
	if proj.Graph != nil {
		order = append(order, proj.Graph.TransitiveDependenciesOf(string(uri))...)
	}

	merged := make(map[string]any)
	warnings := make([]string, 0)
	for i, depURI := range order {
		docMap, err := readBundleDocument(ctx, protocol.DocumentURI(depURI))
		if err != nil {
			warnings = append(warnings, err.Error())
			continue
		}
		if i == 0 {
			merged = docMap
			continue
		}
		mergeBundleComponents(merged, docMap)
	}
	if len(merged) == 0 {
		return nil, nil
	}

	content, language, err := marshalBundleDocument(merged, idx.Format)
	if err != nil {
		return nil, fmt.Errorf("bundle preview: %w", err)
	}

	return map[string]interface{}{
		"content":  string(content),
		"language": language,
		"files":    len(order),
		"warnings": warnings,
		"source":   "server",
	}, nil
}

func exampleMatchesSchemaType(raw, schemaType string) bool {
	literalType := detectExampleLiteralType(raw)
	switch strings.ToLower(schemaType) {
	case "string":
		return literalType == "string"
	case "boolean":
		return literalType == "boolean"
	case "integer":
		return literalType == "integer"
	case "number":
		return literalType == "integer" || literalType == "number"
	case "array":
		return literalType == "array"
	case "object":
		return literalType == "object"
	default:
		return true
	}
}

func detectExampleLiteralType(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "string"
	}
	if strings.HasPrefix(s, "{") && strings.HasSuffix(s, "}") {
		return "object"
	}
	if strings.HasPrefix(s, "[") && strings.HasSuffix(s, "]") {
		return "array"
	}
	if s == "true" || s == "false" {
		return "boolean"
	}
	if s == "null" || s == "~" {
		return "null"
	}
	if _, err := strconv.ParseInt(s, 10, 64); err == nil {
		return "integer"
	}
	if _, err := strconv.ParseFloat(s, 64); err == nil {
		return "number"
	}
	if (strings.HasPrefix(s, "\"") && strings.HasSuffix(s, "\"")) ||
		(strings.HasPrefix(s, "'") && strings.HasSuffix(s, "'")) {
		return "string"
	}
	return "string"
}

func readBundleDocument(ctx *gossip.Context, uri protocol.DocumentURI) (map[string]any, error) {
	var raw []byte
	if ctx != nil && ctx.Documents != nil {
		if doc := ctx.Documents.Get(uri); doc != nil {
			raw = []byte(doc.Text())
		}
	}
	if len(raw) == 0 {
		path, err := fileURIToPath(uri)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", uri, err)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", uri, err)
		}
		raw = data
	}

	doc := make(map[string]any)
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("parse %s: %w", uri, err)
	}
	return doc, nil
}

func fileURIToPath(uri protocol.DocumentURI) (string, error) {
	if !strings.HasPrefix(string(uri), "file://") {
		return "", fmt.Errorf("unsupported URI scheme %q", uri)
	}
	return project.URIToPath(string(uri)), nil
}

func marshalBundleDocument(doc map[string]any, format openapi.FileFormat) ([]byte, string, error) {
	if format == openapi.FormatJSON {
		data, err := json.MarshalIndent(doc, "", "  ")
		if err != nil {
			return nil, "", err
		}
		if !strings.HasSuffix(string(data), "\n") {
			data = append(data, '\n')
		}
		return data, "json", nil
	}
	data, err := yaml.Marshal(doc)
	if err != nil {
		return nil, "", err
	}
	return data, "yaml", nil
}

func mergeBundleComponents(dst, src map[string]any) {
	srcComps, ok := src["components"].(map[string]any)
	if !ok {
		return
	}

	dstComps, ok := dst["components"].(map[string]any)
	if !ok {
		dstComps = make(map[string]any)
		dst["components"] = dstComps
	}

	for kind, entries := range srcComps {
		srcEntries, ok := entries.(map[string]any)
		if !ok {
			continue
		}
		dstEntries, ok := dstComps[kind].(map[string]any)
		if !ok {
			dstEntries = make(map[string]any)
			dstComps[kind] = dstEntries
		}
		for name, val := range srcEntries {
			if _, exists := dstEntries[name]; !exists {
				dstEntries[name] = val
			}
		}
	}
}
