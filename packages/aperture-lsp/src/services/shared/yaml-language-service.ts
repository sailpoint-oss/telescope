import type {
	Disposable,
	DocumentSelector,
	LanguageServiceContext,
	LanguageServicePlugin,
	LanguageServicePluginInstance,
	ProviderResult,
} from "@volar/language-service";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI, Utils } from "vscode-uri";
import * as yaml from "yaml-language-server";

// ... (Provide, ProvideJson interfaces, SchemaConfiguration, SchemaResolver types, noop function) ...
/**
 * Provides access to the underlying YAML language service instance.
 * This interface is used by Volar to expose the language service to other plugins.
 */
export interface ProvideYaml {
	/**
	 * Returns the YAML language service instance.
	 * @returns The yaml-language-server LanguageService instance
	 */
	"yaml/languageService": () => yaml.LanguageService;
}

/**
 * Schema configuration format expected by yaml-language-server.
 * Each schema must have a unique URI and fileMatch patterns.
 */
export interface SchemaConfiguration {
	/**
	 * Unique URI identifier for this schema.
	 * Used by yaml-language-server to reference the schema.
	 */
	uri: string;
	/**
	 * Array of file patterns (glob patterns or exact URIs) that this schema should apply to.
	 * If not provided, the schema will not be automatically matched to files.
	 */
	fileMatch?: string[];
	/**
	 * The JSON Schema object that defines the validation rules.
	 * This will be stored and served via schemaRequestService when the URI is requested.
	 */
	schema?: Record<string, unknown>;
	/**
	 * Optional folder URI to scope this schema to a specific workspace folder.
	 */
	folderUri?: string;
}

/**
 * Function type for resolving schemas for a document.
 * This function is called for each document to determine which schemas should be applied.
 *
 * @param document - The text document to resolve schemas for
 * @returns An array of schema configurations, undefined if no schemas apply, or a Promise that resolves to either
 */
export type SchemaResolver = (
	/**
	 * The text document to resolve schemas for
	 */
	document: TextDocument,
) =>
	| SchemaConfiguration[]
	| undefined
	| Promise<SchemaConfiguration[] | undefined>;

/**
 * No-op function that returns undefined.
 * Used as a placeholder for telemetry callbacks that don't need to do anything.
 *
 * @returns undefined
 */
function noop(): undefined {
	return undefined;
}

/**
 * Wrap a raw JSON schema object into a SchemaConfiguration format.
 * Generates a unique URI and sets fileMatch to match the document.
 * Note: fileMatch uses the exact URI to ensure precise matching for per-document schemas.
 *
 * @param schemaName - Name identifier for the schema (used in URI generation)
 * @param schema - The JSON Schema object to wrap
 * @param documentUri - The URI of the document this schema should apply to
 * @returns A SchemaConfiguration object ready for use with yaml-language-server
 */
function wrapSchema(
	/**
	 * Name identifier for the schema (used in URI generation).
	 * Will be lowercased and prefixed with "telescope-" to create the schema URI.
	 */
	schemaName: string,
	/**
	 * The JSON Schema object that defines validation rules.
	 * Should be a valid JSON Schema Draft 2020-12 or compatible format.
	 */
	schema: Record<string, unknown>,
	/**
	 * The URI of the document this schema should apply to.
	 * Used as the fileMatch pattern to ensure the schema only applies to this specific document.
	 */
	documentUri: string,
): SchemaConfiguration {
	return {
		uri: `telescope-${schemaName}`,
		fileMatch: [documentUri],
		schema: schema as Record<string, unknown>,
	};
}

