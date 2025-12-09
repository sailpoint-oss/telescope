import type {
	LanguagePlugin,
	LanguageServicePlugin,
} from "@volar/language-server";
import {
	createConnection,
	createServer,
	createSimpleProject,
} from "@volar/language-server/node";
import { createDataLanguagePlugin } from "./lsp/languages/data-language-plugin.js";
import { createOpenAPILanguagePlugin } from "./lsp/languages/openapi-language-plugin.js";

import { create as createJSONLanguageService } from "./lsp/services/json-service.js";
import { create as createMarkdownLanguageService } from "./lsp/services/markdown-service.js";
import { createOpenAPIServicePlugin } from "./lsp/services/openapi-service.js";
import { createValidationPlugin } from "./lsp/services/validation-service.js";
import { create as createYAMLLanguageService } from "./lsp/services/yaml-service.js";
import { ApertureVolarContext } from "./lsp/workspace/context.js";
import type {
	SetOpenAPIFilesParams,
	NotifyFileChangeParams,
} from "./types.js";

const connection = createConnection();
const server = createServer(connection);

const shared = new ApertureVolarContext(server);
const logger = shared.getLogger("Main");

// Build the array of Language Plugins
// OpenAPI plugin handles openapi-yaml and openapi-json languageIds (fast path)
// Data plugin handles generic yaml and json languageIds (with pattern matching)
const languagePlugins: LanguagePlugin[] = [
	createOpenAPILanguagePlugin(shared),
	createDataLanguagePlugin(shared),
];

logger.log(`Loading ${languagePlugins.length} language plugin(s)`);

// Build the array of Language Service Plugins
const languageServicePlugins: LanguageServicePlugin[] = [
	// Core language services for JSON/YAML features (hover, completion, etc.)
	createJSONLanguageService({ shared }),
	createYAMLLanguageService({ shared }),

	// Markdown support for OpenAPI descriptions
	createMarkdownLanguageService({ shared }),

	// OpenAPI rule-based diagnostics
	createOpenAPIServicePlugin({ shared }),

	// Additional validation (Telescope config, custom schemas, generic rules)
	createValidationPlugin({ shared }),
];

// Create a simple project with our language plugins
const project = createSimpleProject(languagePlugins);

logger.log(
	`Loading ${languageServicePlugins.length} language service plugin(s)`,
);

connection.onInitialize((params) => {
	logger.log(`Initializing the Volar Server`);
	const result = server.initialize(params, project, languageServicePlugins);

	// Set initial workspace folders from Volar's managed workspaceFolders
	shared.setWorkspaceFolders(server.workspaceFolders.all);

	return result;
});

connection.onInitialized(async () => {
	server.initialized();

	// Register file watchers for config files
	const configPatterns = ["**/.telescope/config.yaml"];
	try {
		await server.fileWatcher.watchFiles(configPatterns);
		logger.log(
			`Registered file watchers for config files: ${configPatterns.join(", ")}`,
		);
	} catch (error) {
		logger.error(
			`Failed to register file watchers: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
});

// ============================================================================
// Custom LSP Protocol Handlers
// ============================================================================

/**
 * Handle aperture/setOpenAPIFiles request from client.
 * This is the primary mechanism for client→server sync of discovered OpenAPI files.
 * The client scans the workspace, classifies files, and sends the list here.
 */
connection.onRequest(
	"aperture/setOpenAPIFiles",
	(params: SetOpenAPIFilesParams) => {
		logger.log(
			`Received aperture/setOpenAPIFiles with ${params.files.length} files`,
		);
		shared.setKnownOpenAPIFiles(params.files);

		// Mark all files as affected so workspace diagnostics will re-run
		for (const uri of params.files) {
			shared.workspaceIndex.markAffected(uri);
		}

		return { success: true, fileCount: params.files.length };
	},
);

/**
 * Handle aperture/notifyFileChange notification from client.
 * Used for file changes that might not be caught by standard LSP file watching.
 */
connection.onNotification(
	"aperture/notifyFileChange",
	(params: NotifyFileChangeParams) => {
		logger.log(`File change notification: ${params.type} ${params.uri}`);

		switch (params.type) {
			case "created":
				shared.addKnownOpenAPIFile(params.uri);
				shared.workspaceIndex.markAffected(params.uri);
				break;
			case "deleted":
				shared.removeKnownOpenAPIFile(params.uri);
				shared.removeRootDocument(params.uri);
				shared.workspaceIndex.unregisterDocument(params.uri);
				break;
			case "changed":
				shared.workspaceIndex.markAffected(params.uri);
				break;
		}
	},
);

/**
 * Handle aperture/getProjectInfo request - returns info about the current project state.
 * Useful for debugging and status reporting.
 */
connection.onRequest("aperture/getProjectInfo", () => {
	return {
		knownOpenAPIFiles: shared.getKnownOpenAPIFiles().length,
		rootDocuments: shared.getRootDocumentUris().length,
		hasClientFileList: shared.hasClientFileList(),
		workspacePath: shared.getWorkspaceFolderPath(),
	};
});

connection.listen();

server.workspaceFolders.onDidChange(() => {
	const timestamp = new Date().toISOString();
	// In single-root mode, this server instance handles one workspace folder.
	// If folders change, update to use the first folder.
	shared.setWorkspaceFolders(server.workspaceFolders.all);
	// Clear cross-document indexes when workspace roots change
	shared.workspaceIndex.clear();
	// Clear root documents cache when workspace folder changes
	shared.clearRootDocuments();
	shared.resetInitialScan();
	const folderPath = shared.getWorkspaceFolderPath();
	logger.log(
		`Workspace folder changed at ${timestamp} - active folder: ${folderPath ?? "none"}`,
	);
	// Volar automatically handles workspace diagnostics refresh
});

server.configurations.onDidChange(async () => {
	const timestamp = new Date().toISOString();
	const configurationChanged = shared.reloadConfiguration();
	if (!configurationChanged) {
		logger.log(
			`Configuration change event at ${timestamp} but signature unchanged (${shared.getConfigSignature()}) - skipping reload`,
		);
		return;
	}
	logger.log(
		`Configuration changed at ${timestamp} - new signature ${shared.getConfigSignature()} (Volar will automatically refresh workspace diagnostics)`,
	);
	// Volar automatically handles workspace diagnostics refresh
});

// Watch for config file changes
