/**
 * Telescope Language Server - Direct LSP Implementation
 *
 * This is the main entry point for the Telescope language server.
 * It uses vscode-languageserver directly with yaml-language-server for base features.
 *
 * Architecture:
 * - yaml-language-server provides base YAML/JSON features (folding, selection, etc.)
 * - OpenAPI-specific features are layered on top (diagnostics, $ref navigation, etc.)
 * - Results are merged where appropriate (hover, completions, symbols)
 *
 * Features:
 * - OpenAPI document validation with 38+ built-in rules
 * - Code navigation (go to definition, find references)
 * - Hover information with $ref previews
 * - Completions for $ref, status codes, media types
 * - Code actions and quick fixes
 * - Semantic tokens for enhanced highlighting
 * - Workspace diagnostics
 *
 * @module server
 */

import {
	createConnection,
	type InitializeParams,
	type InitializeResult,
	ProposedFeatures,
	TextDocumentSyncKind,
	TextDocuments,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import { TelescopeContext } from "./lsp/context.js";
import { DocumentCache } from "./lsp/document-cache.js";
import { registerCodeActionHandlers } from "./lsp/handlers/code-actions.js";
import { registerCodeLensHandlers } from "./lsp/handlers/code-lens.js";
import { registerCompletionHandlers } from "./lsp/handlers/completions.js";
import { registerDiagnosticHandlers } from "./lsp/handlers/diagnostics.js";
import { registerDocumentLinkHandlers } from "./lsp/handlers/document-links.js";
import { registerFoldingRangeHandlers } from "./lsp/handlers/folding-ranges.js";
import { registerHoverHandler } from "./lsp/handlers/hover.js";
import { registerInlayHintHandlers } from "./lsp/handlers/inlay-hints.js";
import { registerNavigationHandlers } from "./lsp/handlers/navigation.js";
import { registerRenameHandlers } from "./lsp/handlers/rename.js";
import { registerSelectionRangeHandlers } from "./lsp/handlers/selection-ranges.js";
import {
	getSemanticTokensLegend,
	registerSemanticTokenHandlers,
} from "./lsp/handlers/semantic-tokens.js";
import { registerSymbolHandlers } from "./lsp/handlers/symbols.js";
import { DiagnosticsScheduler } from "./lsp/services/diagnostics-scheduler.js";
import { ReferencesIndex } from "./lsp/services/references-index.js";
import { WorkspaceProject } from "./lsp/workspace/workspace-project.js";
import type { NotifyFileChangeParams, SetOpenAPIFilesParams } from "./types.js";

// ============================================================================
// Server Setup
// ============================================================================

// Create connection with full protocol support
const connection = createConnection(ProposedFeatures.all);

// Create document manager
const documents = new TextDocuments(TextDocument);

// Create shared context and cache
const ctx = new TelescopeContext(connection);
const cache = new DocumentCache(ctx);
let workspaceProject: WorkspaceProject | undefined;
const diagnosticsScheduler = new DiagnosticsScheduler({
	maxRootConcurrency: 2,
});
let referencesIndex: ReferencesIndex | undefined;

// ============================================================================
// Initialization
// ============================================================================

connection.onInitialize((params: InitializeParams): InitializeResult => {
	ctx.initialize(params);

	const logger = ctx.getLogger("Main");
	logger.log("Initializing Telescope Language Server");

	// Create per-workspace project model (one server instance per folder).
	const initOpts = params.initializationOptions as
		| { workspaceFolder?: string }
		| undefined;
	const workspaceFolderUri =
		initOpts?.workspaceFolder ??
		params.workspaceFolders?.[0]?.uri ??
		params.rootUri ??
		"";
	workspaceProject = new WorkspaceProject({ workspaceFolderUri });
	referencesIndex = new ReferencesIndex(
		workspaceProject.getFileSystem(),
		workspaceProject.getDocumentTypeCache(),
		() => ctx.getKnownOpenAPIFiles(),
	);

	return {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,

			// Diagnostics
			diagnosticProvider: {
				interFileDependencies: true,
				workspaceDiagnostics: true,
			},

			// Hover
			hoverProvider: true,

			// Completions
			completionProvider: {
				triggerCharacters: ['"', "'", "#", "/", ":"],
				resolveProvider: false,
			},

			// Navigation
			definitionProvider: true,
			referencesProvider: true,

			// Document Links
			documentLinkProvider: {
				resolveProvider: true,
			},

			// Code Actions
			codeActionProvider: {
				codeActionKinds: ["quickfix", "source.organizeImports"],
			},

			// Rename
			renameProvider: {
				prepareProvider: true,
			},

			// Code Lens
			codeLensProvider: {
				resolveProvider: false,
			},

			// Inlay Hints
			inlayHintProvider: {
				resolveProvider: false,
			},

			// Symbols
			documentSymbolProvider: true,
			workspaceSymbolProvider: {},

			// Call Hierarchy
			callHierarchyProvider: true,

			// Semantic Tokens
			semanticTokensProvider: {
				legend: getSemanticTokensLegend(),
				full: true,
			},

			// Folding and Selection (delegated to YAML service)
			foldingRangeProvider: true,
			selectionRangeProvider: true,
		},
	};
});

connection.onInitialized(() => {
	const logger = ctx.getLogger("Main");
	logger.log("Server initialized");

	// Register workspace folder change handler if client supports it
	if (ctx.hasWorkspaceFolderCapability()) {
		connection.workspace.onDidChangeWorkspaceFolders((event) => {
			logger.log(
				`Workspace folders changed: +${event.added.length} -${event.removed.length}`,
			);

			// Clear state when workspace changes
			cache.clear();
			ctx.clearRootDocuments();
			ctx.clearKnownOpenAPIFiles();
			ctx.resetInitialScan();
			diagnosticsScheduler.clear();
			referencesIndex?.clear();
		});
	}
});