/**
 * Create a Volar language service for YAML documents.
 * This is the base function that handles core YAML language service integration.
 * Use the specialized factory functions (createSingleSchemaYamlService, etc.) for common use cases.
 *
 * This function provides a full-featured YAML language service with:
 * - Schema validation
 * - Code completion
 * - Hover information
 * - Code actions
 * - Document symbols
 * - Folding ranges
 * - And more
 *
 * Defaults:
 * - documentSelector: Matches .telescope/config.yaml files using glob pattern
 * - getWorkspaceContextService: Function that resolves relative paths, handling embedded document URIs
 * - getLanguageSettings: Returns settings with all features enabled (completion, format, hover, validate) and YAML version 1.2
 * - getSchemasForDocument: undefined - No schemas configured by default
 * - onDidChangeLanguageSettings: Returns a no-op disposable
 * - Plugin name: "telescope-config"
 *
 * @param options - Configuration options for the YAML language service
 * @param options.documentSelector - Document selector to determine which files this service handles (default: matches `.telescope/config.yaml` files)
 * @param options.getWorkspaceContextService - Function to create workspace context service for resolving relative paths (default: handles embedded URIs)
 * @param options.getLanguageSettings - Function to get language settings (completion, validation, etc.) (default: all features enabled, YAML 1.2)
 * @param options.getSchemasForDocument - Optional function to resolve schemas for each document (default: undefined, no schemas)
 * @param options.onDidChangeLanguageSettings - Function to register a listener for language settings changes (default: no-op)
 * @returns A configured LanguageServicePlugin instance
 */
