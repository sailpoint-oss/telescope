/**
 * SessionManager - Orchestrates multiple Session instances for multi-root workspaces.
 *
 * Manages the lifecycle of Session instances, one per workspace folder.
 * Routes commands and requests to the appropriate session based on the active document.
 */

import * as vscode from "vscode";
import { Session, SessionState } from "./session";
import { formatSetupLog } from "./utils";

/**
 * Initialization state for the SessionManager.
 */
export enum InitializationState {
	/** Not started */
	Pending = "pending",
	/** Currently initializing */
	Initializing = "initializing",
	/** Initialization complete */
	Ready = "ready",
	/** Initialization failed */
	Failed = "failed",
}

/**
 * SessionManager orchestrates multiple Session instances.
 *
 * Responsibilities:
 * - Creates/destroys Session instances as workspace folders are added/removed
 * - Routes commands to the correct session based on active document
 * - Provides aggregate views across all sessions (e.g., all OpenAPI files)
 * - Manages shared resources like output channel and status bar
 */
export class SessionManager implements vscode.Disposable {
	/** Map of workspace folder URI -> Session */
	private sessions = new Map<string, Session>();

	/** Shared output channel for all sessions */
	private outputChannel: vscode.OutputChannel;

	/** Shared status bar item */
	private statusBarItem: vscode.StatusBarItem;

	/** Path to the server module */
	private serverModule: string;

	/** Path to Node.js runtime */
	private nodePath: string;

	/** Disposables for manager-level subscriptions */
	private disposables: vscode.Disposable[] = [];

	/** Current initialization state */
	private _initState: InitializationState = InitializationState.Pending;

	/** Promise that resolves when initialization is complete (for awaiting) */
	private _initPromise: Promise<void> | null = null;

	constructor(options: {
		serverModule: string;
		nodePath: string;
		outputChannel: vscode.OutputChannel;
		statusBarItem: vscode.StatusBarItem;
	}) {
		this.serverModule = options.serverModule;
		this.nodePath = options.nodePath;
		this.outputChannel = options.outputChannel;
		this.statusBarItem = options.statusBarItem;

		// Listen for workspace folder changes
		this.disposables.push(
			vscode.workspace.onDidChangeWorkspaceFolders(
				this.onDidChangeWorkspaceFolders.bind(this),
			),
		);

		this.log("SessionManager created");
	}

	/**
	 * Initialize sessions for all current workspace folders.
	 * Safe to call multiple times - subsequent calls return the same promise.
	 */
	async initialize(): Promise<void> {
		// If already initializing or initialized, return existing promise
		if (this._initPromise) {
			return this._initPromise;
		}

		this._initState = InitializationState.Initializing;
		this.updateStatusBar();

		this._initPromise = this.doInitialize();

		return this._initPromise;
	}

	/**
	 * Internal initialization logic.
	 */
	private async doInitialize(): Promise<void> {
		try {
			const folders = vscode.workspace.workspaceFolders || [];
			this.log(`Initializing sessions for ${folders.length} workspace folder(s)`);

			// Start sessions in parallel
			await Promise.all(
				folders.map((folder) => this.createSession(folder)),
			);

			this._initState = InitializationState.Ready;
			this.updateStatusBar();
		} catch (error) {
			this._initState = InitializationState.Failed;
			this.logError(`Initialization failed: ${error}`);
			this.updateStatusBar();
			throw error;
		}
	}

	/**
	 * Check if the session manager is fully initialized.
	 */
	get isReady(): boolean {
		return this._initState === InitializationState.Ready;
	}

	/**
	 * Get the current initialization state.
	 */
	get initializationState(): InitializationState {
		return this._initState;
	}

	/**
	 * Wait for initialization to complete.
	 * Returns immediately if already initialized, or waits if initialization is in progress.
	 * Throws if initialization failed.
	 */
	async waitForReady(): Promise<void> {
		if (this._initState === InitializationState.Ready) {
			return;
		}
		if (this._initState === InitializationState.Pending) {
			// Start initialization if not started
			await this.initialize();
			return;
		}
		if (this._initPromise) {
			await this._initPromise;
		}
	}

	/**
	 * Create and start a session for a workspace folder.
	 */
	private async createSession(folder: vscode.WorkspaceFolder): Promise<Session> {
		const id = folder.uri.toString();

		// Check if session already exists
		const existing = this.sessions.get(id);
		if (existing) {
			this.log(`Session already exists for ${folder.name}`);
			return existing;
		}

		this.log(`Creating session for ${folder.name}`);

		const session = new Session({
			workspaceFolder: folder,
			serverModule: this.serverModule,
			nodePath: this.nodePath,
			outputChannel: this.outputChannel,
			statusBarItem: this.statusBarItem,
		});

		this.sessions.set(id, session);

		try {
			await session.start();
		} catch (error) {
			this.logError(`Failed to start session for ${folder.name}: ${error}`);
			// Keep the session in the map so we can retry later
		}

		return session;
	}

	/**
	 * Stop and remove a session for a workspace folder.
	 */
	private async removeSession(folderUri: string): Promise<void> {
		const session = this.sessions.get(folderUri);
		if (!session) {
			return;
		}

		this.log(`Removing session for ${session.workspaceFolder.name}`);

		try {
			await session.stop();
		} catch (error) {
			this.logError(`Error stopping session: ${error}`);
		}

		this.sessions.delete(folderUri);
	}

