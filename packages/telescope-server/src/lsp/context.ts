/**
 * TelescopeContext - Simplified shared context for the LSP server.
 *
 * This module provides a simple context class that manages:
 * - Workspace configuration
 * - Rule loading and caching
 * - Known OpenAPI files tracking
 * - Logging
 *
 * This replaces the complex Volar-dependent telescopeVolarContext.
 *
 * @module lsp/context
 */

import type { Connection, InitializeParams } from "vscode-languageserver";
import { URI } from "vscode-uri";
import type {
	GenericRule,
	ResolvedGenericRule,
	ResolvedRule,
	TelescopeConfig,
} from "../engine/index.js";
import {
	matchesPattern,
	materializeGenericRules,
	materializeRules,
	resolveConfig,
} from "../engine/index.js";

/**
 * Logger interface for diagnostic and debug output.
 */
export interface Logger {
	log(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
}

/**
 * TelescopeContext manages shared state for the LSP server.
 *
 * This is a simplified version that doesn't depend on Volar.
 * It handles configuration, rules, and workspace state.
 *
 * @example
 * ```typescript
 * const ctx = new TelescopeContext(connection);
 * ctx.initialize(initParams);
 * await ctx.rulesLoadPromise;
 * const rules = ctx.getRules();
 * ```
 */
export class TelescopeContext {
	private connection: Connection;
	private workspaceFolders: string[] = [];
	private workspacePath: string | undefined;
	private config: TelescopeConfig;
	private configSignature: string = "";

	// Rules
	private resolvedRules: ResolvedRule[] = [];
	private genericRules: ResolvedGenericRule[] = [];

	// Known OpenAPI files (from client scan)
	private knownOpenAPIFiles = new Set<string>();
	private hasReceivedClientFileList = false;

	// Root documents (files with openapi: x.x.x)
	private rootDocumentUris = new Set<string>();

	// Affected URIs (files that need re-validation)
	private affectedUris = new Set<string>();

	// Initial scan tracking
	private hasPerformedInitialScan = false;

	// Client capabilities
	private _hasWorkspaceFolderCapability = false;

	/** Promise that resolves when rules are loaded */
	public rulesLoadPromise: Promise<void> = Promise.resolve();

	/** Error from last rule loading attempt */
	private rulesLoadError: Error | undefined;

	constructor(connection: Connection) {
		this.connection = connection;
		this.config = resolveConfig(undefined);
	}

	/**
	 * Initialize the context with LSP initialization params.
	 */
	initialize(params: InitializeParams): void {
		// Prefer explicit single-workspace initialization from the client.
		// The VS Code extension spawns one server process per workspace folder and passes it here.
		const initOpts = params.initializationOptions as
			| { workspaceFolder?: string }
			| undefined;
		const explicitWorkspaceFolder = initOpts?.workspaceFolder;

		// Extract workspace folders
		if (explicitWorkspaceFolder) {
			this.workspaceFolders = [explicitWorkspaceFolder];
			this.workspacePath = URI.parse(explicitWorkspaceFolder).fsPath;
		} else if (params.workspaceFolders?.length) {
			const folder = params.workspaceFolders[0];
			this.workspaceFolders = [folder.uri];
			this.workspacePath = URI.parse(folder.uri).fsPath;
		} else if (params.rootUri) {
			this.workspaceFolders = [params.rootUri];
			this.workspacePath = URI.parse(params.rootUri).fsPath;
		}

		// Store client capabilities
		this._hasWorkspaceFolderCapability =
			!!params.capabilities.workspace?.workspaceFolders;

		// Load configuration
		this.config = resolveConfig(this.workspacePath);
		this.configSignature = this.computeConfigSignature();

		// Load rules asynchronously
		this.rulesLoadPromise = this.loadRules();

		this.log(`Initialized with workspace: ${this.workspacePath ?? "none"}`);
	}

