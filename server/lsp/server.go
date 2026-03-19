// Package lsp wires the gossip framework with the Telescope OpenAPI model,
// rules, and all LSP feature handlers.
package lsp

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"path/filepath"
	"strings"
	"time"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	ts_yaml "github.com/sailpoint-oss/tree-sitter-openapi/bindings/go/openapi"
	ts_json "github.com/sailpoint-oss/tree-sitter-openapi/bindings/go/openapi_json"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/middleware"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/core/graph"
	"github.com/sailpoint-oss/telescope/server/extensions"
	"github.com/sailpoint-oss/telescope/server/lsp/bun"
	"github.com/sailpoint-oss/telescope/server/lsp/observe"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/plugin"
	"github.com/sailpoint-oss/telescope/server/project"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/rules/analyzers"
	"github.com/sailpoint-oss/telescope/server/rules/checks"
	"github.com/sailpoint-oss/telescope/server/validation"
)

// Version is set at build time.
var Version = "dev"

// telescopeSetup is a gossip Option that wires the OpenAPI index and rules
// after the tree-sitter manager has been initialized by WithTreeSitter.
func telescopeSetup(cfg *config.Config, indexCache *openapi.IndexCache, rsMgr *RulesetManager, pluginHost *plugin.Host, extRegistry *extensions.Registry, addlValidator *validation.AdditionalValidator, projMgr *project.Manager, childMgr *ChildLSPManager, graphBridge *GraphBridge, bunMgr *bun.Manager, workspaceRootPtr *string) gossip.Option {
	return func(s *gossip.Server) {
		// Bind the DiagnosticEngine now that WithTreeSitter has been applied.
		// This must happen here (inside an Option) because gossip.NewServer
		// stores options without applying them -- Serve() applies them later.
		rsMgr.engine = s.DiagnosticEngine()

		// Wire the project manager's publish function to use PublishDirect.
		projMgr.SetPublish(s.DiagnosticEngine().PublishDirect)
		projMgr.SetShouldPublish(func(uri string) bool {
			// Open documents are diagnosed by the tree-sitter diagnostic engine.
			// Suppress project-manager publishes for them to avoid competing updates.
			return s.Documents().Get(protocol.DocumentURI(uri)) == nil
		})

		// Register a builder so cache.Get() builds the index on-demand
		// if it hasn't been cached yet (handles the init race window).
		indexCache.SetBuilder(func(uri protocol.DocumentURI) *openapi.Index {
			doc := s.Documents().Get(uri)
			tree := s.TreeSitter().GetTree(uri)
			if doc == nil || tree == nil {
				return nil
			}
			return openapi.BuildIndex(tree, doc)
		})

		// Wire UserData so Analyzers receive the OpenAPI index and an
		// optional cross-file resolver from the project manager.
		s.DiagnosticEngine().SetUserDataProvider(func(uri protocol.DocumentURI) interface{} {
			doc := s.Documents().Get(uri)
			if doc == nil {
				return nil
			}
			tree := s.TreeSitter().GetTree(uri)
			if tree == nil {
				return nil
			}
			idx := openapi.BuildIndex(tree, doc)
			indexCache.Set(uri, idx)

			// Sync edges from the newly built index into the V2 graph engine
			// and build a fresh snapshot for sync request handlers.
			graphBridge.SyncEdgesFromIndex(string(uri), idx)
			graphBridge.BuildSnapshot()

			// Send deprecated ranges notification to the client.
			if conn := s.Conn(); conn != nil {
				deprecatedRanges := collectDeprecatedRanges(idx)
				if deprecatedRanges == nil {
					deprecatedRanges = []DeprecatedRange{}
				}
				_ = conn.Notify(context.Background(), "telescope/deprecatedRanges", DeprecatedRangesParams{
					URI:    string(uri),
					Ranges: deprecatedRanges,
				})
			}

			data := &rules.AnalysisData{
				Index:  idx,
				DocURI: string(uri),
			}
			if resolver := projMgr.ResolverForFile(string(uri)); resolver != nil {
				data.Resolver = resolver
			}
			return data
		})

		// Clean up index on document close
		s.Documents().OnClose(func(uri protocol.DocumentURI) {
			indexCache.Delete(uri)
		})

		// Register all rules unconditionally; filtering is handled by the
		// DiagnosticTransformer installed by the RulesetManager.
		checks.RegisterAll(s)
		analyzers.RegisterAll(s)

		// Register the Spectral custom rule engine as an analyzer
		spectralEng := rsMgr.SpectralEngine()
		s.DiagnosticEngine().RegisterAnalyzer("spectral-custom", spectralEng.Analyzer())

		// Register the external plugin host analyzer
		s.DiagnosticEngine().RegisterAnalyzer("external-plugins", pluginHost.Analyzer())

		// Register the extension validation analyzer
		s.DiagnosticEngine().RegisterAnalyzer("extension-validation", extensions.Analyzer(extRegistry))

		// Register additional validation analyzer (non-OpenAPI files).
		s.DiagnosticEngine().RegisterAnalyzer("additional-validation", addlValidator.Analyzer())

		// Register Bun sidecar analyzer for custom TS rules and Spectral rulesets
		if bunMgr != nil {
			s.DiagnosticEngine().RegisterAnalyzer("bun-sidecar", bunSidecarAnalyzer(bunMgr, cfg, graphBridge, workspaceRootPtr))
		}

		// Set the Telescope config on the manager for merge priority
		rsMgr.SetTelescopeConfig(cfg)

		// Register file watchers for ruleset hot-reload
		s.OnDidChangeWatchedFiles(NewWatchedFilesHandler(rsMgr, projMgr, s.Logger()))
	}
}

