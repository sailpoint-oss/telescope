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
import type { ValidationRule } from "../types.js";
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
	private validationRules: ValidationRule[] = [];
	private workspaceFolderUris: string[] = [];
	private workspaceFolderPaths: string[] = [];
	private affectedUris = new Set<string>();
	private rootDocumentUris = new Set<string>(); // Track root documents discovered via file watcher
	private hasPerformedInitialScan = false; // Track if we've done initial workspace scan
	public rulesLoadPromise: Promise<void> = Promise.resolve();

	constructor(server?: LanguageServer) {
		this.logger = console;
		this.server = server;
		// Load config from workspace root if available
		const workspaceRoot = this.getWorkspaceRoot();
		this.config = resolveConfig(workspaceRoot);
		this.configSignature = computeConfigSignature(this.config);
		// Initialize rules synchronously (will be reloaded async on first use)
		this.resolvedRules = [];
		this.genericRules = [];
		this.validationRules = [];
		// Load rules asynchronously
		this.rulesLoadPromise = this.loadRules();
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
		this.rulesLoadPromise = this.loadRules();
	}

	getWorkspaceFolders(): string[] {
		return this.workspaceFolderUris;
	}

	getWorkspacePaths(): string[] {
		return this.workspaceFolderPaths;
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

	getConfig(): LintConfig {
		return this.config;
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
		this.rulesLoadPromise = this.loadRules();
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

			// Load validation rules (JSON/Zod schemas)
			this.validationRules = [];
			if (workspaceRoot && this.config.additionalValidation?.groups) {
				for (const [label, group] of Object.entries(
					this.config.additionalValidation.groups,
				)) {
					if (group.schemas) {
						for (const [index, schemaConfig] of group.schemas.entries()) {
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
										let patterns: string[] = [];
										if (schemaConfig.pattern) {
											patterns = Array.isArray(schemaConfig.pattern)
												? schemaConfig.pattern
												: [schemaConfig.pattern];
										} else if (group.patterns) {
											patterns = group.patterns;
										}

										this.validationRules.push({
											id: `${label}-${index}`,
											label,
											patterns,
											jsonSchema: loaded.jsonSchema,
											zodSchema: loaded.zodSchema,
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

	getValidationRules(): ValidationRule[] {
		return this.validationRules;
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
			this.config.openapi?.patterns,
			undefined, // Excludes are typically handled within patterns via ! prefix or not at all in this simple check?
			// Actually matchesPattern supports explicit exclude array.
			// But new config puts excludes in patterns array with ! prefix.
			// So we pass undefined for explicit exclude array.
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
	const openapi = config.openapi
		? {
				base: config.openapi.base ? [...config.openapi.base].sort() : undefined,
				patterns: config.openapi.patterns
					? [...config.openapi.patterns].sort()
					: undefined,
				rules: config.openapi.rules
					? [...config.openapi.rules].sort((a, b) =>
							(a.pattern ?? "").localeCompare(b.pattern ?? ""),
						)
					: undefined,
				rulesOverrides: config.openapi.rulesOverrides
					? Object.fromEntries(
							Object.entries(config.openapi.rulesOverrides).sort(([a], [b]) =>
								a.localeCompare(b),
							),
						)
					: undefined,
				overrides: config.openapi.overrides
					? config.openapi.overrides.map((override) => ({
							files: [...override.files],
							rules: Object.fromEntries(
								Object.entries(override.rules).sort(([a], [b]) =>
									a.localeCompare(b),
								),
							),
						}))
					: undefined,
				customRules: config.openapi.customRules
					? [...config.openapi.customRules].sort((a, b) =>
							(a.pattern ?? "").localeCompare(b.pattern ?? ""),
						)
					: undefined,
			}
		: undefined;

	return {
		openapi,
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