	/**
	 * Load rules for this workspace.
	 */
	private async loadRules(): Promise<void> {
		if (!this.workspacePath) {
			this.resolvedRules = [];
			this.genericRules = [];
			this.rulesLoadError = undefined;
			return;
		}

		try {
			this.rulesLoadError = undefined;

			// Load OpenAPI rules
			this.resolvedRules = await materializeRules(
				this.config,
				this.workspacePath,
			);

			// Load generic rules
			this.genericRules = await materializeGenericRules(
				this.config,
				this.workspacePath,
			);

			this.log(
				`Loaded ${this.resolvedRules.length} OpenAPI rules, ${this.genericRules.length} generic rules`,
			);
		} catch (error) {
			this.rulesLoadError =
				error instanceof Error ? error : new Error(String(error));
			this.error(`Failed to load rules: ${this.rulesLoadError.message}`);
			this.resolvedRules = [];
			this.genericRules = [];
		}
	}

	/**
	 * Reload configuration from disk.
	 * Returns true if the configuration changed.
	 */
	reloadConfiguration(): boolean {
		const nextConfig = resolveConfig(this.workspacePath);
		const nextSignature = this.computeConfigSignature(nextConfig);

		if (nextSignature === this.configSignature) {
			return false;
		}

		this.config = nextConfig;
		this.configSignature = nextSignature;

		// Reload rules
		this.rulesLoadPromise = this.rulesLoadPromise
			.catch(() => {})
			.then(() => this.loadRules());

		this.log(`Configuration reloaded`);
		return true;
	}

	private computeConfigSignature(config?: TelescopeConfig): string {
		const c = config ?? this.config;
		return JSON.stringify(c);
	}

	// =========================================================================
	// Configuration Getters
	// =========================================================================

	getConfig(): TelescopeConfig {
		return this.config;
	}

	getWorkspacePath(): string | undefined {
		return this.workspacePath;
	}

	getWorkspaceFolders(): string[] {
		return this.workspaceFolders;
	}

	/**
	 * Check if the client supports workspace folder events.
	 */
	hasWorkspaceFolderCapability(): boolean {
		return this._hasWorkspaceFolderCapability;
	}

	// =========================================================================
	// Rule Getters
	// =========================================================================

	/**
	 * Get all resolved OpenAPI rules.
	 */
	getResolvedRules(): ResolvedRule[] {
		return this.resolvedRules;
	}

	/**
	 * Get all rule implementations.
	 */
	getRules(): ResolvedRule["rule"][] {
		return this.resolvedRules.map((r) => r.rule);
	}

	/**
	 * Get rule implementations for a specific URI.
	 */
	getRulesForUri(_uri: string): ResolvedRule["rule"][] {
		// In single-root mode, same rules for all files
		return this.getRules();
	}

	/**
	 * Get generic rules for a specific file URI.
	 * Filters by patterns that match the file.
	 */
	getGenericRulesForUri(uri: string): GenericRule[] {
		const workspacePath = this.workspacePath;
		if (!workspacePath) {
			return [];
		}

		return this.genericRules
			.filter((resolved) =>
				matchesPattern(uri, resolved.patterns, [workspacePath]),
			)
			.map((resolved) => resolved.rule);
	}

	/**
	 * Check if rule loading failed.
	 */
	hasRulesLoadError(): boolean {
		return this.rulesLoadError !== undefined;
	}

	/**
	 * Get the rule loading error.
	 */
	getRulesLoadError(): Error | undefined {
		return this.rulesLoadError;
	}

	// =========================================================================
	// Known OpenAPI Files Management
	// =========================================================================

	/**
	 * Set known OpenAPI files from client scan.
	 */
	setKnownOpenAPIFiles(files: string[]): void {
		this.knownOpenAPIFiles = new Set(files);
		this.hasReceivedClientFileList = true;
		this.log(`Received ${files.length} OpenAPI files from client`);
	}

	/**
	 * Get all known OpenAPI file URIs.
	 */
	getKnownOpenAPIFiles(): string[] {
		return Array.from(this.knownOpenAPIFiles);
	}