// NewServer creates a fully wired Telescope LSP server.
func NewServer(cfg *config.Config, logger *slog.Logger) *gossip.Server {
	yamlLang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	jsonLang := tree_sitter.NewLanguage(unsafe.Pointer(ts_json.Language()))

	var workspaceRootStr string

	indexCache := openapi.NewIndexCache()

	// Create a temporary RulesetManager; it gets the real engine during
	// telescopeSetup once gossip has initialized the DiagnosticEngine.
	rsMgr := &RulesetManager{logger: logger}
	pluginHost := plugin.NewHost(logger)
	extRegistry := extensions.NewRegistry()
	addlValidator := validation.NewAdditionalValidator(logger)
	projMgr := project.NewManager(indexCache, logger)
	bunMgr := bun.NewManager(logger)

	// V2 graph engine: runs alongside the existing IndexCache/ProjectManager
	// during the migration period. Handlers can opt-in to using graphBridge.
	graphBridge := NewGraphBridge(logger)
	rulePerfTracker := observe.NewRulePerfTracker()

	// The ChildLSPManager publishes merged diagnostics. The publish function
	// is nil initially; it gets wired to the real ClientProxy in OnInitialized
	// once the server connection is established.
	childMgr := NewChildLSPManager(nil, logger)

	s := gossip.NewServer("telescope", Version,
		gossip.WithTreeSitter(treesitter.Config{
			Matchers: []treesitter.LanguageMatcher{
				{
					Language:   yamlLang,
					Extensions: []string{".yaml", ".yml"},
					LanguageID: "yaml",
				},
				{
					Language:   yamlLang,
					LanguageID: "openapi-yaml",
				},
				{
					Language:   jsonLang,
					Extensions: []string{".json"},
					LanguageID: "json",
				},
				{
					Language:   jsonLang,
					LanguageID: "openapi-json",
				},
			},
		}),
		gossip.WithLogger(logger),
		gossip.WithMiddleware(middleware.Logging(logger), middleware.Recovery(), observe.TraceID(logger)),
		gossip.WithCompletionTriggerCharacters("$", "/", "#", ":"),
		gossip.WithSemanticTokensLegend(semanticTokensLegend),
		telescopeSetup(cfg, indexCache, rsMgr, pluginHost, extRegistry, addlValidator, projMgr, childMgr, graphBridge, bunMgr, &workspaceRootStr),
	)

	// Register document sync handlers to forward to child LSPs and update
	// the V2 graph engine.
	s.OnDidOpen(func(ctx *gossip.Context, params *protocol.DidOpenTextDocumentParams) error {
		traceID := observe.NewTraceID()
		notifCtx := observe.WithTraceID(context.Background(), traceID)
		logger.Debug("telescope.didOpen",
			"trace_id", traceID,
			"uri", params.TextDocument.URI,
			"languageID", params.TextDocument.LanguageID)
		childMgr.DidOpen(notifCtx, params)
		uri := string(params.TextDocument.URI)
		content := []byte(params.TextDocument.Text)
		graphBridge.OnDocumentOpen(uri, content)
		sendClassifyNotification(ctx, graphBridge, uri, content)
		return nil
	})
	s.OnDidChange(func(ctx *gossip.Context, params *protocol.DidChangeTextDocumentParams) error {
		traceID := observe.NewTraceID()
		notifCtx := observe.WithTraceID(context.Background(), traceID)
		logger.Debug("telescope.didChange", "trace_id", traceID, "uri", params.TextDocument.URI)
		childMgr.DidChange(notifCtx, params)
		if doc := ctx.Documents.Get(params.TextDocument.URI); doc != nil {
			uri := string(params.TextDocument.URI)
			content := []byte(doc.Text())
			graphBridge.OnDocumentChange(uri, content)
			sendClassifyNotification(ctx, graphBridge, uri, content)
		}
		return nil
	})
	s.OnDidClose(func(ctx *gossip.Context, params *protocol.DidCloseTextDocumentParams) error {
		traceID := observe.NewTraceID()
		notifCtx := observe.WithTraceID(context.Background(), traceID)
		logger.Debug("telescope.didClose", "trace_id", traceID, "uri", params.TextDocument.URI)
		childMgr.DidClose(notifCtx, params)
		graphBridge.OnDocumentClose(string(params.TextDocument.URI))
		return nil
	})

	// Register an initialization hook that loads rulesets from the workspace,
	// registers dynamic file watchers, and starts child LSPs.
	s.OnInitialized(func(ctx *gossip.Context) {
		workspaceRootStr = protocol.URIToPath(protocol.NormalizeURI(ctx.WorkspaceRoot()))
		logger.Info("telescope server initialized",
			"version", Version,
			"workspace", string(ctx.WorkspaceRoot()),
		)

		// Register snapshot callback for observability
		graphBridge.OnSnapshot(func(snap *graph.Snapshot) {
			logger.Debug("graph snapshot built",
				"id", snap.ID,
				"nodes", len(snap.Nodes),
				"roots", len(snap.Roots),
			)
		})

		// Wire the aggregator's publish to the real client proxy, and redirect
		// the diagnostic engine's output through the aggregator so telescope's
		// own diagnostics are merged with child LSP diagnostics.
		childMgr.Aggregator().SetPublishFunc(ctx.Client.PublishDiagnostics)
		childMgr.Aggregator().SetLogger(logger)
		ctx.Server().DiagnosticEngine().SetPublish(func(bgCtx context.Context, params *protocol.PublishDiagnosticsParams) error {
			logger.Debug("telescope.diagToAggregator",
				"trace_id", observe.GetTraceID(bgCtx),
				"uri", params.URI,
				"count", len(params.Diagnostics))
			// Enrich diagnostics with RelatedInformation for $ref context
			enrichedDiags := enrichDiagsWithRefContext(graphBridge, string(params.URI), params.Diagnostics)
			childMgr.Aggregator().Set(params.URI, "telescope", enrichedDiags)
			return nil
		})

		root := string(ctx.WorkspaceRoot())
		rootPath := uriToFSPath(root)
		if rootPath != "" {
			if err := rsMgr.Load(rootPath); err != nil {
				logger.Warn("failed to load rulesets on init", "root", rootPath, "error", err)
			}

			// Discover external plugins from .telescope/plugins/
			pluginDir := filepath.Join(rootPath, ".telescope", "plugins")
			if err := pluginHost.Discover(pluginDir); err != nil {
				logger.Warn("failed to discover plugins", "dir", pluginDir, "error", err)
			}

			// Load built-in vendor extensions and user extension schemas
			if err := extensions.LoadBuiltins(extRegistry); err != nil {
				logger.Warn("failed to load builtin extensions", "error", err)
			}
			extDir := filepath.Join(rootPath, ".telescope", "extensions")
			if err := extensions.LoadDir(extDir, extRegistry, logger); err != nil {
				logger.Warn("failed to load extension schemas", "error", err)
			}
			if len(cfg.OpenAPI.Extensions.Required) > 0 {
				extRegistry.SetRequired(cfg.OpenAPI.Extensions.Required)
			}

			// Configure additional validation for non-OpenAPI files
			if len(cfg.AdditionalValidation) > 0 {
				groups := make(map[string]validation.ValidationGroup, len(cfg.AdditionalValidation))
				for name, g := range cfg.AdditionalValidation {
					schemas := make([]validation.SchemaPatternMapping, len(g.Schemas))
					for i, s := range g.Schemas {
						schemas[i] = validation.SchemaPatternMapping{
							Schema:   s.Schema,
							Patterns: s.Patterns,
						}
					}
					groups[name] = validation.ValidationGroup{
						Patterns: g.Patterns,
						Schemas:  schemas,
					}
				}
				if err := addlValidator.Configure(rootPath, groups); err != nil {
					logger.Warn("failed to configure additional validation", "error", err)
				}
			}

			// Also load explicitly configured plugins
			for _, p := range cfg.Plugins {
				pluginPath := p
				if !filepath.IsAbs(pluginPath) {
					pluginPath = filepath.Join(rootPath, pluginPath)
				}
				if err := pluginHost.LoadPlugin(pluginPath); err != nil {
					logger.Warn("failed to load configured plugin", "path", p, "error", err)
				}
			}

			// Start Bun sidecar for custom rules and Spectral rulesets
			if cfg.NeedsBunSidecar() && bunMgr != nil {
				telescopeDir := filepath.Join(rootPath, ".telescope")
				go func() {
					if err := bunMgr.Start(context.Background()); err != nil {
						logger.Warn("failed to start bun sidecar", "error", err)
						return
					}
					loadReq := buildLoadRulesRequest(cfg, telescopeDir)
					if loadReq != nil {
						if err := bunMgr.LoadRules(context.Background(), loadReq); err != nil {
							logger.Warn("failed to load custom rules", "error", err)
						}
					}
					if s.DiagnosticEngine() != nil {
						s.DiagnosticEngine().InvalidateAll()
					}
					bunMgr.WatchRules(context.Background(), telescopeDir, func() {
						reloadReq := buildLoadRulesRequest(cfg, telescopeDir)
						if reloadReq != nil {
							if err := bunMgr.LoadRules(context.Background(), reloadReq); err != nil {
								logger.Warn("failed to reload custom rules", "error", err)
							}
						}
						if s.DiagnosticEngine() != nil {
							s.DiagnosticEngine().InvalidateAll()
						}
					})
				}()
			}

			// Start child YAML/JSON language servers for enhanced syntax and
			// schema diagnostics. Runs in background to avoid blocking init.
			go childMgr.Start(context.Background(), root)

			// Collect analyzers for startup diagnostics on all discovered files.
			collectedAnalyzers := rules.CollectAnalyzers(analyzers.RegisterAll)
			projMgr.SetAnalyzers(collectedAnalyzers)

			// Start background workspace scan and project building.
			go func() {
				start := time.Now()
				projMgr.Initialize(rootPath, cfg.Exclude)
				logger.Info("project initialization complete", "elapsed", time.Since(start).String())
			}()
		}
		registerFileWatchers(ctx)

		// Force re-evaluation of any documents that were opened during the
		// initialized race window. This ensures their indexes are built and
		// cached even if their initial onTreeUpdate ran before SetPublish.
		if s.DiagnosticEngine() != nil {
			s.DiagnosticEngine().InvalidateAll()
		}
	})

	// Register LSP feature handlers (these don't need tree-sitter to be initialized)
	s.OnHover(NewHoverHandler(indexCache, graphBridge))
	s.OnCompletion(NewCompletionHandler(indexCache, graphBridge))
	s.OnDefinition(NewDefinitionHandler(indexCache, projMgr, graphBridge))
	s.OnReferences(NewReferencesHandler(indexCache, graphBridge))
	s.OnCodeAction(NewCodeActionHandler(indexCache, graphBridge))
	s.OnDocumentSymbol(NewSymbolHandler(indexCache, graphBridge))
	s.OnCodeLens(NewCodeLensHandler(indexCache, graphBridge))
	s.OnDocumentLink(NewDocumentLinkHandler(indexCache, graphBridge))
	s.OnRename(NewRenameHandler(indexCache, graphBridge))
	s.OnPrepareRename(NewPrepareRenameHandler(indexCache, graphBridge))
	s.OnInlayHint(NewInlayHintHandler(indexCache, graphBridge))
	s.OnSemanticTokens(NewSemanticTokensHandler(indexCache, graphBridge))
	s.OnFoldingRange(NewFoldingRangeHandler(indexCache, graphBridge))
	s.OnExecuteCommand(NewExecuteCommandHandler(indexCache, graphBridge))
	s.OnCompletionResolve(NewCompletionResolveHandler(indexCache, graphBridge))
	s.OnDocumentHighlight(NewDocumentHighlightHandler(indexCache, graphBridge))
	s.OnWorkspaceSymbol(NewWorkspaceSymbolHandler(indexCache, graphBridge))
	s.OnPrepareCallHierarchy(NewPrepareCallHierarchyHandler(indexCache, graphBridge))
	s.OnCallHierarchyIncoming(NewCallHierarchyIncomingHandler(indexCache, graphBridge))
	s.OnCallHierarchyOutgoing(NewCallHierarchyOutgoingHandler(indexCache, graphBridge))
	s.OnSelectionRange(NewSelectionRangeHandler(indexCache, graphBridge))
	s.OnLinkedEditingRange(NewLinkedEditingRangeHandler(indexCache, graphBridge))
	s.OnSemanticTokensRange(NewSemanticTokensRangeHandler(indexCache, graphBridge))
	s.OnFormatting(NewFormattingHandler(indexCache, graphBridge))
	s.OnTypeDefinition(NewTypeDefinitionHandler(indexCache, projMgr, graphBridge))

	// Custom observability requests for debug tooling
	s.HandleRequest("$/telescope/graphInfo", func(ctx *gossip.Context, _ json.RawMessage) (any, error) {
		info := observe.CollectGraphInfo(graphBridge.Graph(), graphBridge.CurrentSnapshot())
		return info, nil
	})
	s.HandleRequest("$/telescope/rulePerf", func(ctx *gossip.Context, _ json.RawMessage) (any, error) {
		perf := rulePerfTracker.Collect()
		return perf, nil
	})

	return s
}

