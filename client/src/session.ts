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
	State,
} from "vscode-languageclient/node";
import { Trace } from "vscode-languageserver-protocol";
import { parse as yamlParse } from "yaml";
import { appendTraceEvent } from "./trace";
import {
	classifyDocument,
	DEFAULT_OPENAPI_PATTERNS,
	formatSetupLog,
	getBaseLanguageFromExtension,
	getOpenAPILanguageId,
	isOpenAPILanguage,
	matchesPatternList,
	TELESCOPE_CONFIG_PATHS,
} from "./utils";
import { WorkspaceScanner } from "./workspace-scanner";

type ManagedLanguage = "yaml" | "json" | "openapi-yaml" | "openapi-json";

type ServerClassificationParams = {
	uri: string;
	isOpenAPI: boolean;
	documentKind?: string;
	version?: string;
	isFragment?: boolean;
	confidence?: number;
};

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
	/** Optional channel for contract-test progress and Barometer results */
	contractOutputChannel?: vscode.OutputChannel;
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
	private languageSwitchInFlight = new Set<string>();

	/** Ensure start/stop are idempotent and safe under concurrency. */
	private startPromise: Promise<void> | null = null;
	private stopPromise: Promise<void> | null = null;

	/** Timer for delayed background scan */
	private backgroundScanTimer: ReturnType<typeof setTimeout> | null = null;

	/** Crash recovery state */
	private restartAttempts = 0;
	private static readonly MAX_RESTART_ATTEMPTS = 5;
	private static readonly BASE_RESTART_DELAY_MS = 1000;
	private restartTimer: ReturnType<typeof setTimeout> | null = null;

	/** Disposables for this session */
	private disposables: vscode.Disposable[] = [];

	/** Configuration options */
	private readonly serverPath: string;
	private readonly outputChannel: vscode.OutputChannel;
	private readonly contractOutputChannel: vscode.OutputChannel | undefined;
	private statusBarItem: vscode.StatusBarItem | null;
	private readonly workspaceState: vscode.Memento;

	constructor(options: SessionOptions) {
		this.workspaceFolder = options.workspaceFolder;
		this.id = options.workspaceFolder.uri.toString();
		this.serverPath = options.serverPath;
		this.outputChannel = options.outputChannel;
		this.contractOutputChannel = options.contractOutputChannel;
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
			appendTraceEvent(this.outputChannel, "session.starting", {
				workspace: this.workspaceFolder.uri.toString(),
				name: this.workspaceFolder.name,
			});

			try {
				await this.loadConfig();
				await this.startClient();
				this.initializeScanner();
				this.setupFileWatchers();
				this.setupDocumentHandlers();

				this._state = SessionState.Running;
				this._lastStartError = null;
				this.log(`Session started for ${this.workspaceFolder.name}`);
				appendTraceEvent(this.outputChannel, "session.running", {
					workspace: this.workspaceFolder.uri.toString(),
					name: this.workspaceFolder.name,
				});

				this.startBackgroundScan();
			} catch (error) {
				this._state = SessionState.Stopped;
				this._lastStartError =
					error instanceof Error
						? error.stack || error.message
						: String(error);
				this.logError(`Failed to start session: ${error}`);
				appendTraceEvent(this.outputChannel, "session.start.error", {
					workspace: this.workspaceFolder.uri.toString(),
					name: this.workspaceFolder.name,
					error: error instanceof Error ? error.message : String(error),
				});
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
			appendTraceEvent(this.outputChannel, "session.stopping", {
				workspace: this.workspaceFolder.uri.toString(),
				name: this.workspaceFolder.name,
			});

			try {
				if (this.restartTimer) {
					clearTimeout(this.restartTimer);
					this.restartTimer = null;
				}
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
				appendTraceEvent(this.outputChannel, "session.stopped", {
					workspace: this.workspaceFolder.uri.toString(),
					name: this.workspaceFolder.name,
				});
			} catch (error) {
				this._state = SessionState.Stopped;
				this.logError(`Error stopping session: ${error}`);
				appendTraceEvent(this.outputChannel, "session.stop.error", {
					workspace: this.workspaceFolder.uri.toString(),
					name: this.workspaceFolder.name,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		})().finally(() => {
			this.stopPromise = null;
		});

		return await this.stopPromise;
	}

	/**
	 * Restart the session (manual or auto-recovery).
	 */
	async restart(): Promise<void> {
		this.log(`Restarting session for ${this.workspaceFolder.name}`);
		this.restartAttempts = 0;
		if (this.restartTimer) {
			clearTimeout(this.restartTimer);
			this.restartTimer = null;
		}
		await this.stop();
		await this.start();
	}

	/**
	 * Schedule an auto-restart with exponential backoff after a crash.
	 */
	private scheduleRestart(): void {
		if (this.restartAttempts >= Session.MAX_RESTART_ATTEMPTS) {
			this.logError(
				`Server crashed ${this.restartAttempts} times for ${this.workspaceFolder.name}, giving up. Use 'Telescope: Restart Server' to retry.`,
			);
			vscode.window.showErrorMessage(
				"Telescope language server crashed repeatedly. Use \"Telescope: Restart Server\" to retry.",
			);
			return;
		}
		const delay =
			Session.BASE_RESTART_DELAY_MS * 2 ** this.restartAttempts;
		this.restartAttempts++;
		this.log(
			`Scheduling restart attempt ${this.restartAttempts}/${Session.MAX_RESTART_ATTEMPTS} in ${delay}ms`,
		);
		this.restartTimer = setTimeout(async () => {
			this.restartTimer = null;
			try {
				await this.stop();
				await this.start();
				this.log(
					`Auto-restart succeeded for ${this.workspaceFolder.name}`,
				);
				this.restartAttempts = 0;
			} catch (err) {
				this.logError(
					`Auto-restart attempt ${this.restartAttempts} failed: ${err}`,
				);
				this.scheduleRestart();
			}
		}, delay);
	}

	/**
	 * Load telescope config from this workspace folder.
	 */
	private async loadConfig(): Promise<void> {
		let loadedFrom: string | null = null;
		for (const configPath of TELESCOPE_CONFIG_PATHS) {
			const configUri = vscode.Uri.joinPath(this.workspaceFolder.uri, configPath);
			let content: Uint8Array;
			try {
				content = await vscode.workspace.fs.readFile(configUri);
			} catch {
				continue;
			}

			try {
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
				loadedFrom = configPath;
			} catch (error) {
				this.patterns = DEFAULT_OPENAPI_PATTERNS;
				this.logError(`Failed to parse ${configPath}: ${error}`);
			}
			break;
		}

		if (!loadedFrom) {
			this.patterns = DEFAULT_OPENAPI_PATTERNS;
		}
		this.log(
			`Loaded patterns${loadedFrom ? ` from ${loadedFrom}` : ""}: ${JSON.stringify(this.patterns)}`,
		);
	}

	/**
	 * Start the language client.
	 */
	private async startClient(): Promise<void> {
		const env: Record<string, string> = {};
		if (process.env.TELESCOPE_DEV) {
			env.TELESCOPE_DEV = process.env.TELESCOPE_DEV;
		}
		const serverOptions: ServerOptions = {
			run: {
				command: this.serverPath,
				args: ["serve"],
				options: { env: { ...process.env, ...env } },
			},
			debug: {
				command: this.serverPath,
				args: ["serve"],
				options: { env: { ...process.env, ...env } },
			},
		};

		const clientOptions: LanguageClientOptions = {
			documentSelector: [
				{ language: "yaml" },
				{ language: "json" },
				{ language: "openapi-json" },
				{ language: "openapi-yaml" },
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
		appendTraceEvent(this.outputChannel, "session.client.start", {
			workspace: this.workspaceFolder.uri.toString(),
			serverPath: this.serverPath,
		});
		await this.client.start();

		// Detect server crashes and attempt auto-restart with backoff.
		this.client.onDidChangeState((event) => {
			if (
				event.newState === State.Stopped &&
				this._state === SessionState.Running
			) {
				this.log(
					`Server process stopped unexpectedly for ${this.workspaceFolder.name}`,
				);
				appendTraceEvent(this.outputChannel, "session.crash.detected", {
					workspace: this.workspaceFolder.uri.toString(),
					attempt: this.restartAttempts,
				});
				this._state = SessionState.Stopped;
				this.client = null;
				this.scheduleRestart();
			}
		});

		// Listen for deprecated ranges notifications from the server
		this.client.onNotification(
			"telescope/deprecatedRanges",
			(params: {
				uri: string;
				ranges: Array<{
					range: {
						start: { line: number; character: number };
						end: { line: number; character: number };
					};
					name: string;
					kind: string;
				}>;
			}) => {
				if (this.onDeprecatedRanges) {
					this.onDeprecatedRanges(params);
				}
			},
		);

		this.client.onNotification(
			"$/telescope/classify",
			(params: ServerClassificationParams) => {
				void this.handleServerClassification(params);
			},
		);

		if (this.contractOutputChannel) {
			const ch = this.contractOutputChannel;
			this.client.onNotification(
				"telescope/contractTestProgress",
				(params: {
					runId?: string;
					phase?: string;
					message?: string;
					percent?: number;
				}) => {
					const parts = [
						params.runId ? `[${params.runId}]` : "",
						params.phase,
						params.message,
						params.percent != null ? `${params.percent}%` : "",
					].filter((p) => p !== "");
					ch.appendLine(parts.length > 0 ? parts.join(" ") : "contract test progress");
				},
			);
			this.client.onNotification(
				"telescope/contractTestFinished",
				(params: {
					runId?: string;
					error?: string;
					baseUrl?: string;
					result?: { pass?: boolean };
				}) => {
					if (params.error) {
						ch.appendLine(
							`[${params.runId ?? "?"}] error: ${params.error}`,
						);
						void vscode.window.showWarningMessage(
							`Contract tests failed: ${params.error}`,
						);
						return;
					}
					ch.appendLine(
						`[${params.runId ?? "?"}] finished baseUrl=${params.baseUrl ?? ""} pass=${String(params.result?.pass ?? false)}`,
					);
					if (params.result?.pass) {
						void vscode.window.showInformationMessage(
							"Contract tests passed.",
						);
					} else {
						void vscode.window.showWarningMessage(
							"Contract tests reported failures. See Telescope Contract Tests output.",
						);
					}
				},
			);
		}

		this.log(`Language client started`);
	}

	/** Callback for deprecated ranges notifications, set by the extension. */
	onDeprecatedRanges:
		| ((params: {
				uri: string;
				ranges: Array<{
					range: {
						start: { line: number; character: number };
						end: { line: number; character: number };
					};
					name: string;
					kind: string;
				}>;
		  }) => void)
		| null = null;

	/**
	 * Apply current Telescope configuration to the running language client.
	 * Safe to call whether the client is started or not.
	 */
	applyTraceSetting(): void {
		if (!this.client) return;
		const cfg = vscode.workspace.getConfiguration("telescope", this.workspaceFolder.uri);
		const traceLevel = cfg.get<"off" | "messages" | "verbose">("trace", "off");
		appendTraceEvent(this.outputChannel, "session.trace.level", {
			workspace: this.workspaceFolder.uri.toString(),
			level: traceLevel,
		});
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
	async executeServerCommand(command: string, args: unknown[]): Promise<unknown> {
		if (!this.client || this._state !== SessionState.Running) return undefined;
		return this.client.sendRequest("workspace/executeCommand", {
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
				appendTraceEvent(this.outputChannel, "session.file.changed", {
					workspace: this.workspaceFolder.uri.toString(),
					uri: uri.toString(),
				});
				this.scanner?.invalidate(uri.toString());
				if (!this.matchesOpenAPIPatterns(uri)) return;
				await this.scanner?.classifyFile(uri);
			}
		});

		fileWatcher.onDidDelete((uri) => {
			if (this.ownsUri(uri)) {
				appendTraceEvent(this.outputChannel, "session.file.deleted", {
					workspace: this.workspaceFolder.uri.toString(),
					uri: uri.toString(),
				});
				this.scanner?.invalidate(uri.toString());
				this.scanner?.recount();
				this.classifiedDocuments.delete(uri.toString());
			}
		});

		fileWatcher.onDidCreate(async (uri) => {
			if (this.ownsUri(uri) && this.matchesOpenAPIPatterns(uri)) {
				appendTraceEvent(this.outputChannel, "session.file.created", {
					workspace: this.workspaceFolder.uri.toString(),
					uri: uri.toString(),
				});
				await this.scanner?.classifyFile(uri);
				this.scanner?.recount();
			}
		});

		this.disposables.push(fileWatcher);

		const handleConfigChange = async () => {
			this.log("Config file changed, reloading...");
			await this.loadConfig();

			this.classifiedDocuments.clear();
			this.userOverrides.clear();
			this.scanner?.clearCache();

			await this.runScan();
		};

		for (const configPath of TELESCOPE_CONFIG_PATHS) {
			const configWatcher = vscode.workspace.createFileSystemWatcher(
				new vscode.RelativePattern(this.workspaceFolder, configPath),
			);
			configWatcher.onDidChange(() => {
				void handleConfigChange();
			});
			configWatcher.onDidCreate(() => {
				void handleConfigChange();
			});
			configWatcher.onDidDelete(() => {
				void handleConfigChange();
			});
			this.disposables.push(configWatcher);
		}
	}

	/**
	 * Set up document handlers for this session.
	 */
	private setupDocumentHandlers(): void {
		const openDisposable = vscode.workspace.onDidOpenTextDocument((doc) => {
			if (this.ownsUri(doc.uri)) {
				const uri = doc.uri.toString();
				if (doc.uri.fragment) {
					void this.redirectFragmentDefinitionOpen(doc);
					return;
				}
				const inFlight = this.languageSwitchInFlight.has(uri);
				if (inFlight) {
					return;
				}
				this.handleDocument(doc, "onDidOpen");
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
				if (doc.uri.fragment) {
					void this.redirectFragmentDefinitionOpen(doc);
					continue;
				}
				this.handleDocument(doc, "initialSweep");
			}
		}
	}

	private async redirectFragmentDefinitionOpen(doc: vscode.TextDocument): Promise<void> {
		const fragment = doc.uri.fragment;
		const baseUri = doc.uri.with({ fragment: "" });
		if (!fragment || !this.ownsUri(baseUri)) return;

		const token = this.extractFragmentTargetToken(fragment);
		const baseDoc = await vscode.workspace.openTextDocument(baseUri);
		const pos = this.findTokenPosition(baseDoc, token);
		const existingEditor = vscode.window.visibleTextEditors.find(
			(e) => e.document.uri.toString() === baseUri.toString(),
		);
		const editor =
			existingEditor ??
			(await vscode.window.showTextDocument(baseDoc, {
				preview: true,
				preserveFocus: false,
				viewColumn: vscode.ViewColumn.Active,
			}));
		editor.selection = new vscode.Selection(pos, pos);
		editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
		await this.closeFragmentTabs(doc.uri);
	}

	private async closeFragmentTabs(fragmentUri: vscode.Uri): Promise<number> {
		let closed = 0;
		for (const group of vscode.window.tabGroups.all) {
			for (const tab of group.tabs) {
				const input = tab.input;
				if (
					input instanceof vscode.TabInputText &&
					input.uri.toString() === fragmentUri.toString()
				) {
					if (await vscode.window.tabGroups.close(tab, true)) {
						closed++;
					}
				}
			}
		}
		return closed;
	}

	private extractFragmentTargetToken(fragment: string): string {
		if (!fragment) return "";
		let decoded = fragment;
		try {
			decoded = decodeURIComponent(fragment);
		} catch {
			// ignore invalid escaping
		}
		// Strip any position suffixes like "#198,7#180,7".
		const pointer = decoded.split("#")[0] ?? decoded;
		const segments = pointer.split("/").filter(Boolean);
		const raw = segments[segments.length - 1] ?? "";
		return raw.split("~1").join("/").split("~0").join("~");
	}

	private findTokenPosition(doc: vscode.TextDocument, token: string): vscode.Position {
		if (!token) return new vscode.Position(0, 0);
		const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const keyPattern = new RegExp(`^\\s*${escaped}:\\s*(#.*)?$`);
		for (let i = 0; i < doc.lineCount; i++) {
			const text = doc.lineAt(i).text;
			if (!keyPattern.test(text.trimEnd())) continue;
			const character = Math.max(0, text.indexOf(token));
			return new vscode.Position(i, character);
		}
		return new vscode.Position(0, 0);
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
	async handleDocument(
		doc: vscode.TextDocument,
		source: "onDidOpen" | "initialSweep" | "external" = "external",
	): Promise<void> {
		const uri = doc.uri.toString();
		const languageId = doc.languageId;
		const filePath = doc.uri.fsPath;
		if (doc.uri.fragment) {
			return;
		}
		appendTraceEvent(this.outputChannel, "session.handleDocument", {
			workspace: this.workspaceFolder.uri.toString(),
			uri,
			languageId,
			source,
		});

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
					doc = await this.setDocumentLanguageWithGuard(
						doc,
						baseLanguage,
						"live",
					);
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
					await this.setDocumentLanguageWithGuard(doc, targetLanguage, "cached");
				} catch (error) {
					console.debug("Failed to re-apply OpenAPI classification:", error);
				}
			}
			return;
		}

		const classifyResult = classifyDocument(doc);
		const isOpenAPI = classifyResult === "openapi";
		this.scanner?.rememberClassification(uri, isOpenAPI);

		if (isOpenAPI) {
			try {
				const targetLanguage = getOpenAPILanguageId(filePath);
				await this.setDocumentLanguageWithGuard(doc, targetLanguage, "live");
			} catch (error) {
				console.debug("Failed to set document language:", error);
			}
		}
	}

	private async setDocumentLanguageWithGuard(
		doc: vscode.TextDocument,
		targetLanguage: ManagedLanguage,
		reason: "cached" | "live" | "server",
	): Promise<vscode.TextDocument> {
		const uri = doc.uri.toString();
		if (doc.languageId === targetLanguage) return doc;
		if (this.languageSwitchInFlight.has(uri)) {
			return doc;
		}

		this.languageSwitchInFlight.add(uri);
		try {
			appendTraceEvent(this.outputChannel, "session.language.switch", {
				workspace: this.workspaceFolder.uri.toString(),
				uri,
				from: doc.languageId,
				to: targetLanguage,
				reason,
			});
			const newDoc = await vscode.languages.setTextDocumentLanguage(
				doc,
				targetLanguage,
			);
			if (isOpenAPILanguage(targetLanguage)) {
				this.classifiedDocuments.set(uri, targetLanguage);
			} else {
				this.classifiedDocuments.delete(uri);
			}
			return newDoc;
		} finally {
			this.languageSwitchInFlight.delete(uri);
		}
	}

	private async handleServerClassification(
		params: ServerClassificationParams,
	): Promise<void> {
		const uri = vscode.Uri.parse(params.uri);
		if (uri.fragment || !this.ownsUri(uri)) {
			return;
		}

		if (
			!matchesPatternList(
				uri.fsPath,
				this.patterns,
				this.workspaceFolder.uri.fsPath,
			)
		) {
			return;
		}

		appendTraceEvent(this.outputChannel, "session.classification.server", {
			workspace: this.workspaceFolder.uri.toString(),
			uri: params.uri,
			isOpenAPI: params.isOpenAPI,
			documentKind: params.documentKind ?? "",
			confidence: params.confidence ?? 0,
		});

		this.scanner?.rememberClassification(params.uri, params.isOpenAPI);
		if (this.userOverrides.has(params.uri)) {
			return;
		}

		const openDoc = vscode.workspace.textDocuments.find(
			(doc) => doc.uri.toString() === params.uri,
		);
		if (!openDoc) {
			return;
		}

		if (params.isOpenAPI) {
			const targetLanguage = getOpenAPILanguageId(uri.fsPath);
			await this.setDocumentLanguageWithGuard(openDoc, targetLanguage, "server");
			return;
		}

		this.classifiedDocuments.delete(params.uri);
		if (!isOpenAPILanguage(openDoc.languageId)) {
			return;
		}

		const baseLanguage = getBaseLanguageFromExtension(uri.fsPath);
		if (!baseLanguage) {
			return;
		}
		await this.setDocumentLanguageWithGuard(openDoc, baseLanguage, "server");
	}

	/**
	 * Clear user override for a document and re-classify.
	 */
	async reclassifyDocument(doc: vscode.TextDocument): Promise<boolean> {
		const uri = doc.uri.toString();
		this.userOverrides.delete(uri);
		this.classifiedDocuments.delete(uri);
		await this.handleDocument(doc);
		return this.scanner?.getClassification(uri)?.isOpenAPI ?? false;
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
