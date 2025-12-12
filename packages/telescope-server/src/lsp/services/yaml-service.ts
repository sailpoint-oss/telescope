/**
 * YAML Language Service Wrapper
 *
 * Wraps yaml-language-server to provide base YAML/JSON language features.
 * This service handles:
 * - Hover information (with OpenAPI schema descriptions)
 * - Folding ranges
 * - Selection ranges
 * - Completions
 * - Document symbols
 * - Formatting
 *
 * OpenAPI-specific features are layered on top by the handler modules.
 *
 * @module lsp/services/yaml-service
 */

import {
	getLanguageService,
	type LanguageService,
	type LanguageSettings,
} from "yaml-language-server";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type {
	Hover,
	FoldingRange,
	SelectionRange,
	CompletionList,
	DocumentSymbol,
	Position,
	TextEdit,
	FormattingOptions,
} from "vscode-languageserver-protocol";
import { getCachedSchema } from "./shared/schema-cache.js";

/**
 * YAML Service configuration options.
 */
export interface YAMLServiceOptions {
	/** Enable validation (disabled by default - we use Zod) */
	validate?: boolean;
	/** Enable hover */
	hover?: boolean;
	/** Enable completion */
	completion?: boolean;
	/** Enable formatting */
	format?: boolean;
}

/**
 * Creates and configures a YAML language service instance.
 *
 * @param options - Configuration options
 * @returns Configured language service
 */
export function createYAMLService(options: YAMLServiceOptions = {}): LanguageService {
	const languageService = getLanguageService({
		// Schema fetching - return OpenAPI schemas for telescope:// URIs
		schemaRequestService: async (uri: string): Promise<string> => {
			// Handle telescope:// schema URIs
			if (uri.startsWith("telescope://")) {
				const schemaKey = uri.replace("telescope://", "");
				const schema = getCachedSchema(schemaKey);
				if (schema) {
					return JSON.stringify(schema);
				}
			}
			// Return empty schema for unknown URIs
			return "{}";
		},

		// Workspace path resolution
		workspaceContext: {
			resolveRelativePath: (relativePath: string, resource: string) => {
				// Simple resolution for $ref paths
				const resourceDir = resource.substring(0, resource.lastIndexOf("/"));
				if (relativePath.startsWith("/")) {
					return relativePath;
				}
				return `${resourceDir}/${relativePath}`;
			},
		},
	});

	// Configure the service with OpenAPI schema associations
	const settings: LanguageSettings = {
		validate: options.validate ?? false, // Disabled - we use Zod for OpenAPI validation
		hover: options.hover ?? true,
		completion: options.completion ?? true,
		format: options.format ?? true,
		// Associate OpenAPI schemas with YAML/JSON files
		// The yaml-language-server will use these for hover and completions
		schemas: [
			{
				uri: "telescope://openapi-3.1-root",
				fileMatch: ["*.yaml", "*.yml", "*.json"],
			},
		],
		customTags: [], // Add custom tags if needed
		yamlVersion: "1.2",
	};

	languageService.configure(settings);

	return languageService;
}

/**
 * YAMLService class wraps the yaml-language-server for easier use.
 */
export class YAMLService {
	private service: LanguageService;

	constructor(options: YAMLServiceOptions = {}) {
		this.service = createYAMLService(options);
	}

	/**
	 * Get hover information for a position in the document.
	 */
	async getHover(document: TextDocument, position: Position): Promise<Hover | null> {
		try {
			const hover = await this.service.doHover(document, position);
			return hover ?? null;
		} catch (error) {
			// YAML service can throw on malformed documents
			return null;
		}
	}

	/**
	 * Get folding ranges for a document.
	 */
	getFoldingRanges(document: TextDocument): FoldingRange[] {
		try {
			const ranges = this.service.getFoldingRanges(document, {
				rangeLimit: 5000,
			});
			return ranges ?? [];
		} catch (error) {
			return [];
		}
	}

	/**
	 * Get selection ranges for positions in a document.
	 */
	async getSelectionRanges(
		document: TextDocument,
		positions: Position[],
	): Promise<SelectionRange[]> {
		try {
			const ranges = await this.service.getSelectionRanges(document, positions);
			return ranges ?? [];
		} catch (error) {
			return [];
		}
	}

	/**
	 * Get completion items for a position in the document.
	 */
	async getCompletions(
		document: TextDocument,
		position: Position,
	): Promise<CompletionList | null> {
		try {
			const completions = await this.service.doComplete(document, position, false);
			return completions ?? null;
		} catch (error) {
			return null;
		}
	}

	/**
	 * Get document symbols (outline).
	 */
	getDocumentSymbols(document: TextDocument): DocumentSymbol[] {
		try {
			// Use findDocumentSymbols2 for hierarchical symbols
			const symbols = this.service.findDocumentSymbols2(document);
			return symbols ?? [];
		} catch (error) {
			return [];
		}
	}

	/**
	 * Format a document.
	 */
	async format(
		document: TextDocument,
		options?: FormattingOptions,
	): Promise<TextEdit[]> {
		try {
			const edits = await this.service.doFormat(document, {
				singleQuote: false,
				bracketSpacing: true,
				proseWrap: "preserve",
				printWidth: options?.tabSize ? options.tabSize * 20 : 80,
			});
			return edits ?? [];
		} catch (error) {
			return [];
		}
	}

	/**
	 * Get the underlying language service for advanced usage.
	 */
	getLanguageService(): LanguageService {
		return this.service;
	}
}

/**
 * Singleton instance of the YAML service.
 */
let yamlServiceInstance: YAMLService | null = null;

/**
 * Get the shared YAML service instance.
 */
export function getYAMLService(): YAMLService {
	if (!yamlServiceInstance) {
		yamlServiceInstance = new YAMLService({
			hover: true,
			completion: true,
			format: true,
			validate: false, // We use Zod for OpenAPI validation
		});
	}
	return yamlServiceInstance;
}