// ============================================================================
// Register Feature Handlers
// ============================================================================

// Core handlers (use document cache)
registerDiagnosticHandlers(
	connection,
	documents,
	ctx,
	() => {
		if (!workspaceProject) {
			throw new Error("WorkspaceProject not initialized yet");
		}
		return workspaceProject;
	},
	diagnosticsScheduler,
);
registerNavigationHandlers(connection, documents, cache, ctx);
registerHoverHandler(connection, documents, cache, ctx, () => {
	if (!workspaceProject) {
		throw new Error("WorkspaceProject not initialized yet");
	}
	return workspaceProject;
});
registerCompletionHandlers(connection, documents, cache, ctx);
registerCodeActionHandlers(connection, documents, cache, ctx);
registerCodeLensHandlers(connection, documents, cache, ctx, () => {
	if (!referencesIndex) {
		throw new Error("ReferencesIndex not initialized yet");
	}
	return referencesIndex;
});
registerInlayHintHandlers(connection, documents, cache);
registerRenameHandlers(connection, documents, cache, ctx);
registerSymbolHandlers(connection, documents, cache, ctx);
registerSemanticTokenHandlers(connection, documents, cache, ctx);
registerDocumentLinkHandlers(connection, documents, cache, ctx);

// YAML service handlers (delegate to yaml-language-server)
registerFoldingRangeHandlers(connection, documents, ctx);
registerSelectionRangeHandlers(connection, documents, ctx);

// ============================================================================
// Document Lifecycle
// ============================================================================

documents.onDidChangeContent((change) => {
	cache.invalidate(change.document.uri);
	ctx.markAffected(change.document.uri);
	workspaceProject?.notifyFileChange(change.document.uri);
	diagnosticsScheduler.invalidateForDocument(change.document.uri);
	referencesIndex?.invalidate(change.document.uri);
});

documents.onDidClose((event) => {
	cache.remove(event.document.uri);
});

documents.onDidOpen((event) => {
	const doc = event.document;
	const cached = cache.get(doc);

	// Track root documents
	if (cached.documentType === "root") {
		ctx.addRootDocument(doc.uri);
	}
});

// ============================================================================
// Custom Protocol Handlers
// ============================================================================

/**
 * Handle telescope/setOpenAPIFiles request from client.
 * This is the primary mechanism for client→server sync of discovered OpenAPI files.
 */
connection.onRequest(
	"telescope/setOpenAPIFiles",
	(params: SetOpenAPIFilesParams) => {
		const logger = ctx.getLogger("Main");
		logger.log(
			`Received telescope/setOpenAPIFiles with ${params.files.length} files`,
		);
		ctx.setKnownOpenAPIFiles(params.files);
		workspaceProject?.setCandidateOpenApiFiles(params.files);
		diagnosticsScheduler.clear();
		referencesIndex?.clear();

		// Mark all files as affected so workspace diagnostics will re-run
		for (const uri of params.files) {
			ctx.markAffected(uri);
		}

		return { success: true, fileCount: params.files.length };
	},
);

/**
 * Handle telescope/notifyFileChange notification from client.
 * Used for file changes that might not be caught by standard LSP file watching.
 */
connection.onNotification(
	"telescope/notifyFileChange",
	(params: NotifyFileChangeParams) => {
		const logger = ctx.getLogger("Main");
		logger.log(`File change notification: ${params.type} ${params.uri}`);

		switch (params.type) {
			case "created":
				ctx.addKnownOpenAPIFile(params.uri);
				ctx.markAffected(params.uri);
				workspaceProject?.notifyFileChange(params.uri);
				diagnosticsScheduler.invalidateForDocument(params.uri);
				referencesIndex?.invalidate(params.uri);
				break;
			case "deleted":
				ctx.removeKnownOpenAPIFile(params.uri);
				ctx.removeRootDocument(params.uri);
				cache.remove(params.uri);
				workspaceProject?.notifyFileChange(params.uri);
				diagnosticsScheduler.invalidateForDocument(params.uri);
				referencesIndex?.invalidate(params.uri);
				break;
			case "changed":
				cache.invalidate(params.uri);
				ctx.markAffected(params.uri);
				workspaceProject?.notifyFileChange(params.uri);
				diagnosticsScheduler.invalidateForDocument(params.uri);
				referencesIndex?.invalidate(params.uri);
				break;
		}
	},
);

/**
 * Handle telescope/getProjectInfo request - returns info about the current project state.
 */
connection.onRequest("telescope/getProjectInfo", () => {
	return {
		knownOpenAPIFiles: ctx.getKnownOpenAPIFiles().length,
		rootDocuments: ctx.getRootDocumentUris().length,
		hasClientFileList: ctx.hasClientFileList(),
		workspacePath: ctx.getWorkspacePath(),
		cachedDocuments: cache.size,
	};
});

// ============================================================================
// Configuration Change Handling
// ============================================================================

connection.onDidChangeConfiguration(() => {
	const logger = ctx.getLogger("Main");
	const changed = ctx.reloadConfiguration();
	if (changed) {
		logger.log("Configuration changed - rules will be reloaded");
		// Clear caches
		cache.clear();
		ctx.clearAffectedUris();
		diagnosticsScheduler.clear();
		referencesIndex?.clear();
	}
});

// ============================================================================
// Start Server
// ============================================================================

// Listen for documents
documents.listen(connection);

// Listen for connection
connection.listen();