// bunSidecarAnalyzer creates a gossip Analyzer that delegates to the Bun sidecar
// for custom TypeScript rules and Spectral rulesets.
func bunSidecarAnalyzer(bunMgr *bun.Manager, cfg *config.Config, graphBridge *GraphBridge, workspaceRoot *string) treesitter.Analyzer {
	type ruleWithPatterns struct {
		id       string
		patterns []string
	}

	var allRules []ruleWithPatterns

	for _, r := range cfg.OpenAPI.Rules {
		if r.Rule != "" {
			allRules = append(allRules, ruleWithPatterns{
				id:       strings.TrimSuffix(r.Rule, filepath.Ext(r.Rule)),
				patterns: cfg.OpenAPI.Patterns,
			})
		}
	}
	for _, g := range cfg.AdditionalValidation {
		for _, r := range g.Rules {
			if r.Rule != "" {
				allRules = append(allRules, ruleWithPatterns{
					id:       strings.TrimSuffix(r.Rule, filepath.Ext(r.Rule)),
					patterns: g.Patterns,
				})
			}
		}
	}

	spectralRulesets := cfg.SpectralRulesets

	return treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			if !bunMgr.Available() || ctx.Document == nil {
				return nil
			}
			if workspaceRoot == nil || *workspaceRoot == "" {
				return nil
			}
			uri := string(ctx.Document.URI())

			var ruleIDs []string
			for _, r := range allRules {
				if matchesFilePatterns(uri, *workspaceRoot, r.patterns) {
					ruleIDs = append(ruleIDs, r.id)
				}
			}

			if len(ruleIDs) == 0 && len(spectralRulesets) == 0 {
				return nil
			}

			content := ctx.Document.Text()
			format := "yaml"
			if strings.HasSuffix(uri, ".json") {
				format = "json"
			}

			snap := graphBridge.CurrentSnapshot()
			node := graphBridge.Graph().Node(uri)

			var doc bun.SerializedDoc
			if node != nil && node.Raw != nil {
				doc = bun.SerializeDoc(uri, node, snap)
			} else {
				ast, err := bun.SerializeRawContent([]byte(content), format)
				if err != nil {
					return nil
				}
				version := ""
				if v, ok := ast["openapi"]; ok {
					version, _ = v.(string)
				}
				if version == "" {
					if v, ok := ast["swagger"]; ok {
						version, _ = v.(string)
					}
				}
				doc = bun.SerializedDoc{
					URI:      uri,
					AST:      ast,
					RawText:  content,
					Format:   format,
					Version:  version,
					Pointers: make(map[string][4]uint32),
				}
			}
			if doc.Version == "" {
				if v, ok := doc.AST["swagger"]; ok {
					doc.Version, _ = v.(string)
				}
			}

			var allDiags []protocol.Diagnostic

			if len(ruleIDs) > 0 {
				projectIdx := bun.SerializeIndex(snap)
				req := &bun.RunRulesRequest{
					DocumentURI: uri,
					RuleIDs:     ruleIDs,
					Document:    doc,
					Project:     projectIdx,
				}
				resp, err := bunMgr.RunRules(context.Background(), req)
				if err == nil && resp != nil {
					allDiags = append(allDiags, sidecarDiagsToProtocol(resp.Diagnostics)...)
				}
			}

			if len(spectralRulesets) > 0 {
				req := &bun.RunSpectralRequest{
					DocumentURI:  uri,
					Document:     doc,
					RulesetPaths: spectralRulesets,
				}
				resp, err := bunMgr.RunSpectral(context.Background(), req)
				if err == nil && resp != nil {
					allDiags = append(allDiags, sidecarDiagsToProtocol(resp.Diagnostics)...)
				}
			}

			return allDiags
		},
	}
}

