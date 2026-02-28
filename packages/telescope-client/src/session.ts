/**
 * Session - Manages a single LSP client for one workspace folder.
 *
 * Each workspace folder gets its own Session instance, which spawns
 * its own language server process. This provides true isolation between
 * workspace folders with their own configurations, rules, and state.
 */

import * as vscode from "vscode";
import {
	type BaseLanguageClient,
	LanguageClient,
	type LanguageClientOptions,
	type ServerOptions,
} from "vscode-languageclient/node";
import { Trace } from "vscode-languageserver-protocol";
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
	/** Path to the Telescope Go language server binary */
	serverPath: string;
	/** Shared output channel for logging */
	outputChannel: vscode.OutputChannel;
	/** Shared status bar item (optional) */
	statusBarItem?: vscode.StatusBarItem;
	/** Workspace-scoped persistent storage (for scanner caches, etc.) */
	workspaceState: vscode.Memento;
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
	private _lastStartError: string | null = null;

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

	/** Ensure start/stop are idempotent and safe under concurrency. */
	private startPromise: Promise<void> | null = null;
	private stopPromise: Promise<void> | null = null;

	/** Timer for delayed background scan */
	private backgroundScanTimer: ReturnType<typeof setTimeout> | null = null;

	/** Disposables for this session */
	private disposables: vscode.Disposable[] = [];

	/** Configuration options */
	private readonly serverPath: string;
	private readonly outputChannel: vscode.OutputChannel;
	private statusBarItem: vscode.StatusBarItem | null;
	private readonly workspaceState: vscode.Memento;

	constructor(options: SessionOptions) {
		this.workspaceFolder = options.workspaceFolder;
		this.id = options.workspaceFolder.uri.toString();
		this.serverPath = options.serverPath;
		this.outputChannel = options.outputChannel;
		this.statusBarItem = options.statusBarItem ?? null;
		this.workspaceState = options.workspaceState;
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
		if (this._state === SessionState.Running) return;
		if (this.startPromise) return await this.startPromise;

		this.startPromise = (async () => {
			if (this.stopPromise) {
				await this.stopPromise;
			}

			if (this._state !== SessionState.Stopped) {
				this.log(`Session already ${this._state}, skipping start`);
				return;
			}

			this._state = SessionState.Starting;
			this.log(`Starting session for ${this.workspaceFolder.name}`);

			try {
				await this.loadConfig();
				await this.startClient();
				this.initializeScanner();
				this.setupFileWatchers();
				this.setupDocumentHandlers();

				this._state = SessionState.Running;
				this._lastStartError = null;
				this.log(`Session started for ${this.workspaceFolder.name}`);

				this.startBackgroundScan();
			} catch (error) {
				this._state = SessionState.Stopped;
				this._lastStartError =
					error instanceof Error
						? error.stack || error.message
						: String(error);
				this.logError(`Failed to start session: ${error}`);
				throw error;
			}
		})().finally(() => {
			this.startPromise = null;
		});

		return await this.startPromise;
	}

	get lastStartError(): string | null {
		return this._lastStartError;
	}

	/**
	 * Stop the session - stops LSP client and cleans up resources.
	 */
	async stop(): Promise<void> {
		if (this._state === SessionState.Stopped) return;
		if (this.stopPromise) return await this.stopPromise;

		this.stopPromise = (async () => {
			if (this.startPromise) {
				try {
					await this.startPromise;
				} catch {
					// ignore; we're stopping anyway
				}
			}

			if (this._state === SessionState.Stopped) return;

			this._state = SessionState.Stopping;
			this.log(`Stopping session for ${this.workspaceFolder.name}`);

			try {
				if (this.backgroundScanTimer) {
					clearTimeout(this.backgroundScanTimer);
					this.backgroundScanTimer = null;
				}

				this.scanner?.cancelScan();

				if (this.client) {
					await this.client.stop();
					this.client = null;
				}

				if (this.scanner) {
					this.scanner.dispose();
					this.scanner = null;
				}

				for (const disposable of this.disposables) {
					disposable.dispose();
				}
				this.disposables = [];

				this.classifiedDocuments.clear();
				this.userOverrides.clear();

				this._state = SessionState.Stopped;
				this.log(`Session stopped for ${this.workspaceFolder.name}`);
			} catch (error) {
				this._state = SessionState.Stopped;
				this.logError(`Error stopping session: ${error}`);
			}
		})().finally(() => {
			this.stopPromise = null;
		});

		return await this.stopPromise;
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
			this.patterns = DEFAULT_OPENAPI_PATTERNS;
		}

		this.log(`Loaded patterns: ${JSON.stringify(this.patterns)}`);
	}

	/**
	 * Start the language client.
	 */
	private async startClient(): Promise<void> {
		const serverOptions: ServerOptions = {
			run: {
				command: this.serverPath,
				args: ["serve"],
			},
			debug: {
				command: this.serverPath,
				args: ["serve"],
			},
		};

		const clientOptions: LanguageClientOptions = {
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
			initializationOptions: {
				workspaceFolder: this.workspaceFolder.uri.toString(),
			},
			markdown: {
				isTrusted: true,
				supportHtml: true,
			},
			synchronize: {
				configurationSection: ["telescope"],
			},
			diagnosticPullOptions: {
				filter: (doc) => !this.isDocumentInOpenAPIScope(doc.uri),
				onTabs: true,
				match: (_selector, resource) => this.isDocumentInOpenAPIScope(resource),
			},
		};

		const clientId = `telescope-${this.workspaceFolder.name}`;
		const clientName = `Telescope (${this.workspaceFolder.name})`;

		this.client = new LanguageClient(
			clientId,
			clientName,
			serverOptions,
			clientOptions,
		);

		this.applyTraceSetting();
		await this.client.start();
		this.log(`Language client started`);
	}

	/**
	 * Apply current Telescope configuration to the running language client.
	 * Safe to call whether the client is started or not.
	 */
	applyTraceSetting(): void {
		if (!this.client) return;
		const cfg = vscode.workspace.getConfiguration("telescope", this.workspaceFolder.uri);
		const traceLevel = cfg.get<"off" | "messages" | "verbose">("trace", "off");
		switch (traceLevel) {
			case "verbose":
				this.client.setTrace(Trace.Verbose);
				break;
			case "messages":
				this.client.setTrace(Trace.Messages);
				break;
			default:
				this.client.setTrace(Trace.Off);
				break;
		}
	}

	/**
	 * Execute a server refactor command for this session.
	 * The server applies the resulting WorkspaceEdit via `workspace/applyEdit`.
	 */
	async executeServerCommand(command: string, args: unknown[]): Promise<void> {
		if (!this.client || this._state !== SessionState.Running) return;
		await this.client.sendRequest("workspace/executeCommand", {
			command,
			arguments: args,
		});
	}

	/**
	 * Initialize the workspace scanner.
	 */
	private initializeScanner(): void {
		this.scanner = new WorkspaceScanner(this.workspaceFolder, {
			workspaceState: this.workspaceState,
			storageKey: `telescope.scanCache:${this.id}`,
		});
		this.scanner.setDiscoveryPatterns(this.patterns);
		this.scanner.setFileFilter((uri) => this.matchesOpenAPIPatterns(uri));

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
		const fileWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(this.workspaceFolder, "**/*.{yaml,yml,json}"),
		);

		fileWatcher.onDidChange(async (uri) => {
			if (this.ownsUri(uri)) {
				this.scanner?.invalidate(uri.toString());
				if (!this.matchesOpenAPIPatterns(uri)) return;
				await this.scanner?.classifyFile(uri);
			}
		});

		fileWatcher.onDidDelete((uri) => {
			if (this.ownsUri(uri)) {
				this.scanner?.invalidate(uri.toString());
				this.classifiedDocuments.delete(uri.toString());
			}
		});

		fileWatcher.onDidCreate(async (uri) => {
			if (this.ownsUri(uri) && this.matchesOpenAPIPatterns(uri)) {
				await this.scanner?.classifyFile(uri);
			}
		});

		this.disposables.push(fileWatcher);

		const configWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(this.workspaceFolder, CONFIG_PATH),
		);

		const handleConfigChange = async () => {
			this.log("Config file changed, reloading...");
			await this.loadConfig();

			this.classifiedDocuments.clear();
			this.userOverrides.clear();
			this.scanner?.clearCache();

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
		const openDisposable = vscode.workspace.onDidOpenTextDocument((doc) => {
			if (this.ownsUri(doc.uri)) {
				this.handleDocument(doc);
			}
		});
		this.disposables.push(openDisposable);

		const closeDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
			if (this.ownsUri(doc.uri)) {
				this.classifiedDocuments.delete(doc.uri.toString());
			}
		});
		this.disposables.push(closeDisposable);

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
		this.backgroundScanTimer = setTimeout(async () => {
			await this.runScan();
		}, 250);
	}

	/**
	 * Run a workspace scan for client-side classification and status bar updates.
	 */
	private async runScan(): Promise<void> {
		if (!this.scanner) return;
		this.log("Starting workspace scan...");

		try {
			const files = await this.scanner.scanWorkspace();
			this.log(`Scan complete: ${(files ?? []).length} OpenAPI files found`);
		} catch (error) {
			this.logError(`Workspace scan failed: ${error}`);
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
	 * Check if a document URI is in OpenAPI scope (for diagnostic filtering).
	 *
	 * Documents with an OpenAPI language ID always pass through.
	 * Plain yaml/json/jsonc documents are checked against the configured
	 * openapi.patterns so that non-OpenAPI files never trigger a
	 * diagnostic pull to the server.
	 */
	private isDocumentInOpenAPIScope(uri: vscode.Uri): boolean {
		const doc = vscode.workspace.textDocuments.find(
			(d) => d.uri.toString() === uri.toString(),
		);
		if (doc && isOpenAPILanguage(doc.languageId)) {
			return true;
		}

		const cached = this.scanner?.getClassification(uri.toString());
		if (cached?.isOpenAPI) {
			return true;
		}

		return this.matchesOpenAPIPatterns(uri);
	}

	/**
	 * Handle document classification and language switching.
	 */
	async handleDocument(doc: vscode.TextDocument): Promise<void> {
		const uri = doc.uri.toString();
		const languageId = doc.languageId;
		const filePath = doc.uri.fsPath;

		if (this.userOverrides.has(uri)) {
			return;
		}

		const supportedLanguages = ["yaml", "json", "jsonc", "plaintext"];
		if (!supportedLanguages.includes(languageId)) {
			return;
		}

		if (!this.matchesOpenAPIPatterns(doc.uri)) {
			return;
		}

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
	 * Get current client-side OpenAPI file count.
	 */
	getClientOpenApiFileCount(): number {
		return this.scanner?.getOpenAPICount() ?? 0;
	}

	/**
	 * Get project info (client-side). Used by E2E test API.
	 */
	getProjectInfo(): {
		knownOpenAPIFiles: number;
		workspacePath: string | null;
	} {
		return {
			knownOpenAPIFiles: this.scanner?.getOpenAPICount() ?? 0,
			workspacePath: this.workspaceFolder.uri.fsPath,
		};
	}

	private log(message: string): void {
		this.outputChannel.appendLine(
			formatSetupLog(`[${this.workspaceFolder.name}] ${message}`),
		);
	}

	private logError(message: string): void {
		this.outputChannel.appendLine(
			formatSetupLog(`[${this.workspaceFolder.name}] ${message}`),
		);
	}

	/**
	 * Dispose of this session.
	 */
	dispose(): void {
		void this.disposeAsync();
	}

	/**
	 * Async disposal for deterministic shutdown.
	 * Prefer this from `deactivate()` to ensure the server process exits cleanly.
	 */
	async disposeAsync(): Promise<void> {
		await this.stop();
	}
}
