/**
 * Completions Handler
 *
 * Provides completions for OpenAPI documents by combining:
 * 1. YAML language service completions (base YAML structure)
 * 2. OpenAPI-specific completions ($ref, status codes, media types, etc.)
 *
 * @module lsp/handlers/completions
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type {
	CompletionItem,
	CompletionItemKind,
	CompletionList,
	Position,
} from "vscode-languageserver-protocol";

import type { DocumentCache, CachedDocument } from "../document-cache.js";
import type { TelescopeContext } from "../context.js";
import { getYAMLService } from "../services/yaml-service.js";
import { isOpenAPIDocument } from "./shared.js";

/**
 * Register completion handlers on the connection.
 */
export function registerCompletionHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
): void {
	const logger = ctx.getLogger("Completions");
	const yamlService = getYAMLService();

	connection.onCompletion(async (params): Promise<CompletionList | null> => {
		try {
			const doc = documents.get(params.textDocument.uri);
			if (!doc) return null;

			// 1. Get YAML service completions (base)
			const yamlCompletions = await yamlService.getCompletions(doc, params.position);

			// 2. Get OpenAPI-specific completions
			const cached = cache.get(doc);
			const openapiItems = isOpenAPIDocument(cached)
				? provideOpenAPICompletions(cached, params.position, cache, ctx)
				: [];

			// 3. Merge results - OpenAPI completions added to YAML completions
			return mergeCompletions(yamlCompletions, openapiItems);
		} catch (error) {
			logger.error(
				`Completions failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return null;
		}
	});
}

/**
 * Merge YAML and OpenAPI completion results.
 * OpenAPI completions are prepended (higher priority).
 */
function mergeCompletions(
	yamlCompletions: CompletionList | null,
	openapiItems: CompletionItem[],
): CompletionList | null {
	const yamlItems = yamlCompletions?.items ?? [];

	// If we have OpenAPI items, they take priority
	if (openapiItems.length > 0) {
		// Mark OpenAPI items with higher sort priority
		const prioritizedOpenAPI = openapiItems.map((item, index) => ({
			...item,
			sortText: `0_${index.toString().padStart(3, "0")}_${item.label}`,
		}));

		// Mark YAML items with lower priority
		const deprioritizedYAML = yamlItems.map((item, index) => ({
			...item,
			sortText: `1_${index.toString().padStart(3, "0")}_${item.label}`,
		}));

		return {
			isIncomplete: yamlCompletions?.isIncomplete ?? false,
			items: [...prioritizedOpenAPI, ...deprioritizedYAML],
		};
	}

	// Just return YAML completions if no OpenAPI items
	if (yamlItems.length > 0) {
		return yamlCompletions;
	}

	return null;
}

/**
 * Provide OpenAPI-specific completions at a position.
 */
function provideOpenAPICompletions(
	cached: CachedDocument,
	position: Position,
	cache: DocumentCache,
	ctx: TelescopeContext,
): CompletionItem[] {
	const items: CompletionItem[] = [];
	const text = cached.content;
	const offset = cache.positionToOffset(cached, position);

	// Get the line content up to cursor
	const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
	const lineContent = text.substring(lineStart, offset);

	// Check what context we're in
	if (isInRefContext(lineContent, text, offset)) {
		items.push(...getRefCompletions(cached, cache, ctx));
	} else if (isInStatusCodeContext(lineContent)) {
		items.push(...getStatusCodeCompletions());
	} else if (isInMediaTypeContext(lineContent)) {
		items.push(...getMediaTypeCompletions());
	} else if (isInSecurityContext(lineContent, cached)) {
		items.push(...getSecurityCompletions(cached));
	} else if (isInTagContext(lineContent, cached)) {
		items.push(...getTagCompletions(cached));
	}

	return items;
}

/**
 * Check if cursor is in a $ref value context.
 */
function isInRefContext(lineContent: string, text: string, offset: number): boolean {
	// Look for $ref: " or "$ref": "
	const refPattern = /\$ref\s*:\s*["']?#?$/i;
	if (refPattern.test(lineContent)) return true;

	// Check if we're inside a $ref value
	const beforeCursor = text.substring(Math.max(0, offset - 50), offset);
	return beforeCursor.includes('$ref') && (beforeCursor.includes('"') || beforeCursor.includes("'"));
}

/**
 * Check if cursor is in a status code context (responses).
 */
function isInStatusCodeContext(lineContent: string): boolean {
	// After "responses:" with proper indentation
	const trimmed = lineContent.trim();
	return trimmed === "" && /responses:\s*$/.test(lineContent);
}

/**
 * Check if cursor is in a media type context (content).
 */
function isInMediaTypeContext(lineContent: string): boolean {
	const trimmed = lineContent.trim();
	return trimmed === "" && /content:\s*$/.test(lineContent);
}

/**
 * Check if cursor is in a security context.
 */
function isInSecurityContext(lineContent: string, cached: CachedDocument): boolean {
	return /security:\s*$/.test(lineContent) || /^\s*-\s*$/.test(lineContent);
}

/**
 * Check if cursor is in a tags context.
 */
function isInTagContext(lineContent: string, cached: CachedDocument): boolean {
	return /tags:\s*$/.test(lineContent);
}

/**
 * Get $ref completions.
 */
function getRefCompletions(
	cached: CachedDocument,
	cache: DocumentCache,
	ctx: TelescopeContext,
): CompletionItem[] {
	const items: CompletionItem[] = [];

	// Get components from this document
	const ast = cached.parsedObject as Record<string, unknown>;
	const components = ast?.components as Record<string, unknown> | undefined;

	if (components) {
		// Add schema refs
		const schemas = components.schemas as Record<string, unknown> | undefined;
		if (schemas) {
			for (const name of Object.keys(schemas)) {
				items.push({
					label: `#/components/schemas/${name}`,
					kind: 12 as CompletionItemKind, // Value
					detail: "Schema reference",
					insertText: `#/components/schemas/${name}`,
				});
			}
		}

		// Add parameter refs
		const parameters = components.parameters as Record<string, unknown> | undefined;
		if (parameters) {
			for (const name of Object.keys(parameters)) {
				items.push({
					label: `#/components/parameters/${name}`,
					kind: 12 as CompletionItemKind,
					detail: "Parameter reference",
					insertText: `#/components/parameters/${name}`,
				});
			}
		}

		// Add response refs
		const responses = components.responses as Record<string, unknown> | undefined;
		if (responses) {
			for (const name of Object.keys(responses)) {
				items.push({
					label: `#/components/responses/${name}`,
					kind: 12 as CompletionItemKind,
					detail: "Response reference",
					insertText: `#/components/responses/${name}`,
				});
			}
		}

		// Add requestBody refs
		const requestBodies = components.requestBodies as Record<string, unknown> | undefined;
		if (requestBodies) {
			for (const name of Object.keys(requestBodies)) {
				items.push({
					label: `#/components/requestBodies/${name}`,
					kind: 12 as CompletionItemKind,
					detail: "Request body reference",
					insertText: `#/components/requestBodies/${name}`,
				});
			}
		}
	}

	return items;
}

