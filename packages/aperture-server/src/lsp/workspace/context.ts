import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { LanguageServer } from "@volar/language-server";
import type { URI } from "vscode-uri";
import { URI as Uri } from "vscode-uri";
import type {
	AdditionalValidationGroup,
	DocumentType,
	GenericRule,
	ResolvedGenericRule,
	ResolvedRule,
	TelescopeConfig,
} from "../../engine/index.js";
import {
	DocumentTypeCache,
	matchesPattern,
	materializeGenericRules,
	materializeRules,
	resolveConfig,
} from "../../engine/index.js";
import type { SchemaConfiguration, ValidationRule } from "../../types.js";
import { WorkspaceIndex } from "../core/workspace-index.js";
import { loadSchema } from "../services/shared/schema-loader.js";
import {
	configJsonSchema,
	configTypeBoxSchema,
	getSchemaForDocumentType,
	getTypeBoxSchemaForDocumentType,
	openapiJsonSchemas,
	toJsonSchema,
} from "../services/shared/schema-registry.js";
import { isConfigFile } from "../utils.js";
import { OpenAPIDocumentStore } from "./documents";

const DEFAULT_OPENAPI_PATTERNS = [
	"**/*.yaml",
	"**/*.yml",
	"**/*.json",
	"**/*.jsonc",
];

/**
 * Logger interface for diagnostic and debug output.
 * Uses `unknown` for flexibility in logging any value type.
 */
export interface DiagnosticsLogger {
	log(message: unknown, ...args: unknown[]): void;
	error(message: unknown, ...args: unknown[]): void;
	warn(message: unknown, ...args: unknown[]): void;
}

/**
 * ApertureVolarContext - Manages state for a single workspace folder.
 *
 * In the new architecture, each workspace folder gets its own server process,
 * so this context only needs to handle a single workspace root.
 */
export class ApertureVolarContext {
	readonly documentCache = new DocumentTypeCache();
	readonly documents = new OpenAPIDocumentStore(this.documentCache);

	private _workspaceIndex?: WorkspaceIndex;
	private readonly server?: LanguageServer;

	private logger: DiagnosticsLogger;
	private scopedLoggers = new Map<string, DiagnosticsLogger>();

	/** The workspace folder URI (single root) */
	private workspaceFolderUri: string | undefined;
	/** The workspace folder path (single root) */
	private workspaceFolderPath: string | undefined;

	/** Resolved configuration for this workspace */
	private config: TelescopeConfig;
	/** Hash signature of the config for change detection */
	private configSignature: string;

	/** OpenAPI rules resolved for this workspace */
	private resolvedRules: ResolvedRule[] = [];
	/** Generic rules loaded for this workspace (with patterns) */
	private genericRules: ResolvedGenericRule[] = [];
	/** Validation rules (JSON/Zod schemas) loaded for this workspace */
	private validationRules: ValidationRule[] = [];

	/** OpenAPI file patterns for this workspace */
	private openapiPatterns: string[] = [];
	/** Additional validation file patterns for this workspace */
	private validationPatterns: string[] = [];

	private affectedUris = new Set<string>();
	private rootDocumentUris = new Set<string>();
	private hasPerformedInitialScan = false;
	public rulesLoadPromise: Promise<void> = Promise.resolve();

	/**
	 * Known OpenAPI files sent from the client after workspace scan.
	 * This is the "project model" - all files that should be validated.
	 */
	private knownOpenAPIFiles = new Set<string>();

	/**
	 * Flag indicating if we've received the initial file list from client.
	 * Workspace diagnostics should wait for this before running.
	 */
	private hasReceivedClientFileList = false;

	constructor(server?: LanguageServer) {
		this.logger = console;
		this.server = server;
		// Initialize with default config (will be reloaded when workspace folder is set)
		this.config = resolveConfig(undefined);
		this.configSignature = computeConfigSignature(this.config);
	}

	/**
	 * Get the workspace index for cross-document features.
	 *
	 * WorkspaceIndex manages workspace-wide indexes (GraphIndex, OperationIdIndex)
	 * without per-document caching. Document data lives on VirtualCode instances.
	 */
	get workspaceIndex(): WorkspaceIndex {
		if (!this._workspaceIndex) {
			this._workspaceIndex = new WorkspaceIndex(this);
		}
		return this._workspaceIndex;
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
				this.logger.warn(`${prefix}${message}`, ...args) ??
				this.logger.log?.(`${prefix}${message}`, ...args),
		};

