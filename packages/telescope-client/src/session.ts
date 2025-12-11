/**
 * Session - Manages a single LSP client for one workspace folder.
 *
 * Each workspace folder gets its own Session instance, which spawns
 * its own language server process. This provides true isolation between
 * workspace folders with their own configurations, rules, and state.
 */

import * as path from "node:path";
import { Trace } from "@volar/vscode";
import * as vscode from "vscode";
import {
	type BaseLanguageClient,
	LanguageClient,
	type LanguageClientOptions,
	type ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";
import { parse as yamlParse } from "yaml";
import {
	classifyDocument,
	DEFAULT_OPENAPI_PATTERNS,
	formatSetupLog,
	getBaseLanguageFromExtension,
	getOpenAPILanguageId,
	isOpenAPILanguage,
	matchesPatternList,
} from "./utils";
import { WorkspaceScanner } from "./workspace-scanner";

/** Path to the Telescope configuration file relative to workspace root */
const CONFIG_PATH = ".telescope/config.yaml";

/**
 * Session state enum for lifecycle management.
 */
export enum SessionState {
	Stopped = "stopped",
	Starting = "starting",
	Running = "running",
	Stopping = "stopping",
}

/**
 * Options for creating a new Session.
 */
export interface SessionOptions {
	/** The workspace folder this session manages */
	workspaceFolder: vscode.WorkspaceFolder;
	/** Path to the server module */
	serverModule: string;
	/** Path to Node.js runtime */
	nodePath: string;
	/** Shared output channel for logging */
	outputChannel: vscode.OutputChannel;
	/** Shared status bar item (optional) */
	statusBarItem?: vscode.StatusBarItem;
}

/**
 * Session manages a single LSP client for one workspace folder.
 *
 * Responsibilities:
 * - Spawns and manages its own language server process
 * - Loads and manages workspace-specific configuration
 * - Runs workspace scanning for OpenAPI file discovery
 * - Handles document classification for files in this folder
 * - Manages file watchers scoped to this folder
 */
export class Session implements vscode.Disposable {
	/** The workspace folder this session manages */
	readonly workspaceFolder: vscode.WorkspaceFolder;

	/** Unique identifier for this session (workspace folder URI) */
	readonly id: string;

	/** Current session state */
	private _state: SessionState = SessionState.Stopped;

	/** The language client for this session */
	private client: BaseLanguageClient | null = null;

	/** Workspace scanner for OpenAPI file discovery */
	private scanner: WorkspaceScanner | null = null;

	/** Loaded OpenAPI patterns for this workspace */
	private patterns: string[] = DEFAULT_OPENAPI_PATTERNS;

	/** Track documents we've automatically classified */
	private classifiedDocuments = new Map<string, string>();

	/** Track documents where the user has manually opted out */
	private userOverrides = new Set<string>();

	/** Disposables for this session */
	private disposables: vscode.Disposable[] = [];

	/** Configuration options */
	private readonly serverModule: string;
	private readonly nodePath: string;
	private readonly outputChannel: vscode.OutputChannel;
	private statusBarItem: vscode.StatusBarItem | null;

	constructor(options: SessionOptions) {
		this.workspaceFolder = options.workspaceFolder;
		this.id = options.workspaceFolder.uri.toString();
		this.serverModule = options.serverModule;
		this.nodePath = options.nodePath;
		this.outputChannel = options.outputChannel;
		this.statusBarItem = options.statusBarItem ?? null;
	}

	/**
	 * Get the current session state.
	 */
	get state(): SessionState {
		return this._state;
	}

	/**
	 * Get the language client (if running).
	 */
	getClient(): BaseLanguageClient | null {
		return this.client;
	}

	/**
	 * Get the workspace scanner.
	 */
	getScanner(): WorkspaceScanner | null {
		return this.scanner;
	}

	/**
	 * Get classified documents map.
	 */
	getClassifiedDocuments(): Map<string, string> {
		return this.classifiedDocuments;
	}

	/**
	 * Check if this session owns a given URI.
	 */
	ownsUri(uri: vscode.Uri): boolean {
		const folder = vscode.workspace.getWorkspaceFolder(uri);
		return folder?.uri.toString() === this.id;
	}

	/**
	 * Start the session - loads config, starts LSP client, begins scanning.
	 */
	async start(): Promise<void> {
		if (this._state !== SessionState.Stopped) {
			this.log(`Session already ${this._state}, skipping start`);
			return;
		}

		this._state = SessionState.Starting;
		this.log(`Starting session for ${this.workspaceFolder.name}`);

		try {
			// Load workspace-specific config
			await this.loadConfig();

			// Create and start the language client
			await this.startClient();

			// Initialize workspace scanner
			this.initializeScanner();

			// Set up file watchers
			this.setupFileWatchers();

			// Set up document handlers
			this.setupDocumentHandlers();

			// Start background scan
			this.startBackgroundScan();

			this._state = SessionState.Running;
			this.log(`Session started for ${this.workspaceFolder.name}`);
		} catch (error) {
			this._state = SessionState.Stopped;
			this.logError(`Failed to start session: ${error}`);
			throw error;
		}
	}

	/**
	 * Stop the session - stops LSP client and cleans up resources.
	 */
	async stop(): Promise<void> {
		if (this._state === SessionState.Stopped) {
			return;
		}

		this._state = SessionState.Stopping;
		this.log(`Stopping session for ${this.workspaceFolder.name}`);

		try {
			// Stop the language client
			if (this.client) {
				await this.client.stop();
				this.client = null;
			}

			// Clean up scanner
			if (this.scanner) {
				this.scanner.dispose();
				this.scanner = null;
			}

			// Dispose all subscriptions
			for (const disposable of this.disposables) {
				disposable.dispose();
			}
			this.disposables = [];

			// Clear state
			this.classifiedDocuments.clear();
			this.userOverrides.clear();

			this._state = SessionState.Stopped;
			this.log(`Session stopped for ${this.workspaceFolder.name}`);
		} catch (error) {
			this._state = SessionState.Stopped;
			this.logError(`Error stopping session: ${error}`);
		}
	}

	/**
	 * Restart the session.
	 */
	async restart(): Promise<void> {
		this.log(`Restarting session for ${this.workspaceFolder.name}`);
		await this.stop();
		await this.start();
	}

	/**
	 * Load telescope config from this workspace folder.
	 */
	private async loadConfig(): Promise<void> {
		const configPath = vscode.Uri.joinPath(
			this.workspaceFolder.uri,
			CONFIG_PATH,
		);

		try {
			const content = await vscode.workspace.fs.readFile(configPath);
			const text = new TextDecoder().decode(content);
			const config = yamlParse(text);

			if (
				config?.openapi?.patterns &&
				Array.isArray(config.openapi.patterns) &&
				config.openapi.patterns.length > 0
			) {
				this.patterns = config.openapi.patterns;
			} else {
				this.patterns = DEFAULT_OPENAPI_PATTERNS;
			}
		} catch {
			// Config file doesn't exist or failed to parse - use defaults
			this.patterns = DEFAULT_OPENAPI_PATTERNS;
		}

		this.log(`Loaded patterns: ${JSON.stringify(this.patterns)}`);
	}

	/**
	 * Start the language client.
	 */
	private async startClient(): Promise<void> {
		// Configure server options - one server per workspace folder
		const serverOptions: ServerOptions = {
			run: {
				command: this.nodePath,
				args: [this.serverModule],
				transport: TransportKind.stdio,
			},
			debug: {
				command: this.nodePath,
				args: ["--inspect", this.serverModule],
				transport: TransportKind.stdio,
			},
		};

		// Options to control the language client
		const clientOptions: LanguageClientOptions = {
			// Scope document selector to this workspace folder
			documentSelector: [
				{
					language: "yaml",
					pattern: `${this.workspaceFolder.uri.fsPath}/**/*`,
				},
				{
					language: "json",
					pattern: `${this.workspaceFolder.uri.fsPath}/**/*`,
				},
				{
					language: "openapi-json",
					pattern: `${this.workspaceFolder.uri.fsPath}/**/*`,
				},
				{
					language: "openapi-yaml",
					pattern: `${this.workspaceFolder.uri.fsPath}/**/*`,
				},
			],
			workspaceFolder: this.workspaceFolder,
			outputChannel: this.outputChannel,
			// Pass the workspace folder to the server
			initializationOptions: {
				workspaceFolder: this.workspaceFolder.uri.toString(),
			},
			markdown: {
				isTrusted: true,
				supportHtml: true,
			},
		};

		// Create unique client ID for this workspace
		const clientId = `telescope-${this.workspaceFolder.name}`;
		const clientName = `Telescope (${this.workspaceFolder.name})`;

		this.client = new LanguageClient(
			clientId,
			clientName,
			serverOptions,
			clientOptions,
		);

		// Enable trace logging for debugging
		this.client.setTrace(Trace.Verbose);

		// Start the client
		await this.client.start();
		this.log(`Language client started`);
	}

	/**
	 * Initialize the workspace scanner.
	 */
	private initializeScanner(): void {
		// Create scanner scoped to this workspace folder
		this.scanner = new WorkspaceScanner(this.workspaceFolder);
		this.scanner.setFileFilter((uri) => this.matchesOpenAPIPatterns(uri));

		// Wire up status callback to centralize status bar updates
		this.scanner.setStatusCallback((status) => {
			if (this.statusBarItem) {
				this.statusBarItem.text = `$(file-code) ${status}`;
				this.statusBarItem.show();
			}
		});

		this.disposables.push({
			dispose: () => this.scanner?.dispose(),
		});
	}

	/**
	 * Set up file watchers for this workspace folder.
	 */
	private setupFileWatchers(): void {
		// Watch for YAML/JSON file changes in this workspace folder
		const fileWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(this.workspaceFolder, "**/*.{yaml,yml,json}"),
		);

		fileWatcher.onDidChange((uri) => {
			if (this.ownsUri(uri)) {
				this.scanner?.invalidate(uri.toString());
				// Notify server of file change
				this.notifyServerFileChange(uri.toString(), "changed");
			}
		});

		fileWatcher.onDidDelete((uri) => {
			if (this.ownsUri(uri)) {
				this.scanner?.invalidate(uri.toString());
				this.classifiedDocuments.delete(uri.toString());
				// Notify server of file deletion
				this.notifyServerFileChange(uri.toString(), "deleted");
			}
		});

		fileWatcher.onDidCreate(async (uri) => {
			if (this.ownsUri(uri) && this.matchesOpenAPIPatterns(uri)) {
				const result = await this.scanner?.classifyFile(uri);
				// Notify server if this is an OpenAPI file
				if (result?.isOpenAPI) {
					this.notifyServerFileChange(uri.toString(), "created");
				}
			}
		});

		this.disposables.push(fileWatcher);

		// Watch for config file changes in this workspace folder
		const configWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(this.workspaceFolder, CONFIG_PATH),
		);

		const handleConfigChange = async () => {
			this.log("Config file changed, reloading...");
			await this.loadConfig();

			// Clear existing classifications
			this.classifiedDocuments.clear();
			this.userOverrides.clear();
			this.scanner?.clearCache();

			// Re-scan workspace
			await this.runScan();
		};

		configWatcher.onDidChange(handleConfigChange);
		configWatcher.onDidCreate(handleConfigChange);
		configWatcher.onDidDelete(handleConfigChange);
		this.disposables.push(configWatcher);
	}

	/**
	 * Set up document handlers for this session.
	 */
	private setupDocumentHandlers(): void {
		// Handle documents when they are opened
		const openDisposable = vscode.workspace.onDidOpenTextDocument((doc) => {
			if (this.ownsUri(doc.uri)) {
				this.handleDocument(doc);
			}
		});
		this.disposables.push(openDisposable);

		// Clean up when documents are closed to prevent memory leaks
		const closeDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
			if (this.ownsUri(doc.uri)) {
				this.classifiedDocuments.delete(doc.uri.toString());
			}
		});
		this.disposables.push(closeDisposable);

		// Handle already-open documents that belong to this workspace
		for (const doc of vscode.workspace.textDocuments) {
			if (this.ownsUri(doc.uri)) {
				this.handleDocument(doc);
			}
		}
	}

	/**
	 * Start the background workspace scan.
	 */
	private startBackgroundScan(): void {
		// Delay to let extension fully activate
		setTimeout(async () => {
			await this.runScan();
		}, 1000);
	}

	/**
	 * Run a workspace scan and apply classifications.
	 */
	private async runScan(): Promise<void> {
		this.log("Starting workspace scan...");

		try {
			const openAPIFiles = await this.scanner?.scanWorkspace();
			this.log(
				`Scan complete: ${openAPIFiles?.length || 0} OpenAPI files found`,
			);

			// Send discovered files to the server (client→server sync)
			if (openAPIFiles && this.client) {
				await this.sendOpenAPIFilesToServer(openAPIFiles);
			}

			// Apply classifications in background
			if (openAPIFiles && openAPIFiles.length > 0) {
				this.applyOpenAPIClassificationsAsync(openAPIFiles).catch((error) => {
					this.logError(`Background classification error: ${error}`);
				});
			}
		} catch (error) {
			this.logError(`Workspace scan failed: ${error}`);
		}
	}

	/**
	 * Send discovered OpenAPI files to the language server.
	 * This is the client→server sync mechanism that provides the "project model".
	 */
	private async sendOpenAPIFilesToServer(files: string[]): Promise<void> {
		if (!this.client || this._state !== SessionState.Running) {
			this.log("Client not ready, skipping file sync to server");
			return;
		}

		try {
			const result = await this.client.sendRequest(
				"telescope/setOpenAPIFiles",
				{
					files,
				},
			);
			this.log(
				`Sent ${files.length} files to server: ${JSON.stringify(result)}`,
			);
		} catch (error) {
			this.logError(`Failed to send files to server: ${error}`);
		}
	}

	/**
	 * Notify the server about a file change.
	 * This keeps the server's project model in sync with the client.
	 */
	private notifyServerFileChange(
		uri: string,
		type: "created" | "changed" | "deleted",
	): void {
		if (!this.client || this._state !== SessionState.Running) {
			return;
		}

		try {
			this.client.sendNotification("telescope/notifyFileChange", { uri, type });
		} catch (error) {
			// Silently fail - these are best-effort notifications
			console.debug(`Failed to notify server of file change: ${error}`);
		}
	}

	/**
	 * Check if a file URI matches the configured OpenAPI patterns.
	 */
	matchesOpenAPIPatterns(fileUri: vscode.Uri): boolean {
		const filePath = fileUri.fsPath;
		const workspaceRoot = this.workspaceFolder.uri.fsPath;
		return matchesPatternList(filePath, this.patterns, workspaceRoot);
	}

	/**
	 * Apply OpenAPI classifications to files in the background.
	 */
	private async applyOpenAPIClassificationsAsync(
		openAPIFiles: string[],
		batchSize = 5,
		delayMs = 50,
	): Promise<void> {
		for (let i = 0; i < openAPIFiles.length; i += batchSize) {
			const batch = openAPIFiles.slice(i, i + batchSize);

			await Promise.all(
				batch.map(async (uriString) => {
					try {
						const uri = vscode.Uri.parse(uriString);
						const doc = await vscode.workspace.openTextDocument(uri);
						const targetLanguage = getOpenAPILanguageId(uri.fsPath);
						if (!isOpenAPILanguage(doc.languageId)) {
							await vscode.languages.setTextDocumentLanguage(
								doc,
								targetLanguage,
							);
							this.classifiedDocuments.set(uriString, targetLanguage);
						}
					} catch (error) {
						console.debug(`Failed to classify ${uriString}:`, error);
					}
				}),
			);

			// Yield to event loop between batches
			if (i + batchSize < openAPIFiles.length) {
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}
	}

	/**
	 * Handle document classification and language switching.
	 */
	async handleDocument(doc: vscode.TextDocument): Promise<void> {
		const uri = doc.uri.toString();
		const languageId = doc.languageId;
		const filePath = doc.uri.fsPath;

		// Skip if user has manually overridden this document
		if (this.userOverrides.has(uri)) {
			return;
		}

		// Check if we should process this document
		const supportedLanguages = ["yaml", "json", "jsonc", "plaintext"];
		if (!supportedLanguages.includes(languageId)) {
			return;
		}

		// Check if file matches configured OpenAPI patterns
		if (!this.matchesOpenAPIPatterns(doc.uri)) {
			return;
		}

		// For plaintext files, first try to set the correct base language
		if (languageId === "plaintext") {
			const baseLanguage = getBaseLanguageFromExtension(filePath);
			if (baseLanguage) {
				try {
					const newDoc = await vscode.languages.setTextDocumentLanguage(
						doc,
						baseLanguage,
					);
					doc = newDoc;
				} catch (error) {
					console.debug(`Failed to set base language for ${uri}:`, error);
				}
			} else {
				return;
			}
		}

		// Check if we have a cached scan result
		const cached = this.scanner?.getClassification(uri);
		if (cached?.isOpenAPI && this.scanner?.isFresh(cached)) {
			if (!isOpenAPILanguage(doc.languageId)) {
				try {
					const targetLanguage = getOpenAPILanguageId(filePath);
					await vscode.languages.setTextDocumentLanguage(doc, targetLanguage);
					this.classifiedDocuments.set(uri, targetLanguage);
				} catch (error) {
					console.debug("Failed to re-apply OpenAPI classification:", error);
				}
			}
			return;
		}

		// No cached result - classify fresh
		const classifyResult = classifyDocument(doc);
		const isOpenAPI = classifyResult === "openapi";

		if (isOpenAPI) {
			try {
				const targetLanguage = getOpenAPILanguageId(filePath);
				await vscode.languages.setTextDocumentLanguage(doc, targetLanguage);
				this.classifiedDocuments.set(uri, targetLanguage);
			} catch (error) {
				console.debug("Failed to set document language:", error);
			}
		}
	}

	/**
	 * Clear user override for a document and re-classify.
	 */
	async reclassifyDocument(doc: vscode.TextDocument): Promise<boolean> {
		const uri = doc.uri.toString();
		this.userOverrides.delete(uri);
		this.classifiedDocuments.delete(uri);
		await this.handleDocument(doc);
		return classifyDocument(doc) === "openapi";
	}

	/**
	 * Get all OpenAPI files found by the scanner.
	 */
	getOpenAPIFiles(): string[] {
		return this.scanner?.getOpenAPIFiles() || [];
	}

	/**
	 * Log a message to the output channel.
	 */
	private log(message: string): void {
		this.outputChannel.appendLine(
			formatSetupLog(`[${this.workspaceFolder.name}] ${message}`),
		);
	}

	/**
	 * Log an error to the output channel.
	 */
	private logError(message: string): void {
		this.outputChannel.appendLine(
			formatSetupLog(`[${this.workspaceFolder.name}] ❌ ${message}`),
		);
	}

	/**
	 * Dispose of this session.
	 */
	dispose(): void {
		this.stop();
	}
}
