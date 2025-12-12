/**
 * Document Links Handler
 *
 * Provides clickable links for $ref values in OpenAPI documents.
 *
 * @module lsp/handlers/document-links
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { DocumentLink } from "vscode-languageserver-protocol";

import type { DocumentCache, CachedDocument } from "../document-cache.js";
import type { TelescopeContext } from "../context.js";
import {
	isOpenAPIDocument,
	findAllRefNodes,
	resolveRefTarget,
	findNodeAtPointer,
} from "./shared.js";

/**
 * Register document link handlers on the connection.
 */
export function registerDocumentLinkHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
): void {
	// Provide document links
	connection.onDocumentLinks((params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return [];

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return [];

		return provideDocumentLinks(cached, cache, ctx);
	});

	// Resolve document links
	connection.onDocumentLinkResolve(async (link) => {
		return resolveDocumentLink(link, cache, ctx);
	});
}

interface LinkData {
	fragment?: string;
	sourceUri?: string;
}

/**
 * Provide document links for $ref values.
 */
function provideDocumentLinks(
	cached: CachedDocument,
	cache: DocumentCache,
	ctx: TelescopeContext,
): DocumentLink[] {
	const links: DocumentLink[] = [];
	const refs = findAllRefNodes(cached.ir.root);

	for (const { node, ref } of refs) {
		if (!node.loc) continue;

		const range = cache.locToRange(cached, node.loc);
		if (!range) continue;

		// Determine target
		let target: string;
		let fragment: string | undefined;
		let isSameDocument = false;

		if (/^https?:/i.test(ref)) {
			// External URL - use as-is
			target = ref;
		} else if (ref.startsWith("#")) {
			// Same-document reference
			target = cached.uri;
			fragment = ref.substring(1);
			isSameDocument = true;
		} else {
			// Relative file path
			const { targetUri, pointer } = resolveRefTarget(cached.uri, ref);
			target = targetUri;
			fragment = pointer || undefined;
		}

		const data: LinkData = {};
		if (fragment) {
			data.fragment = fragment;
			if (isSameDocument) {
				data.sourceUri = cached.uri;
			}
		}

		links.push({
			range,
			target,
			data: Object.keys(data).length > 0 ? data : undefined,
		});
	}

	return links;
}

/**
 * Resolve a document link to add precise positioning.
 */
async function resolveDocumentLink(
	link: DocumentLink,
	cache: DocumentCache,
	ctx: TelescopeContext,
): Promise<DocumentLink> {
	const data = link.data as LinkData | undefined;
	if (!data?.fragment || !link.target) {
		return link;
	}

	const fragment = data.fragment;
	const targetUriString = data.sourceUri ?? link.target;

	// Try to find position in target document
	const targetDoc = cache.getByUri(targetUriString);
	if (!targetDoc) {
		// Fallback: return link with JSON pointer fragment
		return {
			...link,
			target: `${link.target}#${fragment}`,
		};
	}

	// Find the node at the pointer
	const node = findNodeAtPointer(targetDoc.ir.root, fragment);
	if (node?.loc) {
		const range = cache.locToRange(targetDoc, node.loc);
		if (range) {
			// Use VSCode's #L{line},{column} format (1-based)
			return {
				...link,
				target: `${link.target}#L${range.start.line + 1},${range.start.character + 1}`,
			};
		}
	}

	// Fallback: return link with JSON pointer fragment
	return {
		...link,
		target: `${link.target}#${fragment}`,
	};
}