export function create({
	documentSelector = [
		{ language: "yaml", pattern: "**/.telescope/config.yaml" },
	],
	getWorkspaceContextService = (context) => {
		return {
			resolveRelativePath(relativePath, resource) {
				const base = resource.substring(0, resource.lastIndexOf("/") + 1);
				let baseUri = URI.parse(base);
				const decoded = context.decodeEmbeddedDocumentUri(baseUri);
				if (decoded) {
					baseUri = decoded[0];
				}
				return Utils.resolvePath(baseUri, relativePath).toString();
			},
		};
	},
	getLanguageSettings = () => {
		return {
			completion: true,
			customTags: [],
			format: true,
			hover: true,
			isKubernetes: false,
			validate: true,
			yamlVersion: "1.2",
		};
	},
	getSchemasForDocument,
	onDidChangeLanguageSettings = () => {
		return { dispose() {} };
	},
}: {
	/**
	 * Document selector to determine which files this service handles.
	 * Can be a language ID string or an object with language and pattern properties.
	 * Default: Matches .telescope/config.yaml files using glob pattern
	 */
	documentSelector?: DocumentSelector;
	/**
	 * Function to create workspace context service for resolving relative paths.
	 * Receives the language service context and returns a workspace context service.
	 * Default: Function that resolves relative paths, handling embedded document URIs.
	 */
	getWorkspaceContextService?(
		context: LanguageServiceContext,
	): yaml.WorkspaceContextService;
	/**
	 * Function to get language settings for the YAML language service.
	 * Can return a Promise if settings need to be loaded asynchronously.
	 * Default: Returns { completion: true, customTags: [], format: true, hover: true, isKubernetes: false, validate: true, yamlVersion: "1.2" }
	 */
	getLanguageSettings?(
		context: LanguageServiceContext,
	): ProviderResult<yaml.LanguageSettings>;
	/**
	 * Optional function to resolve schemas for each document.
	 * Called for each document to determine which schemas should be applied.
	 * Default: undefined (no schemas configured)
	 */
	getSchemasForDocument?: SchemaResolver;
	/**
	 * Function to register a listener for language settings changes.
	 * Called when language settings change, allowing the service to react accordingly.
	 * Default: Returns { dispose() {} } (no-op disposable)
	 */
	onDidChangeLanguageSettings?(
		listener: () => void,
		context: LanguageServiceContext,
	): Disposable;
} = {}): LanguageServicePlugin {
	return {
		name: "telescope-config",
		capabilities: {
			codeActionProvider: {},
			codeLensProvider: {
				resolveProvider: true,
			},
			completionProvider: {
				triggerCharacters: [" ", ":"],
			},
			definitionProvider: true,
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false,
			},
			documentOnTypeFormattingProvider: {
				triggerCharacters: ["\n"],
			},
			documentSymbolProvider: true,
			hoverProvider: true,
			documentLinkProvider: {},
			foldingRangeProvider: true,
			selectionRangeProvider: true,
		},
		create(context): LanguageServicePluginInstance<ProvideYaml> {
			// Store inline schemas by URI for schemaRequestService
			const inlineSchemas = new Map<string, Record<string, unknown>>();

			const ls = yaml.getLanguageService({
				schemaRequestService: async (uri) => {
					// Check if this is an inline schema we registered
					const inlineSchema = inlineSchemas.get(uri);
					if (inlineSchema) {
						return JSON.stringify(inlineSchema);
					}
					// Otherwise, try to read from file system
					return (await context.env.fs?.readFile(URI.parse(uri))) ?? "";
				},
				telemetry: {
					send: noop,
					sendError: noop,
					sendTrack: noop,
				},
				clientCapabilities: context.env?.clientCapabilities,
				workspaceContext: getWorkspaceContextService(context),
			});
			const disposable = onDidChangeLanguageSettings(() => {
				initializing = undefined;
				documentConfigCache.clear();
				inlineSchemas.clear();
			}, context);

			let initializing: Promise<void> | undefined;
			// Cache schema configuration per document URI+version
			const documentConfigCache = new Map<
				string,
				{
					schemas: SchemaConfiguration[] | undefined;
					version: number;
				}
			>();

			return {
				dispose() {
					disposable.dispose();
				},

				provide: {
					"yaml/languageService": () => ls,
				},

				provideCodeActions(document, range, context) {
					return worker(document, () => {
						return ls.getCodeAction(document, {
							context,
							range,
							textDocument: document,
						});
					});
				},

				provideCodeLenses(document) {
					return worker(document, () => {
						return ls.getCodeLens(document);
					});
				},

				provideCompletionItems(document, position) {
					return worker(document, () => {
						return ls.doComplete(document, position, false);
					});
				},

				provideDefinition(document, position) {
					return worker(document, () => {
						return ls.doDefinition(document, {
							position,
							textDocument: document,
						});
					});
				},

				provideDiagnostics(document) {
					return worker(document, () => {
						return ls.doValidation(document, false);
					});
				},

				provideDocumentSymbols(document) {
					return worker(document, () => {
						return ls.findDocumentSymbols2(document, {});
					});
				},

				provideHover(document, position) {
					return worker(document, () => {
						return ls.doHover(document, position);
					});
				},

				provideDocumentLinks(document) {
					return worker(document, () => {
						return ls.findLinks(document);
					});
				},

				provideFoldingRanges(document) {
					return worker(document, () => {
						return ls.getFoldingRanges(
							document,
							context.env.clientCapabilities?.textDocument?.foldingRange ?? {},
						);
					});
				},

				provideOnTypeFormattingEdits(document, position, key, options) {
					return worker(document, () => {
						return ls.doDocumentOnTypeFormatting(document, {
							ch: key,
							options,
							position,
							textDocument: document,
						});
					});
				},

				provideSelectionRanges(document, positions) {
					return worker(document, () => {
						return ls.getSelectionRanges(document, positions);
					});
				},

				resolveCodeLens(codeLens) {
					return ls.resolveCodeLens(codeLens);
				},
			};

			/**
			 * Worker function that handles document matching, schema resolution, and language service configuration
			 * before executing the provided callback. This ensures schemas are properly configured for each document.
			 *
			 * @param document - The text document to process
			 * @param callback - The function to execute after schema configuration
			 * @returns The result of the callback, or undefined if the document doesn't match the selector
			 */
			async function worker<T>(
				/**
				 * The text document to process
				 */
				document: TextDocument,
				/**
				 * The function to execute after schema configuration is complete
				 */
				callback: () => T,
			): Promise<Awaited<T> | undefined> {
				if (!matchDocument(documentSelector, document)) {
					return;
				}

				// Initialize base settings first
				initializing ??= initialize();
				await initializing;

				// Get schemas for this document
				let schemas: SchemaConfiguration[] | undefined;

				// Check cache first (using URI + version as key)
				const cacheKey = `${document.uri}:${document.version}`;
				const cached = documentConfigCache.get(cacheKey);
				if (cached && cached.version === document.version) {
					schemas = cached.schemas;
				} else {
					// Resolve schemas using the resolver function
					if (getSchemasForDocument) {
						schemas = await getSchemasForDocument(document);
					}

					// Cache the result
					documentConfigCache.set(cacheKey, {
						schemas,
						version: document.version,
					});
				}

				// Configure language service with document-specific schemas
				if (schemas && schemas.length > 0) {
					const baseSettings = await getLanguageSettings(context);
					// Convert SchemaConfiguration[] to yaml.LanguageSettings["schemas"]
					// Store inline schemas for schemaRequestService to resolve
					const yamlSchemas: yaml.LanguageSettings["schemas"] = schemas
						.filter(
							(config): config is Required<SchemaConfiguration> =>
								config.fileMatch !== undefined && config.schema !== undefined,
						)
						.map((config) => {
							// Store inline schema for schemaRequestService
							if (config.schema) {
								inlineSchemas.set(config.uri, config.schema);
							}
							return {
								uri: config.uri,
								fileMatch: config.fileMatch,
								// Don't pass schema inline - let schemaRequestService handle it
								schema: undefined,
								folderUri: config.folderUri,
							};
						});
					if (yamlSchemas.length > 0) {
						ls.configure({
							...baseSettings,
							schemas: yamlSchemas,
						});
					}
				}

				return await callback();
			}

			/**
			 * Initialize the YAML language service with base settings.
			 * Called once on first use, then cached.
			 */
			async function initialize(): Promise<void> {
				const settings = await getLanguageSettings(context);
				ls.configure(settings);
			}
		},
	};
}

