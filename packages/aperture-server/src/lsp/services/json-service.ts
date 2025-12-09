import type {
	Diagnostic,
	Disposable,
	DocumentSelector,
	FormattingOptions,
	LanguageServiceContext,
	LanguageServicePlugin,
	LanguageServicePluginInstance,
	ProviderResult,
} from "@volar/language-service";
import * as json from "vscode-json-languageservice";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI, Utils } from "vscode-uri";
import { DataVirtualCode } from "../languages/virtualCodes/data-virtual-code.js";
import type { ApertureVolarContext } from "../workspace/context";
import {
	openapiJsonSchemas,
	resolveDocumentContext,
} from "./shared/schema-registry.js";
import { matchDocument } from "./shared/virtual-code-utils.js";

export interface Provide {
	"json/jsonDocument": (
		document: TextDocument,
	) => json.JSONDocument | undefined;
	"json/languageService": () => json.LanguageService;
}

export interface JSONSchemaSettings {
	fileMatch?: string[];
	url?: string;
	schema?: json.JSONSchema;
	folderUri?: string;
}

export function resolveReference(
	ref: string,
	baseUri: URI,
	workspaceFolders: URI[],
) {
	if (ref.match(/^\w[\w\d+.-]*:/)) {
		// starts with a schema
		return ref;
	}
	if (ref[0] === "/") {
		// resolve absolute path against the current workspace folder
		const folderUri = getRootFolder();
		if (folderUri) {
			return folderUri + ref.substr(1);
		}
	}
	const baseUriDir = baseUri.path.endsWith("/")
		? baseUri
		: Utils.dirname(baseUri);
	return Utils.resolvePath(baseUriDir, ref).toString(true);

	function getRootFolder(): string | undefined {
		for (const folder of workspaceFolders) {
			let folderURI = folder.toString();
			if (!folderURI.endsWith("/")) {
				folderURI = `${folderURI}/`;
			}
			if (baseUri.toString().startsWith(folderURI)) {
				return folderURI;
			}
		}
	}
}

/**
 * Create a Volar language service for JSON documents.
 *
 * This service handles only the generic "json" and "jsonc" languageIds.
 * OpenAPI documents use the embedded DataVirtualCode with "json" languageId,
 * so they get JSON features through the embedded code.
 *
 * Schema Architecture:
 * - All schemas (OpenAPI + user) are registered ONCE at initialization
 * - Schema associations are configured per-document but cached
 * - schemaRequestService resolves schemas dynamically by key
 * - Schemas are only re-registered on config changes (for user schemas)
 */