	/**
	 * Handle workspace folder changes.
	 */
	private async onDidChangeWorkspaceFolders(
		event: vscode.WorkspaceFoldersChangeEvent,
	): Promise<void> {
		// Remove sessions for removed folders
		for (const folder of event.removed) {
			await this.removeSession(folder.uri.toString());
		}

		// Create sessions for added folders
		for (const folder of event.added) {
			await this.createSession(folder);
		}

		this.updateStatusBar();
	}

	/**
	 * Get the session for a given URI.
	 * Returns the session that owns the file, or undefined if not found.
	 */
	getSessionForUri(uri: vscode.Uri): Session | undefined {
		const folder = vscode.workspace.getWorkspaceFolder(uri);
		if (!folder) {
			return undefined;
		}
		return this.sessions.get(folder.uri.toString());
	}

	/**
	 * Get the session for the active document.
	 * Returns the session for the active editor's document, or undefined.
	 */
	getActiveSession(): Session | undefined {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			return undefined;
		}
		return this.getSessionForUri(activeEditor.document.uri);
	}

	/**
	 * Get all sessions.
	 */
	getAllSessions(): Session[] {
		return Array.from(this.sessions.values());
	}

	/**
	 * Get all running sessions.
	 */
	getRunningSessions(): Session[] {
		return this.getAllSessions().filter((s) => s.state === SessionState.Running);
	}

	/**
	 * Get all OpenAPI files across all sessions.
	 */
	getAllOpenAPIFiles(): string[] {
		const files: string[] = [];
		for (const session of this.sessions.values()) {
			files.push(...session.getOpenAPIFiles());
		}
		return files;
	}

	/**
	 * Get total count of OpenAPI files across all sessions.
	 */
	getTotalOpenAPIFileCount(): number {
		let count = 0;
		for (const session of this.sessions.values()) {
			count += session.getOpenAPIFiles().length;
		}
		return count;
	}

	/**
	 * Restart a specific session.
	 */
	async restartSession(folderUri: string): Promise<void> {
		const session = this.sessions.get(folderUri);
		if (session) {
			await session.restart();
		}
	}

	/**
	 * Restart all sessions.
	 */
	async restartAllSessions(): Promise<void> {
		this.log("Restarting all sessions");
		await Promise.all(
			Array.from(this.sessions.values()).map((session) => session.restart()),
		);
	}

	/**
	 * Rescan all workspaces.
	 */
	async rescanAll(): Promise<number> {
		let totalFiles = 0;
		for (const session of this.sessions.values()) {
			const scanner = session.getScanner();
			if (scanner && !scanner.isScanning()) {
				scanner.clearCache();
				const files = await scanner.scanWorkspace();
				totalFiles += files?.length || 0;
			}
		}
		this.updateStatusBar();
		return totalFiles;
	}

	/**
	 * Handle document classification for the appropriate session.
	 */
	async handleDocument(doc: vscode.TextDocument): Promise<void> {
		const session = this.getSessionForUri(doc.uri);
		if (session) {
			await session.handleDocument(doc);
		}
	}

	/**
	 * Reclassify a document in the appropriate session.
	 */
	async reclassifyDocument(doc: vscode.TextDocument): Promise<boolean> {
		const session = this.getSessionForUri(doc.uri);
		if (session) {
			return session.reclassifyDocument(doc);
		}
		return false;
	}

	/**
	 * Update the status bar with aggregate information.
	 */
	private updateStatusBar(): void {
		// Show initialization state if not ready
		if (this._initState === InitializationState.Pending) {
			this.statusBarItem.text = "$(file-code) OpenAPI: Pending";
			this.statusBarItem.tooltip = "Waiting to initialize...";
			this.statusBarItem.show();
			return;
		}

		if (this._initState === InitializationState.Initializing) {
			this.statusBarItem.text = "$(loading~spin) OpenAPI: Starting...";
			this.statusBarItem.tooltip = "Initializing language servers...";
			this.statusBarItem.show();
			return;
		}

		if (this._initState === InitializationState.Failed) {
			this.statusBarItem.text = "$(error) OpenAPI: Error";
			this.statusBarItem.tooltip = "Initialization failed. Click to restart.";
			this.statusBarItem.show();
			return;
		}

		const totalFiles = this.getTotalOpenAPIFileCount();
		const runningCount = this.getRunningSessions().length;
		const totalCount = this.sessions.size;

		if (totalCount === 0) {
			this.statusBarItem.text = "$(file-code) OpenAPI: No workspace";
			this.statusBarItem.tooltip = "No workspace folders";
		} else if (runningCount === totalCount) {
			this.statusBarItem.text = `$(file-code) OpenAPI: ${totalFiles} files`;
			this.statusBarItem.tooltip = `${totalFiles} OpenAPI files across ${totalCount} workspace(s)`;
		} else {
			this.statusBarItem.text = `$(file-code) OpenAPI: ${runningCount}/${totalCount} active`;
			this.statusBarItem.tooltip = `${runningCount} of ${totalCount} sessions running`;
		}

		this.statusBarItem.show();
	}

	/**
	 * Log a message to the output channel.
	 */
	private log(message: string): void {
		this.outputChannel.appendLine(formatSetupLog(`[SessionManager] ${message}`));
	}

	/**
	 * Log an error to the output channel.
	 */
	private logError(message: string): void {
		this.outputChannel.appendLine(
			formatSetupLog(`[SessionManager] ❌ ${message}`),
		);
	}

	/**
	 * Dispose of all sessions and resources.
	 */
	dispose(): void {
		this.log("Disposing SessionManager");

		// Stop all sessions
		for (const session of this.sessions.values()) {
			session.dispose();
		}
		this.sessions.clear();

		// Dispose subscriptions
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}