/**
 * Get HTTP status code completions.
 */
function getStatusCodeCompletions(): CompletionItem[] {
	const codes = [
		{ code: "200", desc: "OK" },
		{ code: "201", desc: "Created" },
		{ code: "204", desc: "No Content" },
		{ code: "301", desc: "Moved Permanently" },
		{ code: "302", desc: "Found" },
		{ code: "304", desc: "Not Modified" },
		{ code: "400", desc: "Bad Request" },
		{ code: "401", desc: "Unauthorized" },
		{ code: "403", desc: "Forbidden" },
		{ code: "404", desc: "Not Found" },
		{ code: "405", desc: "Method Not Allowed" },
		{ code: "409", desc: "Conflict" },
		{ code: "422", desc: "Unprocessable Entity" },
		{ code: "429", desc: "Too Many Requests" },
		{ code: "500", desc: "Internal Server Error" },
		{ code: "502", desc: "Bad Gateway" },
		{ code: "503", desc: "Service Unavailable" },
		{ code: "default", desc: "Default response" },
	];

	return codes.map(({ code, desc }) => ({
		label: code,
		kind: 13 as CompletionItemKind, // EnumMember
		detail: desc,
		insertText: `${code}:`,
	}));
}

/**
 * Get media type completions.
 */
function getMediaTypeCompletions(): CompletionItem[] {
	const types = [
		"application/json",
		"application/xml",
		"application/x-www-form-urlencoded",
		"multipart/form-data",
		"text/plain",
		"text/html",
		"application/octet-stream",
		"application/pdf",
		"image/png",
		"image/jpeg",
		"*/*",
	];

	return types.map((type) => ({
		label: type,
		kind: 12 as CompletionItemKind, // Value
		detail: "Media type",
		insertText: `${type}:`,
	}));
}

/**
 * Get security scheme completions.
 */
function getSecurityCompletions(cached: CachedDocument): CompletionItem[] {
	const items: CompletionItem[] = [];
	const ast = cached.parsedObject as Record<string, unknown>;
	const components = ast?.components as Record<string, unknown> | undefined;
	const securitySchemes = components?.securitySchemes as Record<string, unknown> | undefined;

	if (securitySchemes) {
		for (const name of Object.keys(securitySchemes)) {
			items.push({
				label: name,
				kind: 12 as CompletionItemKind,
				detail: "Security scheme",
				insertText: `${name}: []`,
			});
		}
	}

	return items;
}

/**
 * Get tag completions.
 */
function getTagCompletions(cached: CachedDocument): CompletionItem[] {
	const items: CompletionItem[] = [];
	const ast = cached.parsedObject as Record<string, unknown>;
	const tags = ast?.tags as Array<{ name: string; description?: string }> | undefined;

	if (tags) {
		for (const tag of tags) {
			items.push({
				label: tag.name,
				kind: 12 as CompletionItemKind,
				detail: tag.description || "Tag",
				insertText: `- ${tag.name}`,
			});
		}
	}

	return items;
}
