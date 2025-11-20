import type {
	LanguagePlugin,
	LanguageServicePlugin,
} from "@volar/language-server";
import {
	createConnection,
	createServer,
	createSimpleProject,
} from "@volar/language-server/node";
import { createConfigLanguagePlugin } from "./languages/config/config-plugin.js";
import {
	createConfigServicePlugin,
	isConfigFile,
} from "./services/config/config.js";
import { createAdditionalValidationPlugin } from "./services/validation/validation.js";
import { ApertureVolarContext } from "./workspace/context.js";

const connection = createConnection();
const server = createServer(connection);

const shared = new ApertureVolarContext(connection.console, server);
const logger = shared.getLogger("Server");

// Instantiate the plugins
const configLanguagePlugin = createConfigLanguagePlugin(shared);

// Build the array of Language Plugins
const languagePlugins: LanguagePlugin[] = [
	configLanguagePlugin,
	// createOpenAPILanguagePlugin(
	//   shared.documents,
	//   shared.core,
	//   shared,
	//   shared.getLogger()
	// ),
];

logger.log(`Loading ${languagePlugins.length} language plugin(s)`);

// Instantiate the language service plugins
const configServicePlugin = createConfigServicePlugin(shared);
const additionalValidationPlugin = createAdditionalValidationPlugin(shared);

// Build the array of Language Service Plugins
const languageServicePlugins: LanguageServicePlugin[] = [
	configServicePlugin,
	// createOpenAPIServicePlugin(shared),
	additionalValidationPlugin,
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

connection.listen();

server.workspaceFolders.onDidChange(() => {
	const timestamp = new Date().toISOString();
	// Update workspace folders from Volar's managed state
	shared.setWorkspaceFolders(server.workspaceFolders.all);
	// Clear root documents cache when workspace folders change
	// Reset initial scan flag so we rediscover files
	shared.clearRootDocuments();
	shared.resetInitialScan();
	logger.log(
		`Workspace folders changed at ${timestamp} - total folders: ${server.workspaceFolders.all.length}`,
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