/**
 * Create a YAML language service with a single schema applied to all documents.
 * Use this when pattern matching happens upstream and all documents should use the same schema.
 * Perfect for config files where the document selector already filters to the right files.
 *
 * Defaults:
 * - name: "telescope-yaml-service" - Used in plugin name and schema URI generation
 * - documentSelector: Matches all YAML files using glob pattern
 * - getWorkspaceContextService: undefined - Uses default from create() function
 * - getLanguageSettings: undefined - Uses default from create() function (all features enabled, YAML 1.2)
 * - onDidChangeLanguageSettings: undefined - Uses default from create() function (no-op)
 *
 * @param options - Configuration options for the single-schema YAML service
 * @param options.name - Name identifier for this service plugin (default: "telescope-yaml-service")
 * @param options.schema - The JSON Schema object to apply to all matching documents (required)
 * @param options.documentSelector - Document selector to determine which files this service handles (default: all YAML files)
 * @param options.getWorkspaceContextService - Optional function to create workspace context service (default: uses create() default)
 * @param options.getLanguageSettings - Optional function to get language settings (default: uses create() default)
 * @param options.onDidChangeLanguageSettings - Optional function to register settings change listener (default: uses create() default)
 * @returns A configured LanguageServicePlugin instance with the single schema applied
 */
export function createSingleSchemaYamlService({
	name = "telescope-yaml-service",
	schema,
	documentSelector = [{ language: "yaml", pattern: "**/*.yaml" }],
	getWorkspaceContextService,
	getLanguageSettings,
	onDidChangeLanguageSettings,
}: {
	/** Name identifier for this service plugin. Used in the plugin name and schema URI generation. */
	name?: string;
	/** The JSON Schema object to apply to all matching documents. Should be a valid JSON Schema Draft 2020-12 or compatible format. */
	schema: Record<string, unknown>;
	/** Document selector to determine which files this service handles. */
	documentSelector?: DocumentSelector;
	/** Optional function to create workspace context service for resolving relative paths. */
	getWorkspaceContextService?(
		context: LanguageServiceContext,
	): yaml.WorkspaceContextService;
	/** Optional function to get language settings for the YAML language service. */
	getLanguageSettings?(
		context: LanguageServiceContext,
	): ProviderResult<yaml.LanguageSettings>;
	/** Optional function to register a listener for language settings changes. */
	onDidChangeLanguageSettings?(
		listener: () => void,
		context: LanguageServiceContext,
	): Disposable;
}): LanguageServicePlugin {
	const getSchemasForDocument: SchemaResolver = (document) => {
		return [wrapSchema(name.toLowerCase(), schema, document.uri)];
	};

	const plugin = create({
		documentSelector,
		getSchemasForDocument,
		getWorkspaceContextService,
		getLanguageSettings,
		onDidChangeLanguageSettings,
	});

	return {
		...plugin,
		name,
	};
}

