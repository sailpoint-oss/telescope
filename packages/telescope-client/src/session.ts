/**
 * Session - Manages a single LSP client for one workspace folder.
 *
 * Each workspace folder gets its own Session instance, which spawns
 * its own language server process. This provides true isolation between
 * workspace folders with their own configurations, rules, and state.
 */

import * as path from "node:path";
import * as vscode from "vscode";
import {
	type BaseLanguageClient,
	LanguageClient,
	type LanguageClientOptions,
	type ServerOptions,
	TransportKind,
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
	/** Path to the server module */
	serverModule: string;
	/** Path to Node.js runtime */
	nodePath: string;
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

	/** Authoritative OpenAPI file membership for this workspace (client-side) */
	private openApiFiles = new Set<string>();
	/** Monotonic version for full snapshot + deltas */
	private openApiFilesVersion = 0;
	/** Ensure full syncs don't overlap */
	private fullSyncInFlight: Promise<void> | null = null;
	/** Tracks whether the server has received an initial full snapshot. */
	private hasSentBaseline = false;

	/** Batch OpenAPI membership deltas to reduce notification churn. */
	private pendingDelta: {
		added: Set<string>;
		removed: Set<string>;
		changed: Set<string>;
	} = {
		added: new Set<string>(),
		removed: new Set<string>(),
		changed: new Set<string>(),
	};
	private deltaFlushTimer: ReturnType<typeof setTimeout> | null = null;

	/** Ensure start/stop are idempotent and safe under concurrency. */
	private startPromise: Promise<void> | null = null;
	private stopPromise: Promise<void> | null = null;

	/** Timer for delayed background scan */
	private backgroundScanTimer: ReturnType<typeof setTimeout> | null = null;

	/** Disposables for this session */
	private disposables: vscode.Disposable[] = [];

	/** Configuration options */
	private readonly serverModule: string;
	private readonly nodePath: string;
	private readonly outputChannel: vscode.OutputChannel;
	private statusBarItem: vscode.StatusBarItem | null;
	private readonly workspaceState: vscode.Memento;

	constructor(options: SessionOptions) {
		this.workspaceFolder = options.workspaceFolder;
		this.id = options.workspaceFolder.uri.toString();
		this.serverModule = options.serverModule;
		this.nodePath = options.nodePath;
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
			// If a stop is in-flight, let it finish first so we don't race processes.
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
				this.hasSentBaseline = false;

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

				// Now considered running; background work (scan) can proceed and talk to server.
				this._state = SessionState.Running;
				this._lastStartError = null;
				this.log(`Session started for ${this.workspaceFolder.name}`);

				// Kick off an initial full snapshot quickly so the server doesn't see deltas-without-baseline.
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
			// If we are mid-start, wait for it (best-effort) so we can stop cleanly.
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
				// Cancel any scheduled scan
				if (this.backgroundScanTimer) {
					clearTimeout(this.backgroundScanTimer);
					this.backgroundScanTimer = null;
				}

				// Cancel any ongoing scan to avoid work continuing during shutdown
				this.scanner?.cancelScan();

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
				this.openApiFiles.clear();
				this.openApiFilesVersion = 0;
				this.hasSentBaseline = false;
				this.fullSyncInFlight = null;
				this.pendingDelta.added.clear();
				this.pendingDelta.removed.clear();
				this.pendingDelta.changed.clear();
				if (this.deltaFlushTimer) {
					clearTimeout(this.deltaFlushTimer);
					this.deltaFlushTimer = null;
				}

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
			// Ensure server receives `workspace/didChangeConfiguration` when Telescope
			// settings change (Cursor/VS Code 1.105.1 baseline).
			synchronize: {
				configurationSection: ["telescope"],
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

		// Configure trace logging (default off; configurable via telescope.trace)
		this.applyTraceSetting();

		// Start the client
		await this.client.start();

		// Server can request a full resync if it detects missed deltas.
		this.client.onRequest("telescope/requestOpenApiFilesResync", async () => {
			await this.syncOpenApiFilesFull({ clearScannerCache: false });
			return { success: true };
		});
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
	 * Test-only: ask the server to request a full OpenAPI file list resync.
	 */
	async requestServerResync(): Promise<void> {
		if (!this.client || this._state !== SessionState.Running) return;
		// This is intentionally implemented as a version-mismatch delta so the server
		// will request a resync via its normal recovery mechanism.
		this.sendBadDeltaVersionOnce();
	}

	/**
	 * Test-only: send a delta with an intentionally wrong version to trigger the
	 * server's resync request path.
	 */
	sendBadDeltaVersionOnce(): void {
		if (!this.client || this._state !== SessionState.Running) return;
		try {
			this.client.sendNotification("telescope/didChangeOpenApiFiles", {
				added: [],
				removed: [],
				changed: [],
				version: this.openApiFilesVersion + 1000,
			});
		} catch {
			// ignore
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
		// Create scanner scoped to this workspace folder
		this.scanner = new WorkspaceScanner(this.workspaceFolder, {
			workspaceState: this.workspaceState,
			storageKey: `telescope.scanCache:${this.id}`,
		});
		// Best-effort: use patterns to narrow enumeration; filter remains authoritative.
		this.scanner.setDiscoveryPatterns(this.patterns);
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

		fileWatcher.onDidChange(async (uri) => {
			if (this.ownsUri(uri)) {
				this.scanner?.invalidate(uri.toString());
				if (!this.matchesOpenAPIPatterns(uri)) return;

				const uriString = uri.toString();
				const wasOpenApi = this.openApiFiles.has(uriString);
				const result = await this.scanner?.classifyFile(uri);
				const isOpenApi = !!result?.isOpenAPI;

				if (wasOpenApi && isOpenApi) {
					this.sendOpenApiFilesDelta({ changed: [uriString] });
					this.notifyServerFileChange(uriString, "changed");
				} else if (wasOpenApi && !isOpenApi) {
					this.openApiFiles.delete(uriString);
					this.sendOpenApiFilesDelta({ removed: [uriString] });
					this.notifyServerFileChange(uriString, "deleted");
				} else if (!wasOpenApi && isOpenApi) {
					this.openApiFiles.add(uriString);
					this.sendOpenApiFilesDelta({ added: [uriString] });
					this.notifyServerFileChange(uriString, "created");
				}
			}
		});

		fileWatcher.onDidDelete((uri) => {
			if (this.ownsUri(uri)) {
				this.scanner?.invalidate(uri.toString());
				this.classifiedDocuments.delete(uri.toString());
				const uriString = uri.toString();
				if (this.openApiFiles.delete(uriString)) {
					this.sendOpenApiFilesDelta({ removed: [uriString] });
					this.notifyServerFileChange(uriString, "deleted");
				}
			}
		});

		fileWatcher.onDidCreate(async (uri) => {
			if (this.ownsUri(uri) && this.matchesOpenAPIPatterns(uri)) {
				const result = await this.scanner?.classifyFile(uri);
				const uriString = uri.toString();
				// Notify server if this is an OpenAPI file
				if (result?.isOpenAPI) {
					this.openApiFiles.add(uriString);
					this.sendOpenApiFilesDelta({ added: [uriString] });
					this.notifyServerFileChange(uriString, "created");
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
			this.openApiFiles.clear();
			this.openApiFilesVersion = 0;

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
		// Small delay to avoid thrashing on activation while still establishing a baseline quickly.
		this.backgroundScanTimer = setTimeout(async () => {
			await this.runScan();
		}, 250);
	}

	/**
	 * Run a workspace scan and apply classifications.
	 */
	private async runScan(): Promise<void> {
		this.log("Starting workspace scan...");

		try {
			await this.syncOpenApiFilesFull({ clearScannerCache: false });
		} catch (error) {
			this.logError(`Workspace scan failed: ${error}`);
		}
	}

	private async syncOpenApiFilesFull(options?: {
		clearScannerCache?: boolean;
	}): Promise<void> {
		if (!this.scanner) return;
		if (this.fullSyncInFlight) {
			return await this.fullSyncInFlight;
		}

		this.fullSyncInFlight = (async () => {
			if (options?.clearScannerCache) {
				this.scanner?.clearCache();
			}

			const openAPIFiles = await this.scanner?.scanWorkspace();
			const files = openAPIFiles ?? [];
			this.log(`Scan complete: ${files.length} OpenAPI files found`);

			this.openApiFiles = new Set(files);
			this.openApiFilesVersion++;

			// Send discovered files to the server (client→server sync)
			if (this.client) {
				await this.sendOpenAPIFilesToServer(files, this.openApiFilesVersion);
			}
		})().finally(() => {
			this.fullSyncInFlight = null;
		});

		return await this.fullSyncInFlight;
	}

	/**
	 * Send discovered OpenAPI files to the language server.
	 * This is the client→server sync mechanism that provides the "project model".
	 */
	private async sendOpenAPIFilesToServer(
		files: string[],
		version?: number,
	): Promise<void> {
		if (!this.client || this._state !== SessionState.Running) {
			this.log("Client not ready, skipping file sync to server");
			return;
		}

		try {
			const result = await this.client.sendRequest(
				"telescope/setOpenAPIFiles",
				{
					files,
					version,
				},
			);
			this.log(
				`Sent ${files.length} files to server: ${JSON.stringify(result)}`,
			);
			this.hasSentBaseline = true;
		} catch (error) {
			this.logError(`Failed to send files to server: ${error}`);
		}
	}

	private sendOpenApiFilesDelta(delta: {
		added?: string[];
		removed?: string[];
		changed?: string[];
	}): void {
		if (!this.client || this._state !== SessionState.Running) return;
		if (!this.hasSentBaseline) {
			// Avoid sending deltas before the server has a baseline snapshot; that just triggers resync churn.
			void this.syncOpenApiFilesFull({ clearScannerCache: false });
			return;
		}

		const added = delta.added ?? [];
		const removed = delta.removed ?? [];
		const changed = delta.changed ?? [];
		if (added.length === 0 && removed.length === 0 && changed.length === 0) return;

		// Merge into pending sets (last action wins semantics).
		for (const u of added) {
			this.pendingDelta.removed.delete(u);
			this.pendingDelta.changed.delete(u);
			this.pendingDelta.added.add(u);
		}
		for (const u of removed) {
			this.pendingDelta.added.delete(u);
			this.pendingDelta.changed.delete(u);
			this.pendingDelta.removed.add(u);
		}
		for (const u of changed) {
			// If it was newly added in this batch, a separate "changed" entry is redundant.
			if (this.pendingDelta.added.has(u)) continue;
			if (this.pendingDelta.removed.has(u)) continue;
			this.pendingDelta.changed.add(u);
		}

		if (this.deltaFlushTimer) return;
		this.deltaFlushTimer = setTimeout(() => {
			this.deltaFlushTimer = null;
			this.flushOpenApiFilesDelta();
		}, 75);
	}

	private flushOpenApiFilesDelta(): void {
		if (!this.client || this._state !== SessionState.Running) {
			// Keep pending; we’ll flush when running again.
			return;
		}
		if (!this.hasSentBaseline) {
			void this.syncOpenApiFilesFull({ clearScannerCache: false });
			return;
		}

		const added = Array.from(this.pendingDelta.added);
		const removed = Array.from(this.pendingDelta.removed);
		const changed = Array.from(this.pendingDelta.changed);
		if (added.length === 0 && removed.length === 0 && changed.length === 0) return;

		// Clear first to avoid duplication if sendNotification throws.
		this.pendingDelta.added.clear();
		this.pendingDelta.removed.clear();
		this.pendingDelta.changed.clear();

		this.openApiFilesVersion++;
		try {
			this.client.sendNotification("telescope/didChangeOpenApiFiles", {
				added,
				removed,
				changed,
				version: this.openApiFilesVersion,
			});
		} catch (error) {
			console.debug(`Failed to send OpenAPI file delta: ${error}`);
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
	 * Test/debug: get current client-side OpenAPI membership size.
	 */
	getClientOpenApiFileCount(): number {
		return this.openApiFiles.size;
	}

	/**
	 * Get project info from the language server.
	 * This is a test-only method for E2E testing.
	 */
	async getProjectInfo(): Promise<{
		knownOpenAPIFiles: number;
		rootDocuments: number;
		hasClientFileList: boolean;
		workspacePath: string | null;
		cachedDocuments: number;
	} | null> {
		if (!this.client || this._state !== SessionState.Running) {
			return null;
		}

		try {
			const result = await this.client.sendRequest("telescope/getProjectInfo");
			return result as {
				knownOpenAPIFiles: number;
				rootDocuments: number;
				hasClientFileList: boolean;
				workspacePath: string | null;
				cachedDocuments: number;
			};
		} catch (error) {
			this.logError(`Failed to get project info: ${error}`);
			return null;
		}
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
