/**
 * Inlay Hints Handler
 *
 * Provides inlay hints for OpenAPI documents (type hints for $refs, required markers).
 *
 * @module lsp/handlers/inlay-hints
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type {
	InlayHint,
	InlayHintKind,
	Range,
} from "vscode-languageserver-protocol";
import type { TextDocument } from "vscode-languageserver-textdocument";
import * as yaml from "yaml";
import { identifyDocumentType } from "../../engine/utils/document-type-utils.js";
import { parseJsonPointer } from "../../engine/utils/pointer-utils.js";
import type { CachedDocument, DocumentCache } from "../document-cache.js";
import {
	findAllRefNodes,
	getValueAtPath,
	isOpenAPIDocument,
	resolveRefTarget,
} from "./shared.js";

/**
 * Register inlay hint handlers on the connection.
 */
export function registerInlayHintHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
): void {
	connection.languages.inlayHint.on((params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return [];

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return [];

		return provideInlayHints(cached, params.range, cache);
	});
}

/**
 * Provide inlay hints for a document.
 */
function provideInlayHints(
	cached: CachedDocument,
	range: Range,
	cache: DocumentCache,
): InlayHint[] {
	const hints: InlayHint[] = [];

	// Add type hints for $refs
	const refs = findAllRefNodes(cached.ir.root);
	for (const { node, ref } of refs) {
		if (!node.loc) continue;

		const nodeRange = cache.locToRange(cached, node.loc);
		if (!nodeRange) continue;

		// Check if in range
		if (
			nodeRange.end.line < range.start.line ||
			nodeRange.start.line > range.end.line
		) {
			continue;
		}

		// Get the type hint
		const typeHint = getRefTypeHint(ref, cached, cache);
		if (typeHint) {
			hints.push({
				position: nodeRange.end,
				label: ` → ${typeHint}`,
				kind: 1 as InlayHintKind, // Type
				paddingLeft: true,
			});
		}
	}

	return hints;
}

/**
 * Get the type hint for a $ref.
 */
function getRefTypeHint(
	ref: string,
	cached: CachedDocument,
	cache: DocumentCache,
): string | null {
	// Skip external URLs
	if (/^https?:/i.test(ref)) {
		return "external";
	}

	const { targetUri, pointer } = resolveRefTarget(cached.uri, ref);

	// Get target document
	const targetDoc =
		targetUri === cached.uri ? cached : cache.getByUri(targetUri);
	if (!targetDoc) return null;

	// Get the value at the pointer
	const path = parseJsonPointer(pointer);
	let value: unknown;

	if (targetDoc.format === "yaml" && targetDoc.ast instanceof yaml.Document) {
		const node = targetDoc.ast.getIn(path, true);
		if (node && typeof node === "object" && "toJSON" in node) {
			value = (node as yaml.Node).toJSON();
		} else {
			value = node;
		}
	} else {
		value = getValueAtPath(targetDoc.parsedObject, path);
	}

	if (!value || typeof value !== "object") return null;

	return formatReferencedType(value as Record<string, unknown>);
}

function formatReferencedType(obj: Record<string, unknown>): string | null {
	const docType = identifyDocumentType(obj);

	// Parameter
	if (docType === "parameter") {
		const loc = typeof obj.in === "string" ? obj.in : undefined;
		const name = typeof obj.name === "string" ? obj.name : undefined;
		if (loc && name) return `parameter (${loc}) ${name}`;
		if (loc) return `parameter (${loc})`;
		return "parameter";
	}

	// Response / request body / others
	if (docType !== "schema" && docType !== "unknown") {
		return docType.replace(/-/g, " ");
	}

	// Schema detail
	const schemaType = typeof obj.type === "string" ? obj.type : undefined;

	if (schemaType === "array") {
		const items = obj.items;
		const itemType =
			items && typeof items === "object"
				? typeof (items as Record<string, unknown>).type === "string"
					? String((items as Record<string, unknown>).type)
					: identifyDocumentType(items)
				: undefined;
		return itemType ? `array<${itemType}>` : "array";
	}

	if (schemaType) {
		// object, string, integer, number, boolean, null
		if (schemaType === "object") {
			const props = obj.properties;
			const count =
				props && typeof props === "object"
					? Object.keys(props as object).length
					: 0;
			return count > 0 ? `object (${count} props)` : "object";
		}
		return schemaType;
	}

	if (obj.allOf) return "schema: allOf";
	if (obj.anyOf) return "schema: anyOf";
	if (obj.oneOf) return "schema: oneOf";
	if (obj.properties) return "object";
	if (obj.$ref) return "ref";

	return docType === "schema" ? "schema" : null;
}

// ---------------------------------------------------------------------------
// Test-only exports (keep logic testable without standing up an LSP client)
// ---------------------------------------------------------------------------

export function __testFormatReferencedType(
	obj: Record<string, unknown>,
): string | null {
	return formatReferencedType(obj);
}
