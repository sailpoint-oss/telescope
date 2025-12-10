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
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import type { AtomIndex, IRDocument } from "../../../engine/index.js";
import { DataVirtualCode } from "../../languages/virtualCodes/data-virtual-code.js";
import { OpenAPIVirtualCode } from "../../languages/virtualCodes/openapi-virtual-code.js";

/**
 * Result of resolving an OpenAPI document from a TextDocument.
 * Contains all commonly needed data for LSP operations.
 */
export interface ResolvedOpenAPIDocument {
	/** The source file URI (without embedded code suffix) */
	sourceUri: URI;
	/** The source URI as a string */
	sourceUriString: string;
	/** The OpenAPIVirtualCode instance */
	virtualCode: OpenAPIVirtualCode;
	/** The embedded code ID (usually "root" or "format") */
	embeddedCodeId: string;
}

/**
 * Result of resolving an OpenAPI document with IR data.
 * Extends ResolvedOpenAPIDocument with lazy-loaded IR and atoms.
 */
export interface ResolvedOpenAPIDocumentWithIR extends ResolvedOpenAPIDocument {
	/** Get the IR document (lazy-loaded) */
	getIR(): IRDocument;
	/** Get the atoms index (lazy-loaded) */
	getAtoms(): AtomIndex;
	/** Get the raw text content */
	getRawText(): string;
	/** Get cached line offsets */
	getLineOffsets(): number[];
}

/**
 * Resolve an OpenAPI document from a TextDocument.
 *
 * This consolidates the common pattern of:
 * 1. Parsing the document URI
 * 2. Decoding the embedded document URI
 * 3. Getting the VirtualCode
 *
 * @param context - Volar language service context
 * @param document - The TextDocument or document-like object with uri and languageId
 * @returns Resolved document data, or null if not an OpenAPI document
 *
 * @example
 * ```typescript
 * const resolved = resolveOpenAPIDocument(context, document);
 * if (!resolved) return [];
 *
 * const { sourceUri, sourceUriString, virtualCode } = resolved;
 * const ir = virtualCode.getIR(sourceUriString);
 * ```
 */
export function resolveOpenAPIDocument(
	context: LanguageServiceContext,
	document: { uri: string; languageId: string },
): ResolvedOpenAPIDocument | null {
	// Only process OpenAPI documents
	if (
		document.languageId !== "openapi-yaml" &&
		document.languageId !== "openapi-json"
	) {
		return null;
	}

	// Decode the embedded document URI
	const documentUri = URI.parse(document.uri);
	const decoded = context.decodeEmbeddedDocumentUri(documentUri);
	if (!decoded) {
		return null;
	}

	const [sourceUri, embeddedCodeId] = decoded;
	const sourceUriString = sourceUri.toString();

	// Get the VirtualCode
	const virtualCode = getOpenAPIVirtualCode(context, sourceUri);
	if (!virtualCode) {
		return null;
	}

	return {
		sourceUri,
		sourceUriString,
		virtualCode,
		embeddedCodeId,
	};
}

/**
 * Resolve an OpenAPI document with convenient accessors for IR, atoms, and text.
 *
 * This is an extended version of resolveOpenAPIDocument that provides
 * lazy-loaded accessors for commonly needed data.
 *
 * @param context - Volar language service context
 * @param document - The TextDocument or document-like object with uri and languageId
 * @returns Resolved document data with accessors, or null if not an OpenAPI document
 *
 * @example
 * ```typescript
 * const resolved = resolveOpenAPIDocumentWithIR(context, document);
 * if (!resolved) return [];
 *
 * const ir = resolved.getIR();
 * const atoms = resolved.getAtoms();
 * const lineOffsets = resolved.getLineOffsets();
 * ```
 */
export function resolveOpenAPIDocumentWithIR(
	context: LanguageServiceContext,
	document: { uri: string; languageId: string },
): ResolvedOpenAPIDocumentWithIR | null {
	const resolved = resolveOpenAPIDocument(context, document);
	if (!resolved) {
		return null;
	}

	const { sourceUri, sourceUriString, virtualCode, embeddedCodeId } = resolved;

	return {
		sourceUri,
		sourceUriString,
		virtualCode,
		embeddedCodeId,
		getIR: () => virtualCode.getIR(sourceUriString),
		getAtoms: () => virtualCode.getAtoms(sourceUriString),
		getRawText: () => virtualCode.getRawText(),
		getLineOffsets: () => virtualCode.getLineOffsets(),
	};
}

/**
 * Resolve a generic data document (YAML or JSON) from a TextDocument.
 *
 * @param context - Volar language service context
 * @param document - The TextDocument or document-like object with uri and languageId
 * @returns Resolved document data, or null if not found
 */
export function resolveDataDocument(
	context: LanguageServiceContext,
	document: { uri: string; languageId: string },
): { sourceUri: URI; sourceUriString: string; virtualCode: DataVirtualCode; embeddedCodeId: string } | null {
	// Decode the embedded document URI
	const documentUri = URI.parse(document.uri);
	const decoded = context.decodeEmbeddedDocumentUri(documentUri);
	if (!decoded) {
		return null;
	}

	const [sourceUri, embeddedCodeId] = decoded;
	const sourceUriString = sourceUri.toString();

	// Get the VirtualCode
	const virtualCode = getDataVirtualCode(context, sourceUri);
	if (!virtualCode) {
		return null;
	}

	return {
		sourceUri,
		sourceUriString,
		virtualCode,
		embeddedCodeId,
	};
}

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