// matchesFilePatterns checks if a document URI matches any of the given glob patterns
// relative to the workspace root. Used to scope sidecar rules to their configured files.
func matchesFilePatterns(docURI, workspaceRoot string, patterns []string) bool {
	if len(patterns) == 0 {
		return true
	}
	docPath := protocol.URIToPath(protocol.NormalizeURI(protocol.DocumentURI(docURI)))
	relPath := strings.TrimPrefix(docPath, workspaceRoot)
	relPath = strings.TrimPrefix(relPath, "/")
	for _, pattern := range patterns {
		if matched, _ := filepath.Match(pattern, relPath); matched {
			return true
		}
		if matched, _ := doubleStarMatch(pattern, relPath); matched {
			return true
		}
	}
	return false
}

// doubleStarMatch handles ** glob patterns by expanding them to match any path segment.
func doubleStarMatch(pattern, path string) (bool, error) {
	if !strings.Contains(pattern, "**") {
		return filepath.Match(pattern, path)
	}
	parts := strings.SplitN(pattern, "**", 2)
	prefix := parts[0]
	suffix := strings.TrimPrefix(parts[1], "/")
	if prefix != "" {
		if !strings.HasPrefix(path, prefix) {
			return false, nil
		}
		path = path[len(prefix):]
	}
	if suffix == "" {
		return true, nil
	}
	for i := 0; i <= len(path); i++ {
		if matched, _ := filepath.Match(suffix, path[i:]); matched {
			return true, nil
		}
	}
	return false, nil
}

