import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { LanguageServer } from "@volar/language-server";
import type {
	AdditionalValidationGroup,
	GenericRule,
	LintConfig,
	ResolvedRule,
} from "lens";
import {
	DocumentTypeCache,
	matchesPattern,
	materializeGenericRules,
	materializeRules,
	resolveConfig,
} from "lens";
import type { URI } from "vscode-uri";
import { URI as Uri } from "vscode-uri";
import type { z } from "zod";
import { Core } from "../core/core.js";
import { loadSchema } from "../services/validation/schema-loader.js";
import { OpenAPIDocumentStore } from "./documents";

export interface DiagnosticsLogger {
	// biome-ignore lint/suspicious/noExplicitAny: These should ACTUALLY be any
	log(message: any, ...args: any[]): void;
	// biome-ignore lint/suspicious/noExplicitAny: These should ACTUALLY be any
	error(message: any, ...args: any[]): void;
	// biome-ignore lint/suspicious/noExplicitAny: These should ACTUALLY be any
	warn?(message: any, ...args: any[]): void;
}

export class ApertureVolarContext {
	readonly documentCache = new DocumentTypeCache();
	readonly documents = new OpenAPIDocumentStore(this.documentCache);
	private _core?: Core;
	private readonly server?: LanguageServer;

	private logger: DiagnosticsLogger;
	private scopedLoggers = new Map<string, DiagnosticsLogger>();
	private config: LintConfig;
	private configSignature: string;
	private resolvedRules: ResolvedRule[];
	private genericRules: GenericRule[] = [];
	private jsonSchemas: Array<{
		schema: unknown;
		groupLabel: string;
		schemaPattern?: string;
		zodSchema?: z.ZodType<unknown>;
	}> = [];
	private workspaceFolderUris: string[] = [];
	private workspaceFolderPaths: string[] = [];
	private affectedUris = new Set<string>();
	private rootDocumentUris = new Set<string>(); // Track root documents discovered via file watcher
	private hasPerformedInitialScan = false; // Track if we've done initial workspace scan

	constructor(logger: DiagnosticsLogger = console, server?: LanguageServer) {
		this.logger = logger;
		this.server = server;
		// Load config from workspace root if available
		const workspaceRoot = this.getWorkspaceRoot();
		this.config = resolveConfig(workspaceRoot);
		this.configSignature = computeConfigSignature(this.config);
		// Initialize rules synchronously (will be reloaded async on first use)
		this.resolvedRules = [];
		this.genericRules = [];
		this.jsonSchemas = [];
		// Load rules asynchronously
		void this.loadRules();
	}

	get core(): Core {
		if (!this._core) {
			this._core = new Core(this);
		}
		return this._core;
	}

	/**
	 * Get the FileSystem instance from the server.
	 * Throws if server is not available.
	 */
	getFileSystem() {
		if (!this.server) {
			throw new Error(
				"FileSystem not available - server instance required for file operations",
			);
		}
		return this.server.fileSystem;
	}

	setLogger(logger: DiagnosticsLogger): void {
		this.logger = logger;
		this.scopedLoggers.clear();
	}

	getLogger(id?: string): DiagnosticsLogger {
		if (!id) {
			return this.logger;
		}

		const cached = this.scopedLoggers.get(id);
		if (cached) {
			return cached;
		}

		const prefix = `[${id}] `;
		const scopedLogger: DiagnosticsLogger = {
			// biome-ignore lint/suspicious/noExplicitAny: These should ACTUALLY be any
			log: (message: any, ...args: any[]) =>
				this.logger.log?.(`${prefix}${message}`, ...args),
			// biome-ignore lint/suspicious/noExplicitAny: These should ACTUALLY be any
			error: (message: any, ...args: any[]) =>
				this.logger.error?.(`${prefix}${message}`, ...args),
			// biome-ignore lint/suspicious/noExplicitAny: These should ACTUALLY be any
			warn: (message: any, ...args: any[]) =>
				this.logger.warn?.(`${prefix}${message}`, ...args) ??
				this.logger.log?.(`${prefix}${message}`, ...args),
		};

		this.scopedLoggers.set(id, scopedLogger);
		return scopedLogger;
	}

