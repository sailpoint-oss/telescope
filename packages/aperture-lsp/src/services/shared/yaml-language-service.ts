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
import type { SchemaConfiguration, SchemaResolver } from "../../types.js";

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
	schemaName: string,
	schema: Record<string, unknown>,
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
	documentSelector?: DocumentSelector;
	getWorkspaceContextService?(
		context: LanguageServiceContext,
	): yaml.WorkspaceContextService;
	getLanguageSettings?(
		context: LanguageServiceContext,
	): ProviderResult<yaml.LanguageSettings>;
	getSchemasForDocument?: SchemaResolver;
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
			const inlineSchemas = new Map<string, Record<string, unknown>>();

			const ls = yaml.getLanguageService({
				schemaRequestService: async (uri) => {
					const inlineSchema = inlineSchemas.get(uri);
					if (inlineSchema) {
						return JSON.stringify(inlineSchema);
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
			const disposable = onDidChangeLanguageSettings(() => {
				initializing = undefined;
				documentConfigCache.clear();
				inlineSchemas.clear();
			}, context);

			let initializing: Promise<void> | undefined;
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

			async function worker<T>(
				document: TextDocument,
				callback: () => T,
			): Promise<Awaited<T> | undefined> {
				if (!matchDocument(documentSelector, document)) {
					return;
				}

				initializing ??= initialize();
				await initializing;

				let schemas: SchemaConfiguration[] | undefined;

				const cacheKey = `${document.uri}:${document.version}`;
				const cached = documentConfigCache.get(cacheKey);
				if (cached && cached.version === document.version) {
					schemas = cached.schemas;
				} else {
					if (getSchemasForDocument) {
						schemas = await getSchemasForDocument(document, context);
					}
					documentConfigCache.set(cacheKey, {
						schemas,
						version: document.version,
					});
				}

				if (schemas && schemas.length > 0) {
					const baseSettings = await getLanguageSettings(context);
					const yamlSchemas: yaml.LanguageSettings["schemas"] = schemas
						.filter(
							(config): config is Required<SchemaConfiguration> =>
								config.fileMatch !== undefined && config.schema !== undefined,
						)
						.map((config) => {
							if (config.schema) {
								inlineSchemas.set(config.uri, config.schema);
							}
							return {
								uri: config.uri,
								fileMatch: config.fileMatch,
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

			async function initialize(): Promise<void> {
				const settings = await getLanguageSettings(context);
				ls.configure(settings);
			}
		},
	};
}

export function createSingleSchemaYamlService({
	name = "telescope-yaml-service",
	schema,
	documentSelector = [{ language: "yaml", pattern: "**/*.yaml" }],
	getWorkspaceContextService,
	getLanguageSettings,
	onDidChangeLanguageSettings,
}: {
	name?: string;
	schema: Record<string, unknown>;
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

export function createCustomYamlService({
	schemaResolver,
	documentSelector = [{ language: "yaml", pattern: "**/*.yaml" }],
	name = "telescope-yaml-service",
	getWorkspaceContextService,
	getLanguageSettings,
	onDidChangeLanguageSettings,
}: {
	schemaResolver: SchemaResolver;
	documentSelector?: DocumentSelector;
	name?: string;
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
	const plugin = create({
		documentSelector,
		getSchemasForDocument: schemaResolver,
		getWorkspaceContextService,
		getLanguageSettings,
		onDidChangeLanguageSettings,
	});

	return {
		...plugin,
		name,
	};
}

function matchDocument(
	selector: DocumentSelector,
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