func sidecarDiagsToProtocol(diags []bun.SidecarDiagnostic) []protocol.Diagnostic {
	result := make([]protocol.Diagnostic, 0, len(diags))
	for _, d := range diags {
		sev := protocol.DiagnosticSeverity(d.Severity)
		if sev < protocol.SeverityError || sev > protocol.SeverityHint {
			sev = protocol.SeverityWarning
		}
		pd := protocol.Diagnostic{
			Range: protocol.Range{
				Start: protocol.Position{Line: d.StartLine, Character: d.StartChar},
				End:   protocol.Position{Line: d.EndLine, Character: d.EndChar},
			},
			Severity: sev,
			Source:   d.Source,
			Message:  d.Message,
		}
		if d.Code != "" {
			pd.Code = d.Code
		}
		result = append(result, pd)
	}
	return result
}

// buildLoadRulesRequest creates a LoadRulesRequest from the config.
func buildLoadRulesRequest(cfg *config.Config, telescopeDir string) *bun.LoadRulesRequest {
	var rules []bun.RuleConfig

	for _, r := range cfg.OpenAPI.Rules {
		if r.Rule == "" {
			continue
		}
		rules = append(rules, bun.RuleConfig{
			ID:       strings.TrimSuffix(r.Rule, filepath.Ext(r.Rule)),
			Path:     filepath.Join(telescopeDir, "rules", r.Rule),
			Kind:     "openapi",
			Severity: r.Severity,
			Options:  r.Options,
		})
	}

	for _, g := range cfg.AdditionalValidation {
		for _, r := range g.Rules {
			if r.Rule == "" {
				continue
			}
			rules = append(rules, bun.RuleConfig{
				ID:       strings.TrimSuffix(r.Rule, filepath.Ext(r.Rule)),
				Path:     filepath.Join(telescopeDir, "rules", r.Rule),
				Kind:     "generic",
				Severity: r.Severity,
				Patterns: g.Patterns,
				Options:  r.Options,
			})
		}
	}

	if len(rules) == 0 {
		return nil
	}

	return &bun.LoadRulesRequest{
		Rules:   rules,
		WorkDir: filepath.Dir(telescopeDir),
	}
}

