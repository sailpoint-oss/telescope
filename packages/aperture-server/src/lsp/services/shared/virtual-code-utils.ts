/**
 * Shared Virtual Code Utilities
 *
 * This module provides common utility functions for working with VirtualCode
 * instances across LSP services. These functions are used by multiple services
 * and are consolidated here to avoid duplication.
 *
 * @module lsp/services/shared/virtual-code-utils
 */

import type { LanguageServiceContext, DocumentSelector } from "@volar/language-service";
import type { URI } from "vscode-uri";
import { DataVirtualCode } from "../../languages/virtualCodes/data-virtual-code.js";
import { OpenAPIVirtualCode } from "../../languages/virtualCodes/openapi-virtual-code.js";

/**
 * Get the OpenAPIVirtualCode for a URI from the language service context.
 *
 * @param context - Volar language service context
 * @param uri - Document URI (as a URI object to ensure correct Map lookup)
 * @returns OpenAPIVirtualCode if found and is OpenAPI, undefined otherwise
 */
export function getOpenAPIVirtualCode(
	context: LanguageServiceContext | undefined,
	uri: URI,
): OpenAPIVirtualCode | undefined {
	if (!context) return undefined;

	const sourceScript = context.language.scripts.get(uri);
	const virtualCode = sourceScript?.generated?.root;

	if (virtualCode instanceof OpenAPIVirtualCode) {
		return virtualCode;
	}

	return undefined;
}

/**
 * Get a DataVirtualCode (including OpenAPIVirtualCode) for a URI.
 *
 * @param context - Volar language service context
 * @param uri - Document URI (as a URI object to ensure correct Map lookup)
 * @returns DataVirtualCode or OpenAPIVirtualCode if found, undefined otherwise
 */
export function getDataVirtualCode(
	context: LanguageServiceContext | undefined,
	uri: URI,
): DataVirtualCode | undefined {
	if (!context) return undefined;

	const sourceScript = context.language.scripts.get(uri);
	const virtualCode = sourceScript?.generated?.root;

	if (
		virtualCode instanceof DataVirtualCode ||
		virtualCode instanceof OpenAPIVirtualCode
	) {
		return virtualCode;
	}

	return undefined;
}

/**
 * Check if a document matches a document selector.
 *
 * @param selector - The document selector (array of language IDs or selector objects)
 * @param document - The document to check (must have languageId property)
 * @returns true if the document matches the selector
 */
export function matchDocument(
	selector: DocumentSelector,
	document: { languageId: string },
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

