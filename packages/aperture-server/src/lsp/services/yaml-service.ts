import type {
	Diagnostic,
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
import { DataVirtualCode } from "../languages/virtualCodes/data-virtual-code.js";
import type { ApertureVolarContext } from "../workspace/context";
import {
	openapiJsonSchemas,
	resolveDocumentContext,
} from "./shared/schema-registry.js";
import { matchDocument } from "./shared/virtual-code-utils.js";

export interface Provide {
	"yaml/languageService": () => yaml.LanguageService;
}

function noop(): undefined {}

/**
 * Create a Volar language service for YAML documents.
 *
 * This service handles only the generic "yaml" languageId.
 * OpenAPI documents use the embedded DataVirtualCode with "yaml" languageId,
 * so they get YAML features through the embedded code.
 *
 * Schema Architecture:
 * - All schemas (OpenAPI + user) are registered ONCE at initialization
 * - A custom schema provider dynamically resolves which schema applies to each document
 * - Schema provider uses VirtualCode.schemaKey for resolution
 * - Schemas are only re-registered on config changes (for user schemas)
 */
export function create({
	shared,
	documentSelector = ["yaml"],
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
	onDidChangeLanguageSettings = (listener, context) => {
		// Hook into configuration changes
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
	): yaml.WorkspaceContextService;
	getLanguageSettings?(
		context: LanguageServiceContext,
	): ProviderResult<yaml.LanguageSettings>;
	onDidChangeLanguageSettings?(
		listener: () => void,
		context: LanguageServiceContext,
	): Disposable;
}): LanguageServicePlugin {
	const logger = shared.getLogger("YAML LS");
	logger.log("Creating YAML LS plugin");

	return {
		name: "yaml",
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

		create(context): LanguageServicePluginInstance<Provide> {
			// Schema URI prefix for our schemas
			const SCHEMA_PREFIX = "telescope://";

			// Create the YAML language service
			const ls = yaml.getLanguageService({
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
				telemetry: {
					send: noop,
					sendError: noop,
					sendTrack: noop,
				},
				clientCapabilities: context.env?.clientCapabilities,
				workspaceContext: getWorkspaceContextService(context),
			});

			// Register custom schema provider - this is called by yaml-language-server
			// to determine which schema(s) apply to a document
			ls.registerCustomSchemaProvider(async (documentUri: string) => {
				const schemaKey = resolveSchemaKeyForDocument(documentUri);
				if (!schemaKey) {
					return [];
				}
				logger.log(`[Schema] Custom provider resolved: ${documentUri} -> ${schemaKey}`);
				return [`${SCHEMA_PREFIX}${schemaKey}`];
			});

			// Register all built-in OpenAPI schemas once
			registerBuiltInSchemas();

			// Track if we need to re-register user schemas
			let userSchemasRegistered = false;

			const disposable = onDidChangeLanguageSettings(async () => {
				// Re-register user schemas on config change
				logger.log("[Schema] Config changed, re-registering user schemas");
				await registerUserSchemas();
			}, context);

			let initializing: Promise<void> | undefined;

			return {
				dispose() {
					disposable.dispose();
				},

				provide: {
					"yaml/languageService": () => ls,
				},

				provideCodeActions(document, range, codeActionContext) {
					return worker(document, () => {
						return ls.getCodeAction(document, {
							context: codeActionContext,
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

				async provideDiagnostics(document): Promise<Diagnostic[] | undefined> {
					return worker(document, async () => {
						return await ls.doValidation(document, false);
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
			 * Register all built-in OpenAPI schemas.
			 * Called once at initialization.
			 */
			function registerBuiltInSchemas(): void {
				let count = 0;
				for (const [docType, schema] of Object.entries(openapiJsonSchemas)) {
					if (schema) {
						const schemaId = `openapi-${docType}`;
						ls.addSchema(schemaId, schema);
						count++;
					}
				}
				logger.log(`[Schema] Registered ${count} built-in OpenAPI schemas`);
			}

			/**
			 * Register user-defined schemas from workspace configuration.
			 * Called at initialization and on config changes.
			 */
			async function registerUserSchemas(): Promise<void> {
				// Get user schemas from shared context
				const userSchemas = shared.getUserSchemas();
				if (userSchemas.length === 0) {
					if (userSchemasRegistered) {
						logger.log("[Schema] No user schemas to register");
					}
					userSchemasRegistered = true;
					return;
				}

				for (const { id, schema } of userSchemas) {
					ls.addSchema(id, schema);
				}
				logger.log(`[Schema] Registered ${userSchemas.length} user schemas`);
				userSchemasRegistered = true;
			}

			/**
			 * Resolve the schema key for a document URI.
			 * Uses the VirtualCode's schemaKey property.
			 */
			function resolveSchemaKeyForDocument(documentUri: string): string | undefined {
				try {
					// Parse the document URI and resolve the virtual code
					const parsedUri = URI.parse(documentUri);
					const decoded = context.decodeEmbeddedDocumentUri(parsedUri);
					
					if (!decoded) {
						// Not an embedded document - might be a direct file
						return undefined;
					}

					const [sourceUri, embeddedCodeId] = decoded;
					const sourceScript = context.language.scripts.get(sourceUri);
					
					if (!sourceScript?.generated) {
						return undefined;
					}

					let virtualCode: unknown;

					if (embeddedCodeId === "root") {
						virtualCode = sourceScript.generated.root;
					} else {
						// Try Map lookup first
						virtualCode = sourceScript.generated.embeddedCodes.get(embeddedCodeId);

						// Fallback: iterate through root's embedded codes
						if (!virtualCode && sourceScript.generated.root?.embeddedCodes) {
							for (const code of sourceScript.generated.root.embeddedCodes) {
								if (code.id === embeddedCodeId) {
									virtualCode = code;
									break;
								}
							}
						}
					}

					if (virtualCode instanceof DataVirtualCode) {
						return virtualCode.schemaKey;
					}

					return undefined;
				} catch (error) {
					logger.log(`[Schema] Error resolving schema key for ${documentUri}: ${error}`);
					return undefined;
				}
			}

			/**
			 * Worker that ensures initialization and document matching.
			 * No longer configures schemas per-request - that's handled by the custom provider.
			 */
			async function worker<T>(
				document: TextDocument,
				callback: () => T,
			): Promise<Awaited<T> | undefined> {
				if (!matchDocument(documentSelector, document)) {
					return undefined;
				}

				// Initialize once
				initializing ??= initialize();
				await initializing;

				return await callback();
			}

			/**
			 * Initialize the language service with base settings.
			 * Schemas are registered separately via addSchema and custom provider.
			 */
			async function initialize(): Promise<void> {
				const settings = await getLanguageSettings(context);
				ls.configure(settings);

				// Register user schemas on first initialization
				await registerUserSchemas();

				logger.log("[Schema] YAML language service initialized");
			}
		},
	};
}
