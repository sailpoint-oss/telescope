import type {
	InitializeParams,
	ServerCapabilities,
} from "@volar/language-server";
import {
	createConnection,
	createServer,
	createSimpleProject,
	TextDocumentSyncKind,
} from "@volar/language-server/node";
import { URI } from "vscode-uri";
import { ApertureVolarContext } from "./context.js";
import type { SnapshotLike } from "./documents.js";
import { createOpenApiLanguagePlugin } from "./languageModule.js";
import { createDiagnosticsPlugin } from "./plugins/diagnostics.js";

const connection = createConnection();
const server = createServer(connection);

const shared = new ApertureVolarContext(connection.console, server);

const languagePlugins = [createOpenApiLanguagePlugin(shared.documents)];
const project = createSimpleProject(languagePlugins);
const languageServicePlugins = [createDiagnosticsPlugin(shared)];

let initializeParams: InitializeParams | undefined;

shared
	.getLogger()
	.log(
		`[Server] Initializing with ${languageServicePlugins.length} language service plugin(s)`,
	);

server.onInitialize((capabilities: ServerCapabilities) => {
	capabilities.textDocumentSync = TextDocumentSyncKind.Incremental;
	shared
		.getLogger()
		.log(
			`[Server] Server capabilities initialized - textDocumentSync: ${capabilities.textDocumentSync}`,
		);
});

connection.onInitialize((params) => {
	initializeParams = params; // Store for later use
	shared
		.getLogger()
		.log(
			`[Server] Connection initialized - registering ${languageServicePlugins.length} plugin(s)`,
		);
	syncWorkspaceFolders(params);
	const result = server.initialize(params, project, languageServicePlugins);
	shared.getLogger().log(`[Server] Server initialization complete`);
	return result;
});

connection.onInitialized(async () => {
	shared
		.getLogger()
		.log(`[Server] Connection initialized - calling server.initialized()`);
	server.initialized();

	// Check if client supports workspace diagnostics refresh
	const supportsRefresh =
		initializeParams?.capabilities?.workspace?.diagnostics?.refreshSupport;
	if (supportsRefresh) {
		shared
			.getLogger()
			.log(
				`[Server] Client supports workspace diagnostics refresh - triggering refresh`,
			);

		// Ensure at least one language service exists so workspace diagnostics can run
		// Volar's workspace diagnostics handler requires language services to exist
		// We'll find an actual file to create a language service for
		const workspaceFolders = shared.getWorkspaceFolders();
		if (workspaceFolders.length > 0) {
			try {
				// Try to find a YAML/JSON file in the workspace to create a language service for
				const patterns = ["**/*.yaml", "**/*.yml", "**/*.json"];
				const fileUris = await shared.getHost().glob(patterns);
				const firstFile = fileUris[0];
				if (firstFile) {
					// Create a language service for the first file found
					// This ensures workspace diagnostics handler can call getWorkspaceDiagnostics
					const firstFileUri = URI.parse(firstFile);
					await server.project.getLanguageService(firstFileUri);
					shared
						.getLogger()
						.log(
							`[Server] Created language service for ${firstFile} to enable workspace diagnostics`,
						);
				} else {
					shared
						.getLogger()
						.log(
							`[Server] No YAML/JSON files found in workspace - workspace diagnostics will run when files are opened`,
						);
				}
			} catch (error) {
				shared
					.getLogger()
					.error(
						`[Server] Failed to create language service for workspace diagnostics: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
			}
		}

		// Trigger VS Code to request workspace diagnostics
		server.connection.languages.diagnostics.refresh();
	} else {
		shared
			.getLogger()
			.log(
				`[Server] Client does not support workspace diagnostics refresh - workspace diagnostics will be requested when Problems panel is opened`,
			);
	}

	// Request diagnostics refresh after initialization
	void server.languageFeatures.requestRefresh(true);

	server.workspaceFolders.onDidChange(() => {
		shared.setWorkspaceFolders(server.workspaceFolders.all);
		void server.languageFeatures.requestRefresh(true);
	});

	server.configurations.onDidChange(async () => {
		shared.reloadConfiguration();
		await server.languageFeatures.requestRefresh(true);
	});

	server.fileWatcher.onDidChangeWatchedFiles(
		async (event: { changes: Array<{ uri: string }> }) => {
			for (const change of event.changes) {
				shared.documents.delete(change.uri);
			}
			await server.languageFeatures.requestRefresh(true);
		},
	);

	server.documents.onDidOpen((event: { document: SnapshotLike }) => {
		shared.getLogger().log(`[Server] Document opened: ${event.document.uri}`);
		syncDocument(event.document);
		// Request diagnostics refresh when document opens
		void server.languageFeatures.requestRefresh(true);
	});

	server.documents.onDidChangeContent((event: { document: SnapshotLike }) => {
		shared.getLogger().log(`[Server] Document changed: ${event.document.uri}`);
		syncDocument(event.document);
		void handleRootDocumentChange(event.document.uri, shared, server);
		// Request diagnostics refresh on content change
		void server.languageFeatures.requestRefresh(true);
	});

	server.documents.onDidSave((event: { document: SnapshotLike }) => {
		shared.getLogger().log(`[Server] Document saved: ${event.document.uri}`);
		syncDocument(event.document);
		void handleRootDocumentChange(event.document.uri, shared, server);
		// Request diagnostics refresh on save
		void server.languageFeatures.requestRefresh(true);
	});

	server.documents.onDidClose((event: { document: { uri: string } }) => {
		shared.documents.delete(event.document.uri);
	});
});

connection.onShutdown(() => {
	server.shutdown();
});

connection.listen();

function syncWorkspaceFolders(params: InitializeParams): void {
	const folderUris: URI[] = [];
	if (params.workspaceFolders && params.workspaceFolders.length > 0) {
		for (const folder of params.workspaceFolders) {
			folderUris.push(URI.parse(folder.uri));
		}
	} else if (params.rootUri) {
		folderUris.push(URI.parse(params.rootUri));
	} else if (params.rootPath) {
		folderUris.push(URI.file(params.rootPath));
	}
	shared.setWorkspaceFolders(folderUris);
}

function syncDocument(document: SnapshotLike): void {
	shared.documents.updateFromDocument(document);
}

/**
 * Handle changes to root documents by re-linting dependent partial documents.
 */
async function handleRootDocumentChange(
	uri: string,
	shared: ApertureVolarContext,
	server: ReturnType<typeof createServer>,
): Promise<void> {
	try {
		// Check if this is a root document (using cache)
		const isRoot = await shared.documentCache.isRootDocument(
			uri,
			shared.getHost(),
		);
		if (!isRoot) {
			// Not a root document, nothing to do
			return;
		}

		// Trigger refresh for all open documents
		// Volar will handle re-running diagnostics for affected documents
		await server.languageFeatures.requestRefresh(true);
	} catch (error) {
		// Log but don't fail - this is a best-effort optimization
		shared
			.getLogger()
			.error(
				`Failed to handle root document change for ${uri}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
	}
}