	setWorkspaceFolders(folders: URI[]): void {
		this.workspaceFolderUris = folders.map((folder) => folder.toString());
		this.workspaceFolderPaths = folders
			.map((folder) => {
				try {
					return folder.fsPath;
				} catch {
					return Uri.parse(folder.toString()).fsPath;
				}
			})
			.filter(Boolean);
		// Reload config when workspace folders change
		const workspaceRoot = this.getWorkspaceRoot();
		this.config = resolveConfig(workspaceRoot);
		this.configSignature = computeConfigSignature(this.config);
		// Reload rules asynchronously
		void this.loadRules();
	}

	getWorkspaceFolders(): string[] {
		return this.workspaceFolderUris;
	}

	getResolvedRules(): ResolvedRule[] {
		return this.resolvedRules;
	}

	getRuleImplementations(): ResolvedRule["rule"][] {
		return this.resolvedRules.map((resolved) => resolved.rule);
	}

	getConfigSignature(): string {
		return this.configSignature;
	}

	reloadConfiguration(): boolean {
		const workspaceRoot = this.getWorkspaceRoot();
		const nextConfig = resolveConfig(workspaceRoot);
		const nextSignature = computeConfigSignature(nextConfig);
		if (nextSignature === this.configSignature) {
			this.logger.log?.(
				`[Context] reloadConfiguration skipped - configuration signature unchanged (${nextSignature})`,
			);
			return false;
		}
		this.config = nextConfig;
		this.configSignature = nextSignature;
		// Reload rules asynchronously
		void this.loadRules();
		this.logger.log?.(
			`[Context] Configuration reloaded - new signature ${this.configSignature}`,
		);
		return true;
	}