	/**
	 * Add a file to known OpenAPI files.
	 */
	addKnownOpenAPIFile(uri: string): void {
		this.knownOpenAPIFiles.add(uri);
	}

	/**
	 * Remove a file from known OpenAPI files.
	 */
	removeKnownOpenAPIFile(uri: string): void {
		this.knownOpenAPIFiles.delete(uri);
	}

	/**
	 * Check if a file is a known OpenAPI file.
	 */
	isKnownOpenAPIFile(uri: string): boolean {
		return this.knownOpenAPIFiles.has(uri);
	}

	/**
	 * Check if we've received the file list from client.
	 */
	hasClientFileList(): boolean {
		return this.hasReceivedClientFileList;
	}

	/**
	 * Clear known OpenAPI files.
	 */
	clearKnownOpenAPIFiles(): void {
		this.knownOpenAPIFiles.clear();
		this.hasReceivedClientFileList = false;
	}

	// =========================================================================
	// Root Document Tracking
	// =========================================================================

	/**
	 * Get all root document URIs.
	 */
	getRootDocumentUris(): string[] {
		return Array.from(this.rootDocumentUris);
	}

	/**
	 * Add a root document URI.
	 */
	addRootDocument(uri: string): void {
		this.rootDocumentUris.add(uri);
	}

	/**
	 * Remove a root document URI.
	 */
	removeRootDocument(uri: string): void {
		this.rootDocumentUris.delete(uri);
	}

	/**
	 * Check if a URI is a root document.
	 */
	isRootDocument(uri: string): boolean {
		return this.rootDocumentUris.has(uri);
	}

	/**
	 * Clear all root documents.
	 */
	clearRootDocuments(): void {
		this.rootDocumentUris.clear();
	}

	// =========================================================================
	// Affected URIs (for incremental validation)
	// =========================================================================

	/**
	 * Get affected URIs that need re-validation.
	 */
	getAffectedUris(): string[] {
		return Array.from(this.affectedUris);
	}

	/**
	 * Mark URIs as affected.
	 */
	markAffected(...uris: string[]): void {
		for (const uri of uris) {
			this.affectedUris.add(uri);
		}
	}

	/**
	 * Clear affected URIs.
	 */
	clearAffectedUris(): void {
		this.affectedUris.clear();
	}

	// =========================================================================
	// Initial Scan Tracking
	// =========================================================================

	/**
	 * Check if initial workspace scan has been performed.
	 */
	hasInitialScanBeenPerformed(): boolean {
		return this.hasPerformedInitialScan;
	}

	/**
	 * Mark initial scan as performed.
	 */
	markInitialScanPerformed(): void {
		this.hasPerformedInitialScan = true;
	}

	/**
	 * Reset initial scan flag.
	 */
	resetInitialScan(): void {
		this.hasPerformedInitialScan = false;
	}

	// =========================================================================
	// Logging
	// =========================================================================

	/**
	 * Log an info message.
	 */
	log(message: string, ...args: unknown[]): void {
		this.connection.console.log(`[Telescope] ${message}`, ...args);
	}

	/**
	 * Log an error message.
	 */
	error(message: string, ...args: unknown[]): void {
		this.connection.console.error(`[Telescope] ${message}`, ...args);
	}

	/**
	 * Log a warning message.
	 */
	warn(message: string, ...args: unknown[]): void {
		this.connection.console.warn(`[Telescope] ${message}`, ...args);
	}

	/**
	 * Get a scoped logger.
	 */
	getLogger(scope: string): Logger {
		const prefix = `[Telescope:${scope}]`;
		return {
			log: (msg, ...args) =>
				this.connection.console.log(`${prefix} ${msg}`, ...args),
			error: (msg, ...args) =>
				this.connection.console.error(`${prefix} ${msg}`, ...args),
			warn: (msg, ...args) =>
				this.connection.console.warn(`${prefix} ${msg}`, ...args),
		};
	}
}
