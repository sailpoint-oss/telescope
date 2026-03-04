// Package lsp wires the gossip framework with the Telescope OpenAPI model,
// rules, and all LSP feature handlers.
package lsp

import (
	"context"
	"log/slog"
	"path/filepath"
	"strings"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	ts_json "github.com/tree-sitter/tree-sitter-json/bindings/go"
	ts_yaml "github.com/tree-sitter-grammars/tree-sitter-yaml/bindings/go"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/middleware"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/extensions"
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
func telescopeSetup(cfg *config.Config, indexCache *openapi.IndexCache, rsMgr *RulesetManager, pluginHost *plugin.Host, extRegistry *extensions.Registry, addlValidator *validation.AdditionalValidator, projMgr *project.Manager, childMgr *ChildLSPManager) gossip.Option {
	return func(s *gossip.Server) {
		// Bind the DiagnosticEngine now that WithTreeSitter has been applied.
		// This must happen here (inside an Option) because gossip.NewServer
		// stores options without applying them -- Serve() applies them later.
		rsMgr.engine = s.DiagnosticEngine()

		// Wire the project manager's publish function to use PublishDirect.
		projMgr.SetPublish(s.DiagnosticEngine().PublishDirect)

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

		// Register additional validation analyzer (non-OpenAPI files)
		s.DiagnosticEngine().RegisterAnalyzer("additional-validation", addlValidator.Analyzer())

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

	indexCache := openapi.NewIndexCache()

	// Create a temporary RulesetManager; it gets the real engine during
	// telescopeSetup once gossip has initialized the DiagnosticEngine.
	rsMgr := &RulesetManager{logger: logger}
	pluginHost := plugin.NewHost(logger)
	extRegistry := extensions.NewRegistry()
	addlValidator := validation.NewAdditionalValidator(logger)
	projMgr := project.NewManager(indexCache, logger)

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
					Language:   jsonLang,
					Extensions: []string{".json"},
					LanguageID: "json",
				},
			},
		}),
		gossip.WithLogger(logger),
		gossip.WithMiddleware(middleware.Logging(logger), middleware.Recovery()),
		gossip.WithCompletionTriggerCharacters("$", "/", "#", ":"),
		gossip.WithSemanticTokensLegend(semanticTokensLegend),
		telescopeSetup(cfg, indexCache, rsMgr, pluginHost, extRegistry, addlValidator, projMgr, childMgr),
	)

	// Register document sync handlers to forward to child LSPs.
	s.OnDidOpen(func(ctx *gossip.Context, params *protocol.DidOpenTextDocumentParams) error {
		childMgr.DidOpen(context.Background(), params)
		return nil
	})
	s.OnDidChange(func(ctx *gossip.Context, params *protocol.DidChangeTextDocumentParams) error {
		childMgr.DidChange(context.Background(), params)
		return nil
	})
	s.OnDidClose(func(ctx *gossip.Context, params *protocol.DidCloseTextDocumentParams) error {
		childMgr.DidClose(context.Background(), params)
		return nil
	})

	// Register an initialization hook that loads rulesets from the workspace,
	// registers dynamic file watchers, and starts child LSPs.
	s.OnInitialized(func(ctx *gossip.Context) {
		// Wire the aggregator's publish to the real client proxy, and redirect
		// the diagnostic engine's output through the aggregator so telescope's
		// own diagnostics are merged with child LSP diagnostics.
		childMgr.Aggregator().SetPublishFunc(ctx.Client.PublishDiagnostics)
		ctx.Server().DiagnosticEngine().SetPublish(func(bgCtx context.Context, params *protocol.PublishDiagnosticsParams) error {
			childMgr.Aggregator().Set(params.URI, "telescope", params.Diagnostics)
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

			// Start child YAML/JSON language servers for enhanced syntax and
			// schema diagnostics. Runs in background to avoid blocking init.
			go childMgr.Start(context.Background(), root)

			// Start background workspace scan and project building.
			go projMgr.Initialize(rootPath, cfg.Exclude)
		}
		registerFileWatchers(ctx)
	})

	// Register LSP feature handlers (these don't need tree-sitter to be initialized)
	s.OnHover(NewHoverHandler(indexCache))
	s.OnCompletion(NewCompletionHandler(indexCache))
	s.OnDefinition(NewDefinitionHandler(indexCache))
	s.OnReferences(NewReferencesHandler(indexCache))
	s.OnCodeAction(NewCodeActionHandler(indexCache))
	s.OnDocumentSymbol(NewSymbolHandler(indexCache))
	s.OnCodeLens(NewCodeLensHandler(indexCache))
	s.OnDocumentLink(NewDocumentLinkHandler(indexCache))
	s.OnRename(NewRenameHandler(indexCache))
	s.OnPrepareRename(NewPrepareRenameHandler(indexCache))
	s.OnInlayHint(NewInlayHintHandler(indexCache))
	s.OnSemanticTokens(NewSemanticTokensHandler(indexCache))
	s.OnFoldingRange(NewFoldingRangeHandler(indexCache))
	s.OnExecuteCommand(NewExecuteCommandHandler(indexCache))
	s.OnCompletionResolve(NewCompletionResolveHandler(indexCache))
	s.OnDocumentHighlight(NewDocumentHighlightHandler(indexCache))
	s.OnWorkspaceSymbol(NewWorkspaceSymbolHandler(indexCache))
	s.OnPrepareCallHierarchy(NewPrepareCallHierarchyHandler(indexCache))
	s.OnCallHierarchyIncoming(NewCallHierarchyIncomingHandler(indexCache))
	s.OnCallHierarchyOutgoing(NewCallHierarchyOutgoingHandler(indexCache))
	s.OnSelectionRange(NewSelectionRangeHandler(indexCache))
	s.OnLinkedEditingRange(NewLinkedEditingRangeHandler(indexCache))
	s.OnSemanticTokensRange(NewSemanticTokensRangeHandler(indexCache))
	s.OnFormatting(NewFormattingHandler(indexCache))
	s.OnTypeDefinition(NewTypeDefinitionHandler(indexCache))

	return s
}

func uriToFSPath(uri string) string {
	if strings.HasPrefix(uri, "file://") {
		return strings.TrimPrefix(uri, "file://")
	}
	return uri
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