/**
 * Create a YAML language service with content-based schema selection.
 * Use this when you need to select schemas based on document content analysis.
 * The resolver function receives the document and returns appropriate schemas.
 *
 * This is ideal for scenarios where you have deterministic file type detection
 * and want to select schemas based on the document's content or structure.
 *
 * Defaults:
 * - getSchemasForDocument: Required - No default, must be provided
 * - documentSelector: Matches all YAML files using glob pattern
 * - name: "telescope-yaml-service" - Used in plugin name
 * - getWorkspaceContextService: undefined - Uses default from create() function
 * - getLanguageSettings: undefined - Uses default from create() function (all features enabled, YAML 1.2)
 * - onDidChangeLanguageSettings: undefined - Uses default from create() function (no-op)
 *
 * @param options - Configuration options for the content-based YAML service
 * @param options.getSchemasForDocument - Function that receives a document and returns schemas to apply (required)
 * @param options.documentSelector - Document selector to determine which files this service handles (default: all YAML files)
 * @param options.name - Name identifier for this service plugin (default: "telescope-yaml-service")
 * @param options.getWorkspaceContextService - Optional function to create workspace context service (default: uses create() default)
 * @param options.getLanguageSettings - Optional function to get language settings (default: uses create() default)
 * @param options.onDidChangeLanguageSettings - Optional function to register settings change listener (default: uses create() default)
 * @returns A configured LanguageServicePlugin instance with content-based schema selection
 */
export function createContentBasedYamlService({
	getSchemasForDocument,
	documentSelector = [{ language: "yaml", pattern: "**/*.yaml" }],
	name = "telescope-yaml-service",
	getWorkspaceContextService,
	getLanguageSettings,
	onDidChangeLanguageSettings,
}: {
	/** Function that receives a document and returns schemas to apply. This function is called for each document to determine which schemas should be used. */
	getSchemasForDocument: SchemaResolver;
	/** Document selector to determine which files this service handles. */
	documentSelector?: DocumentSelector;
	/** Name identifier for this service plugin. */
	name?: string;
	/** Optional function to create workspace context service for resolving relative paths. */
	getWorkspaceContextService?(
		context: LanguageServiceContext,
	): yaml.WorkspaceContextService;
	/** Optional function to get language settings for the YAML language service. */
	getLanguageSettings?(
		context: LanguageServiceContext,
	): ProviderResult<yaml.LanguageSettings>;
	/** Optional function to register a listener for language settings changes. */
	onDidChangeLanguageSettings?(
		listener: () => void,
		context: LanguageServiceContext,
	): Disposable;
}): LanguageServicePlugin {
	const plugin = create({
		documentSelector,
		getSchemasForDocument,
		getWorkspaceContextService,
		getLanguageSettings,
		onDidChangeLanguageSettings,
	});

	return {
		...plugin,
		name,
	};
}

/**
 * Create a YAML language service with pattern-based schema selection.
 * Use this when you have schema+pattern pairs and want file matching to determine which schemas apply.
 * Similar to how additional-validation service works.
 *
 * Each schema+pattern pair is evaluated, and all matching schemas are applied to the document.
 * This allows multiple schemas to be applied to a single document if multiple patterns match.
 *
 * Defaults:
 * - schemaPatterns: Required - No default, must be provided
 * - documentSelector: Matches all YAML files using glob pattern
 * - name: "telescope-yaml-service" - Used in plugin name and schema URI generation
 * - getWorkspaceContextService: undefined - Uses default from create() function
 * - getLanguageSettings: undefined - Uses default from create() function (all features enabled, YAML 1.2)
 * - onDidChangeLanguageSettings: undefined - Uses default from create() function (no-op)
 *
 * @param options - Configuration options for the pattern-based YAML service
 * @param options.schemaPatterns - Array of schema+pattern pairs to evaluate (required)
 * @param options.documentSelector - Document selector to determine which files this service handles (default: all YAML files)
 * @param options.name - Name identifier for this service plugin (default: "telescope-yaml-service")
 * @param options.getWorkspaceContextService - Optional function to create workspace context service (default: uses create() default)
 * @param options.getLanguageSettings - Optional function to get language settings (default: uses create() default)
 * @param options.onDidChangeLanguageSettings - Optional function to register settings change listener (default: uses create() default)
 * @returns A configured LanguageServicePlugin instance with pattern-based schema selection
 */