export function create({
	shared,
	documentSelector = ["json", "jsonc"],
	getWorkspaceContextService = (context) => {
		return {
			resolveRelativePath(ref, resource) {
				const base = resource.substring(0, resource.lastIndexOf("/") + 1);
				let baseUri = URI.parse(base);
				const decoded = context.decodeEmbeddedDocumentUri(baseUri);
				if (decoded) {
					baseUri = decoded[0];
				}
				return resolveReference(ref, baseUri, context.env.workspaceFolders);
			},
		};
	},
	isFormattingEnabled = async (_document, context) => {
		return (await context.env.getConfiguration?.("json.format.enable")) ?? true;
	},
	getFormattingOptions = async (_document, options, context) => {
		return {
			...options,
			...(await context.env.getConfiguration?.("json.format")),
		};
	},
	getLanguageSettings = async (context) => {
		const languageSettings: json.LanguageSettings = {};

		languageSettings.validate =
			(await context.env.getConfiguration<boolean>?.("json.validate")) ?? true;
		languageSettings.schemas ??= [];

		const schemas =
			(await context.env.getConfiguration<JSONSchemaSettings[]>?.(
				"json.schemas",
			)) ?? [];

		for (let i = 0; i < schemas.length; i++) {
			const schema = schemas[i];
			if (!schema) {
				continue;
			}
			let uri = schema.url;
			if (!uri && schema.schema) {
				uri = schema.schema.id || `vscode://schemas/custom/${i}`;
			}
			if (uri) {
				languageSettings.schemas.push({
					uri,
					fileMatch: schema.fileMatch,
					schema: schema.schema,
					folderUri: schema.folderUri,
				});
			}
		}
		return languageSettings;
	},
	getDocumentLanguageSettings = (document) => {
		return document.languageId === "jsonc"
			? { comments: "ignore", trailingCommas: "warning" }
			: { comments: "error", trailingCommas: "error" };
	},
	onDidChangeLanguageSettings = (listener, context) => {
		const disposable = context.env.onDidChangeConfiguration?.(listener);
		return {
			dispose() {
				disposable?.dispose();
			},
		};
	},
}: {
	shared: ApertureVolarContext;
	documentSelector?: DocumentSelector;
	getWorkspaceContextService?(
		context: LanguageServiceContext,
	): json.WorkspaceContextService;
	isFormattingEnabled?(
		document: TextDocument,
		context: LanguageServiceContext,
	): ProviderResult<boolean>;
	getFormattingOptions?(
		document: TextDocument,
		options: FormattingOptions,
		context: LanguageServiceContext,
	): ProviderResult<json.FormattingOptions>;
	getLanguageSettings?(
		context: LanguageServiceContext,
	): ProviderResult<json.LanguageSettings>;
	getDocumentLanguageSettings?(
		document: TextDocument,
		context: LanguageServiceContext,
	): ProviderResult<json.DocumentLanguageSettings | undefined>;
	onDidChangeLanguageSettings?(
		listener: () => void,
		context: LanguageServiceContext,
	): Disposable;
}): LanguageServicePlugin {
	const logger = shared.getLogger("JSON LS");
	logger.log("Creating JSON LS plugin");

	return {
		name: "json",
		capabilities: {
			completionProvider: {
				// https://github.com/microsoft/vscode/blob/09850876e652688fb142e2e19fd00fd38c0bc4ba/extensions/json-language-features/server/src/jsonServer.ts#L150
				triggerCharacters: ['"', ":"],
				resolveProvider: true,
			},
			definitionProvider: true,
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false,
			},
			hoverProvider: true,
			documentLinkProvider: {},
			documentSymbolProvider: true,
			colorProvider: true,
			foldingRangeProvider: true,
			selectionRangeProvider: true,
			documentFormattingProvider: true,
		},

		create(context): LanguageServicePluginInstance<Provide> {
			// Schema URI prefix for our schemas
			const SCHEMA_PREFIX = "telescope://";

			// JSON document cache
			const jsonDocuments = new WeakMap<
				TextDocument,
				[number, json.JSONDocument]
			>();

			// Cache for document -> schema URI associations
			const documentSchemaAssociations = new Map<string, string>();

			// Create the JSON language service
			const jsonLs = json.getLanguageService({
				schemaRequestService: async (uri) => {
					// Handle telescope:// schema URIs
					if (uri.startsWith(SCHEMA_PREFIX)) {
						const schemaKey = uri.slice(SCHEMA_PREFIX.length);
						const schema = shared.getSchemaByKey(schemaKey);
						if (schema) {
							logger.log(`[Schema] Serving schema for key: ${schemaKey}`);
							return JSON.stringify(schema);
						}
						logger.log(`[Schema] No schema found for key: ${schemaKey}`);
						return "{}";
					}

					// Fall back to file system for external schemas
					const isInternalRef =
						uri.startsWith("file:///") &&
						!uri.includes("/", 8) &&
						!uri.includes(".");
					if (!isInternalRef) {
						logger.log(`[Schema] Loading from file system: ${uri}`);
					}
					return (await context.env.fs?.readFile(URI.parse(uri))) ?? "";
				},
				workspaceContext: getWorkspaceContextService(context),
				clientCapabilities: context.env.clientCapabilities,
			});

			// Track if user schemas have been registered
			let userSchemasRegistered = false;

			const disposable = onDidChangeLanguageSettings(async () => {
				// Re-register user schemas on config change
				logger.log("[Schema] Config changed, re-registering user schemas");
				await registerUserSchemas();
				// Reconfigure with updated settings
				await reconfigureLanguageService();
			}, context);

			let initializing: Promise<void> | undefined;

			return {
				dispose() {
					disposable.dispose();
				},

				provide: {
					"json/jsonDocument": getJsonDocument,
					"json/languageService": () => jsonLs,
				},

				provideCompletionItems(document, position) {
					return worker(document, async (jsonDocument) => {
						return await jsonLs.doComplete(document, position, jsonDocument);
					});
				},

				resolveCompletionItem(item) {
					return jsonLs.doResolve(item);
				},

				provideDefinition(document, position) {
					return worker(document, async (jsonDocument) => {
						return await jsonLs.findDefinition(
							document,
							position,
							jsonDocument,
						);
					});
				},

				async provideDiagnostics(document): Promise<Diagnostic[] | undefined> {
					return worker(document, async (jsonDocument) => {
						const settings = await getDocumentLanguageSettings(
							document,
							context,
						);
						return await jsonLs.doValidation(document, jsonDocument, settings);
					});
				},

				provideHover(document, position) {
					return worker(document, async (jsonDocument) => {
						return await jsonLs.doHover(document, position, jsonDocument);
					});
				},

				provideDocumentLinks(document) {
					return worker(document, (jsonDocument) => {
						return jsonLs.findLinks(document, jsonDocument);
					});
				},

				provideDocumentSymbols(document) {
					return worker(document, (jsonDocument) => {
						return jsonLs.findDocumentSymbols2(document, jsonDocument);
					});
				},

				provideDocumentColors(document) {
					return worker(document, (jsonDocument) => {
						return jsonLs.findDocumentColors(document, jsonDocument);
					});
				},

				provideColorPresentations(document, color, range) {
					return worker(document, (jsonDocument) => {
						return jsonLs.getColorPresentations(
							document,
							jsonDocument,
							color,
							range,
						);
					});
				},

				provideFoldingRanges(document) {
					return worker(document, () => {
						return jsonLs.getFoldingRanges(
							document,
							context.env.clientCapabilities?.textDocument?.foldingRange,
						);
					});
				},

				provideSelectionRanges(document, positions) {
					return worker(document, (jsonDocument) => {
						return jsonLs.getSelectionRanges(document, positions, jsonDocument);
					});
				},

				provideDocumentFormattingEdits(document, range, options) {
					return worker(document, async () => {
						if (!(await isFormattingEnabled(document, context))) {
							return;
						}

						const formatOptions = await getFormattingOptions(
							document,
							options,
							context,
						);

						return jsonLs.format(document, range, formatOptions);
					});
				},
			};

			/**
			 * Register user-defined schemas from workspace configuration.
			 */
			async function registerUserSchemas(): Promise<void> {
				const userSchemas = shared.getUserSchemas();
				if (userSchemas.length === 0) {
					if (userSchemasRegistered) {
						logger.log("[Schema] No user schemas to register");
					}
					userSchemasRegistered = true;
					return;
				}

				logger.log(`[Schema] Registered ${userSchemas.length} user schemas`);
				userSchemasRegistered = true;
			}

			/**
			 * Reconfigure the language service with current schemas.
			 * Called at initialization and when config changes.
			 */
			async function reconfigureLanguageService(): Promise<void> {
				const baseSettings = await getLanguageSettings(context);

				// Build schema configurations from current associations
				const schemaConfigs: json.SchemaConfiguration[] = [
					...(baseSettings.schemas || []),
				];

				// Add document-specific schema associations
				for (const [docUri, schemaUri] of documentSchemaAssociations) {
					schemaConfigs.push({
						uri: schemaUri,
						fileMatch: [docUri],
					});
				}

				jsonLs.configure({
					...baseSettings,
					schemas: schemaConfigs,
				});
			}

			/**
			 * Resolve and associate a schema for a document.
			 */
			function associateSchemaForDocument(
				documentUri: string,
				schemaKey: string,
			): void {
				const schemaUri = `${SCHEMA_PREFIX}${schemaKey}`;

				// Check if already associated with the same schema
				if (documentSchemaAssociations.get(documentUri) === schemaUri) {
					return;
				}

				documentSchemaAssociations.set(documentUri, schemaUri);
				logger.log(
					`[Schema] Associated document ${documentUri} with schema ${schemaKey}`,
				);

				// Reconfigure to apply the new association
				// Note: This is async but we don't wait - the schema will be available for next operation
				reconfigureLanguageService();
			}

			/**
			 * Resolve the schema key for a document and associate it.
			 */
			function resolveAndAssociateSchema(document: TextDocument): void {
				const resolved = resolveDocumentContext(
					document,
					context,
					DataVirtualCode,
				);

				if (!resolved) {
					return;
				}

				const { virtualCode } = resolved;
				const schemaKey = virtualCode.schemaKey;

				if (schemaKey) {
					associateSchemaForDocument(document.uri, schemaKey);
				}
			}

			/**
			 * Worker that ensures initialization and document matching.
			 */
			async function worker<T>(
				document: TextDocument,
				callback: (jsonDocument: json.JSONDocument) => T,
			): Promise<Awaited<T> | undefined> {
				if (!matchDocument(documentSelector, document)) {
					return undefined;
				}

				const jsonDocument = getJsonDocument(document);
				if (!jsonDocument) {
					return undefined;
				}

				// Initialize once
				initializing ??= initialize();
				await initializing;

				// Resolve and associate schema for this document
				resolveAndAssociateSchema(document);

				return await callback(jsonDocument);
			}

			/**
			 * Initialize the language service.
			 */
			async function initialize(): Promise<void> {
				await registerUserSchemas();
				await reconfigureLanguageService();
				logger.log("[Schema] JSON language service initialized");
			}

			/**
			 * Get or parse a JSON document.
			 */
			function getJsonDocument(textDocument: TextDocument) {
				if (!matchDocument(documentSelector, textDocument)) {
					return;
				}

				const cache = jsonDocuments.get(textDocument);
				if (cache) {
					const [cacheVersion, cacheDoc] = cache;
					if (cacheVersion === textDocument.version) {
						return cacheDoc;
					}
				}

				const doc = jsonLs.parseJSONDocument(textDocument);
				jsonDocuments.set(textDocument, [textDocument.version, doc]);

				return doc;
			}
		},
	};
}
