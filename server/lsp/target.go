package lsp

import (
	"path/filepath"
	"regexp"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// TargetDeps provides shared document targeting for LSP handlers and diagnostics.
// When nil, targeting checks fail open so unit tests without workspace config keep working.
type TargetDeps struct {
	Config          func() *config.Config
	Bridge          *GraphBridge
	WorkspaceRoot   func() string
}

var (
	topLevelKeyYAML = regexp.MustCompile(`(?m)^([A-Za-z0-9_.$-]+)\s*:`)
	topLevelKeyJSON = regexp.MustCompile(`"([^"\\]+)"\s*:`)
)

func (d *TargetDeps) cfg() *config.Config {
	if d == nil || d.Config == nil {
		return nil
	}
	return d.Config()
}

func (d *TargetDeps) workspaceRoot() string {
	if d == nil || d.WorkspaceRoot == nil {
		return ""
	}
	return d.WorkspaceRoot()
}

func (d *TargetDeps) openAPIPatterns() []string {
	cfg := d.cfg()
	if cfg == nil {
		return []string{"**/*.yaml", "**/*.yml", "**/*.json"}
	}
	if len(cfg.OpenAPI.Patterns) > 0 {
		return cfg.OpenAPI.Patterns
	}
	if len(cfg.Include) > 0 {
		return cfg.Include
	}
	return []string{"**/*.yaml", "**/*.yml", "**/*.json"}
}

func (d *TargetDeps) isExcluded(uri string) bool {
	root := d.workspaceRoot()
	cfg := d.cfg()
	if root == "" || cfg == nil || len(cfg.Exclude) == 0 {
		return false
	}
	return matchesFilePatterns(uri, root, cfg.Exclude)
}

// MatchesOpenAPIPatterns reports whether uri matches configured OpenAPI include patterns
// and is not excluded.
func (d *TargetDeps) MatchesOpenAPIPatterns(uri string) bool {
	if d == nil {
		return true
	}
	if !isOpenAPIExtensionURI(uri) {
		return false
	}
	if d.isExcluded(uri) {
		return false
	}
	root := d.workspaceRoot()
	if root == "" {
		return true
	}
	return matchesFilePatterns(uri, root, d.openAPIPatterns())
}

// IsAdditionalValidationTarget reports whether uri matches any additionalValidation group pattern.
func (d *TargetDeps) IsAdditionalValidationTarget(uri string) bool {
	if d == nil {
		return false
	}
	cfg := d.cfg()
	root := d.workspaceRoot()
	if cfg == nil || root == "" || len(cfg.AdditionalValidation) == 0 {
		return false
	}
	for _, group := range cfg.AdditionalValidation {
		if matchesFilePatterns(uri, root, group.Patterns) {
			return true
		}
	}
	return false
}

// IsOpenAPIDiagnosticTarget reports whether Telescope should run OpenAPI lint diagnostics
// and OpenAPI-scoped LSP features on the document.
func (d *TargetDeps) IsOpenAPIDiagnosticTarget(uri string, content []byte, idx *openapi.Index) bool {
	if d == nil {
		return true
	}
	if !isOpenAPIExtensionURI(uri) {
		return false
	}
	if d.isExcluded(uri) {
		return false
	}
	if !d.MatchesOpenAPIPatterns(uri) {
		return false
	}
	if len(content) > 0 && looksLikeKnownNonOpenAPI(content) {
		return false
	}

	isGraphMember := d.Bridge != nil && d.Bridge.HasIncomingRefs(uri)
	if d.Bridge != nil {
		class := d.Bridge.Classifier().Classify(uri, content, isGraphMember)
		if class.DocumentKind == openapi.DocumentKindArazzo {
			return false
		}
		if class.IsOpenAPI {
			return true
		}
	}
	if idx != nil && idx.IsOpenAPI() {
		return true
	}
	if isGraphMember && idx != nil && idx.Document != nil {
		return true
	}
	return false
}

// IsRootOpenAPITarget reports whether root-only OpenAPI LSP features should run.
func (d *TargetDeps) IsRootOpenAPITarget(uri string, content []byte, idx *openapi.Index) bool {
	if !d.IsOpenAPIDiagnosticTarget(uri, content, idx) {
		return false
	}
	return idx != nil && idx.IsOpenAPI()
}

func gatedOpenAPIAnalyzer(deps *TargetDeps, inner treesitter.Analyzer) treesitter.Analyzer {
	return treesitter.Analyzer{
		Scope: inner.Scope,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			if ctx.Document == nil {
				return nil
			}
			uri := string(ctx.Document.URI())
			content := []byte(ctx.Document.Text())
			if deps != nil && !deps.IsOpenAPIDiagnosticTarget(uri, content, rules.GetIndex(ctx)) {
				return nil
			}
			return inner.Run(ctx)
		},
	}
}