func uriToFSPath(uri string) string {
	u, err := url.Parse(uri)
	if err != nil {
		if strings.HasPrefix(uri, "file://") {
			return strings.TrimPrefix(uri, "file://")
		}
		return uri
	}
	if u.Scheme == "file" {
		return filepath.FromSlash(u.Path)
	}
	return uri
}

// enrichDiagsWithRefContext adds RelatedInformation to diagnostics when the
// document is referenced via $ref from other documents.
func enrichDiagsWithRefContext(bridge *GraphBridge, uri string, diags []protocol.Diagnostic) []protocol.Diagnostic {
	if bridge == nil {
		return diags
	}
	refEdges := bridge.EdgesTo(uri)
	if len(refEdges) == 0 {
		return diags
	}
	for i := range diags {
		for _, edge := range refEdges {
			if edge.SourceURI == uri {
				continue // skip self-references from local $ref
			}
			diags[i].RelatedInformation = append(diags[i].RelatedInformation, protocol.DiagnosticRelatedInformation{
				Location: protocol.Location{
					URI:   protocol.DocumentURI(edge.SourceURI),
					Range: protocol.FileStartRange,
				},
				Message: fmt.Sprintf("Referenced via $ref: %s", edge.RefValue),
			})
		}
	}
	return diags
}