export function createPatternBasedYamlService({
	schemaPatterns,
	documentSelector = [{ language: "yaml", pattern: "**/*.yaml" }],
	name = "telescope-yaml-service",
	getWorkspaceContextService,
	getLanguageSettings,
	onDidChangeLanguageSettings,
}: {
	/** Array of schema+pattern pairs to evaluate. Each pair contains a schema and a glob pattern that determines when the schema applies. */
	schemaPatterns:
		| Array<{
				schema: Record<string, unknown>;
				pattern: string;
		  }>
		| (() =>
				| Array<{
						schema: Record<string, unknown>;
						pattern: string;
				  }>
				| Promise<
						Array<{
							schema: Record<string, unknown>;
							pattern: string;
						}>
				  >);
	/** Document selector to determine which files this service handles. */
	documentSelector?: DocumentSelector;
	/** Name identifier for this service plugin. */
	name?: string;
	/** Optional function to create workspace context service for resolving relative paths. */
	getWorkspaceContextService?(
		context: LanguageServiceContext,
	): yaml.WorkspaceContextService;
	/** Optional function to get language settings for the YAML language service. */
	getLanguageSettings?(
		context: LanguageServiceContext,
	): ProviderResult<yaml.LanguageSettings>;
	/** Optional function to register a listener for language settings changes. */
	onDidChangeLanguageSettings?(
		listener: () => void,
		context: LanguageServiceContext,
	): Disposable;
}): LanguageServicePlugin {
	/**
	 * Check if a URI matches a glob pattern.
	 * Supports basic glob patterns: ** (any path), * (any characters except /), ? (single character).
	 * Also performs substring matching as a fallback.
	 *
	 * @param uri - The URI to check
	 * @param pattern - The glob pattern to match against
	 * @returns True if the URI matches the pattern, false otherwise
	 */
	function matchesPattern(uri: string, pattern: string): boolean {
		// Convert glob pattern to regex
		// Use a placeholder for ** to avoid * replacement matching it
		const globStarPlaceholder = "___GLOBSTAR___";
		const regexPattern = pattern
			.replace(/\*\*/g, globStarPlaceholder)
			.replace(/\*/g, "[^/]*")
			.replace(new RegExp(globStarPlaceholder, "g"), ".*")
			.replace(/\?/g, ".");
		const regex = new RegExp(`^${regexPattern}$`);
		return regex.test(uri) || uri.includes(pattern);
	}

	const getSchemasForDocument: SchemaResolver = async (document) => {
		const matchingSchemas: SchemaConfiguration[] = [];
		const patterns =
			typeof schemaPatterns === "function"
				? await schemaPatterns()
				: schemaPatterns;

		patterns.forEach(({ schema, pattern }) => {
			const matches = matchesPattern(document.uri, pattern);
			if (matches) {
				matchingSchemas.push(
					wrapSchema(name.toLowerCase(), schema, document.uri),
				);
			}
		});
		return matchingSchemas.length > 0 ? matchingSchemas : undefined;
	};

	const plugin = create({
		documentSelector,
		getSchemasForDocument,
		getWorkspaceContextService,
		getLanguageSettings,
		onDidChangeLanguageSettings,
	});

	return {
		...plugin,
		name,
	};
}

/**
 * Check if a document matches the given document selector.
 * A document matches if its language ID matches any selector entry.
 *
 * @param selector - The document selector to match against
 * @param document - The text document to check
 * @returns True if the document matches the selector, false otherwise
 */
function matchDocument(
	/**
	 * The document selector to match against.
	 * Can be an array of language IDs (strings) or objects with language properties.
	 */
	selector: DocumentSelector,
	/**
	 * The text document to check
	 */
	document: TextDocument,
): boolean {
	for (const sel of selector) {
		if (
			sel === document.languageId ||
			(typeof sel === "object" && sel.language === document.languageId)
		) {
			return true;
		}
	}
	return false;
}