func handlerTargetGate(ctx *gossip.Context, bridge *GraphBridge, cache *openapi.IndexCache, uri protocol.DocumentURI) bool {
	if bridge == nil || bridge.TargetDeps() == nil {
		return true
	}
	var content []byte
	if doc := ctx.Documents.Get(uri); doc != nil {
		content = []byte(doc.Text())
	}
	return bridge.TargetDeps().IsOpenAPIDiagnosticTarget(string(uri), content, cache.Get(uri))
}

func rootOpenAPITargetGate(ctx *gossip.Context, bridge *GraphBridge, cache *openapi.IndexCache, uri protocol.DocumentURI) bool {
	if bridge == nil || bridge.TargetDeps() == nil {
		return true
	}
	var content []byte
	if doc := ctx.Documents.Get(uri); doc != nil {
		content = []byte(doc.Text())
	}
	return bridge.TargetDeps().IsRootOpenAPITarget(string(uri), content, cache.Get(uri))
}

func isOpenAPIExtensionURI(uri string) bool {
	ext := strings.ToLower(filepath.Ext(uriToFSPath(uri)))
	switch ext {
	case ".yaml", ".yml", ".json":
		return true
	default:
		// Recognize .openapi.yaml, .oas.json, etc.
		lower := strings.ToLower(uriToFSPath(uri))
		return strings.HasSuffix(lower, ".openapi.yaml") ||
			strings.HasSuffix(lower, ".openapi.yml") ||
			strings.HasSuffix(lower, ".openapi.json") ||
			strings.HasSuffix(lower, ".oas.yaml") ||
			strings.HasSuffix(lower, ".oas.yml") ||
			strings.HasSuffix(lower, ".oas.json")
	}
}

func extractTopLevelKeys(content []byte) map[string]bool {
	scan := content
	if len(scan) > 8192 {
		scan = scan[:8192]
	}
	keys := make(map[string]bool)
	s := string(scan)
	trimmed := strings.TrimLeft(s, " \t\r\n")
	if strings.HasPrefix(trimmed, "{") {
		for _, m := range topLevelKeyJSON.FindAllStringSubmatch(s, -1) {
			keys[m[1]] = true
		}
		return keys
	}
	for _, m := range topLevelKeyYAML.FindAllStringSubmatch(s, -1) {
		keys[m[1]] = true
	}
	return keys
}

func hasKey(keys map[string]bool, name string) bool {
	return keys[name]
}

// looksLikeKnownNonOpenAPI mirrors client/src/classifier.ts negative patterns.
func looksLikeKnownNonOpenAPI(content []byte) bool {
	keys := extractTopLevelKeys(content)
	if len(keys) == 0 {
		return false
	}
	if hasKey(keys, "apiVersion") && hasKey(keys, "kind") {
		return true
	}
	if hasKey(keys, "version") && hasKey(keys, "services") {
		return true
	}
	if hasKey(keys, "compilerOptions") {
		return true
	}
	if hasKey(keys, "on") && hasKey(keys, "jobs") {
		return true
	}
	if hasKey(keys, "name") && hasKey(keys, "version") &&
		(hasKey(keys, "dependencies") || hasKey(keys, "devDependencies")) {
		return true
	}
	if hasKey(keys, "rules") && (hasKey(keys, "extends") || hasKey(keys, "plugins")) {
		return true
	}
	if hasKey(keys, "semi") || hasKey(keys, "tabWidth") || hasKey(keys, "singleQuote") || hasKey(keys, "trailingComma") {
		return true
	}
	if hasKey(keys, "presets") && !hasKey(keys, "openapi") && !hasKey(keys, "swagger") {
		return true
	}
	if hasKey(keys, "testEnvironment") || hasKey(keys, "testMatch") || hasKey(keys, "testPathIgnorePatterns") {
		return true
	}
	if (hasKey(keys, "entry") && hasKey(keys, "output")) ||
		(hasKey(keys, "module") && hasKey(keys, "rules") && !hasKey(keys, "openapi")) {
		return true
	}
	return false
}