		this.scopedLoggers.set(id, scopedLogger);
		return scopedLogger;
	}

	/**
	 * Set the workspace folder for this server instance.
	 *
	 * In the new architecture, each server handles a single workspace folder.
	 * If multiple folders are passed, only the first one is used.
	 */
	setWorkspaceFolders(folders: URI[]): void {
		// Single-root: use only the first folder
		const folder = folders[0];
		if (!folder) {
			this.workspaceFolderUri = undefined;
			this.workspaceFolderPath = undefined;
			this.config = resolveConfig(undefined);
			this.configSignature = computeConfigSignature(this.config);
			this.openapiPatterns = DEFAULT_OPENAPI_PATTERNS;
			return;
		}

		this.workspaceFolderUri = folder.toString();
		try {
			this.workspaceFolderPath = folder.fsPath;
		} catch {
			this.workspaceFolderPath = Uri.parse(folder.toString()).fsPath;
		}

		// Load configuration for this workspace
		this.config = resolveConfig(this.workspaceFolderPath);
		this.configSignature = computeConfigSignature(this.config);

		// Extract patterns from config with defaults
		const configuredPatterns = this.config.openapi?.patterns ?? [];
		this.openapiPatterns =
			configuredPatterns.length > 0
				? configuredPatterns
				: DEFAULT_OPENAPI_PATTERNS;
		this.validationPatterns = Object.values(
			this.config.additionalValidation ?? {},
		).flatMap((group) => [
			...(group.patterns ?? []),
			...(group.schemas ?? []).flatMap((s) => s.patterns ?? []),
			...(group.rules ?? []).flatMap((r) => r.patterns ?? []),
		]);

		// Load rules asynchronously
		this.rulesLoadPromise = this.loadRules();

		this.logger.log?.(
			`[Context] Workspace folder set: ${this.workspaceFolderPath}`,
		);
	}

	/**
	 * Get workspace folders (returns single folder as array for compatibility).
	 */
	getWorkspaceFolders(): string[] {
		return this.workspaceFolderUri ? [this.workspaceFolderUri] : [];
	}

	/**
	 * Get workspace paths (returns single path as array for compatibility).
	 */
	getWorkspacePaths(): string[] {
		return this.workspaceFolderPath ? [this.workspaceFolderPath] : [];
	}

	/**
	 * Get the workspace folder URI.
	 */
	getWorkspaceFolderUri(): string | undefined {
		return this.workspaceFolderUri;
	}

	/**
	 * Get the workspace folder path.
	 */
	getWorkspaceFolderPath(): string | undefined {
		return this.workspaceFolderPath;
	}

	/**
	 * Get all resolved rules.
	 */
	getResolvedRules(): ResolvedRule[] {
		return this.resolvedRules;
	}

	/**
	 * Get resolved rules for a specific file URI.
	 * In single-root mode, this returns the same rules for all files.
	 */
	getResolvedRulesForUri(_uri: string): ResolvedRule[] {
		return this.resolvedRules;
	}

	/**
	 * Get all rule implementations.
	 */
	getRuleImplementations(): ResolvedRule["rule"][] {
		return this.resolvedRules.map((resolved) => resolved.rule);
	}

	/**
	 * Get rule implementations for a specific file URI.
	 * In single-root mode, this returns the same rules for all files.
	 */
	getRuleImplementationsForUri(_uri: string): ResolvedRule["rule"][] {
		return this.resolvedRules.map((resolved) => resolved.rule);
	}

	/**
	 * Get generic rules for a specific file URI.
	 * Filters by patterns that match the file.
	 */
	getGenericRulesForUri(uri: string): GenericRule[] {
		const workspacePath = this.workspaceFolderPath;
		if (!workspacePath) {
			return [];
		}

		return this.genericRules
			.filter((resolved) =>
				matchesPattern(uri, resolved.patterns, [workspacePath]),
			)
			.map((resolved) => resolved.rule);
	}

	getConfigSignature(): string {
		return this.configSignature;
	}

	getConfig(): TelescopeConfig {
		return this.config;
	}

	/**
	 * Reload configuration from disk.
	 * Returns true if the configuration changed.
	 */
	reloadConfiguration(): boolean {
		const nextConfig = resolveConfig(this.workspaceFolderPath);
		const nextSignature = computeConfigSignature(nextConfig);

		if (nextSignature === this.configSignature) {
			this.logger.log?.(
				`[Context] reloadConfiguration skipped - configuration unchanged`,
			);
			return false;
		}

		// Update configuration
		this.config = nextConfig;
		this.configSignature = nextSignature;
		const configuredPatterns = nextConfig.openapi?.patterns ?? [];
		this.openapiPatterns =
			configuredPatterns.length > 0
				? configuredPatterns
				: DEFAULT_OPENAPI_PATTERNS;
		this.validationPatterns = Object.values(
			nextConfig.additionalValidation ?? {},
		).flatMap((group) => [
			...(group.patterns ?? []),
			...(group.schemas ?? []).flatMap((s) => s.patterns ?? []),
			...(group.rules ?? []).flatMap((r) => r.patterns ?? []),
		]);

		this.logger.log?.(
			`[Context] Configuration reloaded - new signature ${nextSignature}`,
		);

		// Reload rules asynchronously
		this.rulesLoadPromise = this.loadRules();
		return true;
	}

	/**
	 * Load rules and schemas for this workspace.
	 */
	private async loadRules(): Promise<void> {
		const workspacePath = this.workspaceFolderPath;
		if (!workspacePath) {
			this.resolvedRules = [];
			this.genericRules = [];
			this.validationRules = [];
			return;
		}

		try {
			// Load OpenAPI rules
			this.resolvedRules = await materializeRules(this.config, workspacePath);

			// Load generic rules
			this.genericRules = await materializeGenericRules(
				this.config,
				workspacePath,
			);

			// Load validation rules (JSON/Zod schemas)
			this.validationRules = [];
			if (this.config.additionalValidation) {
				const schemaFolder = resolvePath(
					workspacePath,
					".telescope",
					"schemas",
				);

				for (const [label, group] of Object.entries(
					this.config.additionalValidation,
				)) {
					if (group.schemas) {
						for (const [
							index,
							{ schema, patterns },
						] of group.schemas.entries()) {
							try {
								const schemaPath = resolvePath(schemaFolder, schema);

								if (!existsSync(schemaPath)) {
									this.logger.warn(
										`Schema file not found in ${schemaFolder}: ${schemaPath}`,
									);
									continue;
								}

								const loaded = await loadSchema(schemaPath, this.logger);
								if (loaded) {
									this.validationRules.push({
										id: `${label}-${index}`,
										label,
										patterns: patterns ?? group.patterns ?? [],
										jsonSchema: loaded.jsonSchema,
										typeBoxSchema: loaded.typeBoxSchema,
									});
								} else {
									this.logger.warn(`Failed to load schema from: ${schemaPath}`);
								}
							} catch (error) {
								this.logger.warn(
									`[Context] Failed to load schema ${schema}: ${error instanceof Error ? error.message : String(error)}`,
								);
							}
						}
					}
				}
			}

			this.logger.log?.(
				`[Context] Loaded ${this.resolvedRules.length} OpenAPI rules, ${this.genericRules.length} generic rules, ${this.validationRules.length} validation rules`,
			);
		} catch (error) {
			this.logger.error(
				`[Context] Failed to load rules: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	/**
	 * Get all generic rules.
	 */
	getGenericRules(): GenericRule[] {
		return this.genericRules.map((resolved) => resolved.rule);
	}

	/**
	 * Get generic rule patterns.
	 */
	getGenericRulePatterns(): string[] {
		return this.genericRules.flatMap((resolved) => resolved.patterns);
	}

	/**
	 * Get generic rule patterns for a specific file URI.
	 * In single-root mode, returns the same patterns for all files.
	 */
	getGenericRulePatternsForUri(_uri: string): string[] {
		return this.getGenericRulePatterns();
	}

	/**
	 * Get AdditionalValidation groups configuration.
	 */
	getAdditionalValidationGroups(): Record<string, AdditionalValidationGroup> {
		return this.config.additionalValidation ?? {};
	}

	/**
	 * Get AdditionalValidation groups configuration for a specific file URI.
	 * In single-root mode, returns the same config for all files.
	 */
	getAdditionalValidationGroupsForUri(
		_uri: string,
	): Record<string, AdditionalValidationGroup> {
		return this.config.additionalValidation ?? {};
	}

	/**
	 * Get all validation rules.
	 */
	getValidationRules(): ValidationRule[] {
		return this.validationRules;
	}

	/**
	 * Check if a file URI should be processed based on include/exclude patterns.
	 */
	shouldProcessFile(uri: string): {
		shouldProcess: boolean;
		documentKind: "openapi" | "config" | "generic";
	} {
		if (isConfigFile(uri)) {
			return { shouldProcess: true, documentKind: "config" };
		}
		if (this.isOpenAPIFile(uri)) {
			return { shouldProcess: true, documentKind: "openapi" };
		}
		if (this.isValidationFile(uri)) {
			return { shouldProcess: true, documentKind: "generic" };
		}

		return { shouldProcess: false, documentKind: "generic" };
	}

	/**
	 * Check if a file is an OpenAPI file based on patterns.
	 */
	isOpenAPIFile(uri: string): boolean {
		const workspacePath = this.workspaceFolderPath;
		if (!workspacePath) {
			return false;
		}
		return matchesPattern(uri, this.openapiPatterns, [workspacePath]);
	}

	/**
	 * Check if a file is an OpenAPI file by analyzing its content.
	 */
	async isOpenAPIFileByContent(uri: string): Promise<boolean> {
		// First, check patterns (fast path)
		if (this.isOpenAPIFile(uri)) {
			return true;
		}

		// Check if file extension is YAML or JSON
		const lowerUri = uri.toLowerCase();
		if (
			!lowerUri.endsWith(".yaml") &&
			!lowerUri.endsWith(".yml") &&
			!lowerUri.endsWith(".json")
		) {
			return false;
		}

		// Try content analysis via DocumentTypeCache
		const fileSystem = this.getFileSystem();
		if (!fileSystem) {
			return false;
		}

		try {
			const docType = await this.documentCache.getDocumentType(uri, fileSystem);
			return docType !== "unknown";
		} catch {
			return false;
		}
	}

	/**
	 * Check if a file is a validation file based on patterns.
	 */
	isValidationFile(uri: string): boolean {
		const workspacePath = this.workspaceFolderPath;
		if (!workspacePath) {
			return false;
		}
		return matchesPattern(uri, this.validationPatterns, [workspacePath]);
	}

	/**
	 * Get validation rules for a file based on pattern matching.
	 */
	getValidationRulesForFile(uri: string): ValidationRule[] {
		const workspacePath = this.workspaceFolderPath;
		if (!workspacePath) {
			return [];
		}

		return this.validationRules.filter((rule) =>
			matchesPattern(uri, rule.patterns, [workspacePath]),
		);
	}

	/**
	 * Get schemas for a URI based on document classification.
	 */
	getSchemasForUri(
		sourceUri: string,
		documentKind: "openapi" | "config" | "generic",
		openApiDocumentType?: DocumentType,
	): SchemaConfiguration[] | undefined {
		// 1. Config file (highest priority)
		if (documentKind === "config") {
			return [
				{
					uri: "telescope-config",
					schema: toJsonSchema(configJsonSchema),
					typeBoxSchema: configJsonSchema,
					fileMatch: [sourceUri],
				},
			];
		}

		// 2. User-registered schemas (pattern matching)
		const userSchemas = this.getValidationRulesForFile(sourceUri);
		if (userSchemas.length > 0) {
			return userSchemas.map((rule) => ({
				uri: `telescope-user-${rule.id}`,
				schema: rule.jsonSchema,
				typeBoxSchema: rule.typeBoxSchema,
				fileMatch: [sourceUri],
			}));
		}

		// 3. OpenAPI schemas - use pre-computed document type
		if (documentKind === "openapi" && openApiDocumentType) {
			const jsonSchema = getSchemaForDocumentType(openApiDocumentType);
			const typeBoxSchema =
				getTypeBoxSchemaForDocumentType(openApiDocumentType);
			if (jsonSchema) {
				return [
					{
						uri: `telescope-openapi-${openApiDocumentType}`,
						schema: toJsonSchema(jsonSchema),
						typeBoxSchema: typeBoxSchema,
						fileMatch: [sourceUri],
					},
				];
			}
		}

		// 4. No schema for unmatched files
		return undefined;
	}

	/**
	 * Get schemas for a document using a schema key.
	 * @deprecated Use getSchemaByKey instead for the new schema provider architecture
	 */
	getSchemasForSchemaKey(
		sourceUri: string,
		schemaKey: string,
	): SchemaConfiguration[] | undefined {
		// Handle Telescope config schema
		if (schemaKey === "telescope-config") {
			return [
				{
					uri: "telescope-config",
					schema: toJsonSchema(configJsonSchema),
					typeBoxSchema: configTypeBoxSchema,
					fileMatch: [sourceUri],
				},
			];
		}

		// Handle OpenAPI schemas (pattern: "openapi-{documentType}")
		if (schemaKey.startsWith("openapi-")) {
			const documentType = schemaKey.replace("openapi-", "") as DocumentType;
			const jsonSchema = getSchemaForDocumentType(documentType);
			const typeBoxSchema = getTypeBoxSchemaForDocumentType(documentType);
			if (jsonSchema) {
				return [
					{
						uri: `telescope-openapi-${documentType}`,
						schema: toJsonSchema(jsonSchema),
						typeBoxSchema: typeBoxSchema,
						fileMatch: [sourceUri],
					},
				];
			}
		}

		// No schema for unknown keys
		return undefined;
	}

	/**
	 * Get a JSON schema by its key.
	 * Used by the custom schema provider to resolve schemas dynamically.
	 *
	 * Schema keys:
	 * - "openapi-root", "openapi-path-item", "openapi-schema", etc. for built-in OpenAPI schemas
	 * - "telescope-config" for the Telescope config schema
	 * - "user-{id}" for user-defined schemas from workspace configuration
	 *
	 * @param schemaKey - The schema key to look up
	 * @returns The JSON schema object, or undefined if not found
	 */
	getSchemaByKey(schemaKey: string): Record<string, unknown> | undefined {
		// Handle Telescope config schema
		if (schemaKey === "telescope-config") {
			return toJsonSchema(configJsonSchema);
		}

		// Handle OpenAPI schemas (pattern: "openapi-{documentType}")
		if (schemaKey.startsWith("openapi-")) {
			const documentType = schemaKey.replace("openapi-", "") as DocumentType;
			const jsonSchema = openapiJsonSchemas[documentType];
			if (jsonSchema) {
				return jsonSchema as Record<string, unknown>;
			}
		}

		// Handle user-defined schemas
		if (schemaKey.startsWith("user-")) {
			const userId = schemaKey.replace("user-", "");
			const userRule = this.validationRules.find((r) => r.id === userId);
			if (userRule?.jsonSchema) {
				return userRule.jsonSchema;
			}
		}

		return undefined;
	}

	/**
	 * Get all user-defined schemas from workspace configuration.
	 * Used to register user schemas with the language services.
	 *
	 * @returns Array of {id, schema} objects for user-defined schemas
	 */
	getUserSchemas(): Array<{ id: string; schema: Record<string, unknown> }> {
		return this.validationRules
			.filter((rule) => rule.jsonSchema)
			.map((rule) => ({
				id: `user-${rule.id}`,
				schema: rule.jsonSchema as Record<string, unknown>,
			}));
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
	 * Get all known root document URIs.
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
	 * Clear all root document tracking.
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
	 * Reset initial scan flag.
	 */
	resetInitialScan(): void {
		this.hasPerformedInitialScan = false;
	}

	// =========================================================================
	// Known OpenAPI Files Management (Client-Server Sync)
	// =========================================================================

	/**
	 * Set the known OpenAPI files from client scan results.
	 * This is the "project model" - the authoritative list of files to validate.
	 *
	 * @param files - Array of file URIs classified as OpenAPI by the client
	 */
	setKnownOpenAPIFiles(files: string[]): void {
		this.knownOpenAPIFiles.clear();
		for (const uri of files) {
			this.knownOpenAPIFiles.add(uri);
		}
		this.hasReceivedClientFileList = true;
		this.logger.log?.(
			`[Context] Received ${files.length} OpenAPI files from client`,
		);
	}

	/**
	 * Get all known OpenAPI file URIs from client scan.
	 */
	getKnownOpenAPIFiles(): string[] {
		return Array.from(this.knownOpenAPIFiles);
	}

	/**
	 * Add a single file to the known OpenAPI files set.
	 * Used when a new file is created and classified.
	 *
	 * @param uri - File URI to add
	 */
	addKnownOpenAPIFile(uri: string): void {
		this.knownOpenAPIFiles.add(uri);
	}

	/**
	 * Remove a file from the known OpenAPI files set.
	 * Used when a file is deleted or no longer classified as OpenAPI.
	 *
	 * @param uri - File URI to remove
	 */
	removeKnownOpenAPIFile(uri: string): void {
		this.knownOpenAPIFiles.delete(uri);
	}

	/**
	 * Check if a file is in the known OpenAPI files set.
	 *
	 * @param uri - File URI to check
	 */
	isKnownOpenAPIFile(uri: string): boolean {
		return this.knownOpenAPIFiles.has(uri);
	}

	/**
	 * Check if we've received the initial file list from the client.
	 * Workspace diagnostics can use this to decide whether to wait or fallback.
	 */
	hasClientFileList(): boolean {
		return this.hasReceivedClientFileList;
	}

	/**
	 * Clear known OpenAPI files (e.g., when workspace changes).
	 */
	clearKnownOpenAPIFiles(): void {
		this.knownOpenAPIFiles.clear();
		this.hasReceivedClientFileList = false;
	}
}

function computeConfigSignature(config: TelescopeConfig): string {
	return createHash("sha1").update(JSON.stringify(config)).digest("hex");
}