	/**
	 * Load rules and schemas asynchronously.
	 */
	private async loadRules(): Promise<void> {
		const workspaceRoot = this.getWorkspaceRoot();
		try {
			// Load OpenAPI rules
			this.resolvedRules = await materializeRules(this.config, workspaceRoot);

			// Load generic rules
			this.genericRules = await materializeGenericRules(
				this.config,
				workspaceRoot,
			);

			// Load JSON schemas - store with group label for simple lookup
			this.jsonSchemas = [];
			if (workspaceRoot && this.config.additionalValidation?.groups) {
				for (const [label, group] of Object.entries(
					this.config.additionalValidation.groups,
				)) {
					if (group.schemas) {
						for (const schemaConfig of group.schemas) {
							try {
								// Resolve schema path - try .telescope/schemas/ first, then workspace root
								let schemaPath: string;
								if (schemaConfig.schema.startsWith(".telescope/")) {
									schemaPath = resolvePath(workspaceRoot, schemaConfig.schema);
								} else if (
									!schemaConfig.schema.startsWith("/") &&
									!/^[a-zA-Z]:/.test(schemaConfig.schema)
								) {
									// Relative path - try .telescope/schemas/ first, then workspace root
									const telescopePath = resolvePath(
										workspaceRoot,
										".telescope",
										"schemas",
										schemaConfig.schema,
									);
									schemaPath = existsSync(telescopePath)
										? telescopePath
										: resolvePath(workspaceRoot, schemaConfig.schema);
								} else {
									// Absolute path
									schemaPath = schemaConfig.schema;
								}

								if (existsSync(schemaPath)) {
									// Use shared schema loader to handle both JSON and TS/Zod schemas
									const loaded = await loadSchema(schemaPath);
									if (loaded) {
										this.jsonSchemas.push({
											schema: loaded.jsonSchema,
											zodSchema: loaded.zodSchema,
											groupLabel: label,
											schemaPattern: schemaConfig.pattern, // Optional per-schema pattern
										});
									} else {
										this.logger.warn?.(
											`[Context] Failed to load schema from: ${schemaPath}`,
										);
									}
								} else {
									this.logger.warn?.(
										`[Context] Schema file not found: ${schemaPath}`,
									);
								}
							} catch (error) {
								this.logger.warn?.(
									`[Context] Failed to load schema from ${
										schemaConfig.schema
									}: ${error instanceof Error ? error.message : String(error)}`,
								);
							}
						}
					}
				}
			}
		} catch (error) {
			this.logger.error(
				`[Context] Failed to load rules: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	getGenericRules(): GenericRule[] {
		return this.genericRules;
	}

	getGenericRulePatterns(): string[] {
		const patterns: string[] = [];

		if (this.config.additionalValidation?.groups) {
			for (const [_label, group] of Object.entries(
				this.config.additionalValidation.groups,
			)) {
				// Add group-level patterns
				if (group.patterns) {
					patterns.push(...group.patterns);
				}
				// Add rule-specific patterns
				if (group.rules) {
					for (const ruleConfig of group.rules) {
						if (ruleConfig.pattern) {
							patterns.push(ruleConfig.pattern);
						}
					}
				}
			}
		}

		return patterns;
	}

	/**
	 * Get AdditionalValidation groups configuration.
	 */
	getAdditionalValidationGroups(): Record<string, AdditionalValidationGroup> {
		return this.config.additionalValidation?.groups ?? {};
	}

	getJsonSchemas(): Array<{
		schema: unknown;
		groupLabel: string;
		schemaPattern?: string;
		zodSchema?: z.ZodType<unknown>;
	}> {
		return this.jsonSchemas;
	}

	/**
	 * Get the workspace root path for config loading.
	 * Returns the first workspace folder path, or undefined if none set.
	 */
	private getWorkspaceRoot(): string | undefined {
		return this.workspaceFolderPaths.length > 0
			? this.workspaceFolderPaths[0]
			: undefined;
	}

	/**
	 * Check if a file URI should be processed based on include/exclude patterns.
	 * @param uri - The file URI to check
	 * @returns true if the file should be processed, false otherwise
	 */
	shouldProcessFile(uri: string): boolean {
		return matchesPattern(
			uri,
			this.config.include,
			this.config.exclude,
			this.workspaceFolderPaths,
		);
	}

	getAffectedUris(): string[] {
		return Array.from(this.affectedUris);
	}

	markAffected(...uris: string[]): void {
		for (const uri of uris) {
			this.affectedUris.add(uri);
		}
	}

	clearAffectedUris(): void {
		this.affectedUris.clear();
	}

	/**
	 * Get all known root document URIs (from file watcher tracking).
	 */
	getRootDocumentUris(): string[] {
		return Array.from(this.rootDocumentUris);
	}

	/**
	 * Add a URI to the root documents set.
	 */
	addRootDocument(uri: string): void {
		this.rootDocumentUris.add(uri);
	}

	/**
	 * Remove a URI from the root documents set.
	 */
	removeRootDocument(uri: string): void {
		this.rootDocumentUris.delete(uri);
	}

	/**
	 * Check if a URI is a known root document.
	 */
	isRootDocument(uri: string): boolean {
		return this.rootDocumentUris.has(uri);
	}

	/**
	 * Clear all root document tracking (useful for workspace folder changes).
	 */
	clearRootDocuments(): void {
		this.rootDocumentUris.clear();
	}

	/**
	 * Check if initial workspace scan has been performed.
	 */
	hasInitialScanBeenPerformed(): boolean {
		return this.hasPerformedInitialScan;
	}

	/**
	 * Mark that initial workspace scan has been performed.
	 */
	markInitialScanPerformed(): void {
		this.hasPerformedInitialScan = true;
	}

	/**
	 * Reset initial scan flag (useful when workspace folders change).
	 */
	resetInitialScan(): void {
		this.hasPerformedInitialScan = false;
	}
}

function computeConfigSignature(config: LintConfig): string {
	return createHash("sha1")
		.update(JSON.stringify(normalizeConfig(config)))
		.digest("hex");
}

function normalizeConfig(config: LintConfig): unknown {
	return {
		ruleset: config.ruleset ? [...config.ruleset] : undefined,
		rules: config.rules
			? Object.fromEntries(
					Object.entries(config.rules).sort(([a], [b]) => a.localeCompare(b)),
				)
			: undefined,
		overrides: config.overrides
			? config.overrides.map((override) => ({
					files: [...override.files],
					rules: Object.fromEntries(
						Object.entries(override.rules).sort(([a], [b]) =>
							a.localeCompare(b),
						),
					),
				}))
			: undefined,
		versionOverride: config.versionOverride,
		include: config.include ? [...config.include].sort() : undefined,
		exclude: config.exclude ? [...config.exclude].sort() : undefined,
		customRules: config.customRules
			? [...config.customRules].sort((a, b) =>
					(a.pattern ?? "").localeCompare(b.pattern ?? ""),
				)
			: undefined,
		additionalValidation: config.additionalValidation
			? {
					groups: config.additionalValidation.groups
						? Object.fromEntries(
								Object.entries(config.additionalValidation.groups).sort(
									([a], [b]) => a.localeCompare(b),
								),
							)
						: undefined,
				}
			: undefined,
	};
}