// classifyNotification is the payload sent for $/telescope/classify.
type classifyNotification struct {
	URI        string  `json:"uri"`
	IsOpenAPI  bool    `json:"isOpenAPI"`
	Version    string  `json:"version"`
	IsFragment bool    `json:"isFragment"`
	Confidence float64 `json:"confidence"`
}

func sendClassifyNotification(ctx *gossip.Context, bridge *GraphBridge, uri string, content []byte) {
	classification := bridge.Classifier().Classify(uri, content, false)
	conn := ctx.Server().Conn()
	if conn == nil {
		return
	}
	conn.Notify(ctx, "$/telescope/classify", classifyNotification{
		URI:        uri,
		IsOpenAPI:  classification.IsOpenAPI,
		Version:    classification.OpenAPIVersion,
		IsFragment: classification.IsFragment,
		Confidence: classification.Confidence,
	})
}

var semanticTokensLegend = protocol.SemanticTokensLegend{
	TokenTypes: []string{
		"namespace",     // 0: path strings
		"type",          // 1: schema names
		"class",         // 2
		"enum",          // 3: response status codes
		"interface",     // 4
		"struct",        // 5
		"typeParameter", // 6: path parameters {param}
		"parameter",     // 7
		"variable",      // 8: $ref values
		"property",      // 9
		"function",      // 10: operationId values
		"method",        // 11: HTTP methods
		"macro",         // 12: security scheme names
		"keyword",       // 13: schema type values
		"modifier",      // 14: deprecated
		"string",        // 15
	},
	TokenModifiers: []string{
		"declaration",
		"definition",
		"readonly",
		"deprecated",
		"modification",
	},
}
