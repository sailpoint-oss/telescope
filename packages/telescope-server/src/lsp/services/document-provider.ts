import type { TextDocuments } from "vscode-languageserver";
import type { Position, Range } from "vscode-languageserver-protocol";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { IRDocument, IRNode, Loc, ParsedDocument } from "../../engine/index.js";
import { findNodeByPointer } from "../../engine/index.js";
import {
	buildLineOffsets,
	getLineCol,
} from "../../engine/utils/line-offset-utils.js";
import type { CachedDocument, DocumentCache } from "../document-cache.js";
import type { WorkspaceProject } from "../workspace/workspace-project.js";

export type ProvidedDocument =
	| { kind: "open"; uri: string; cached: CachedDocument }
	| { kind: "fs"; uri: string; parsed: ParsedDocument };

export interface DocumentProvider {
	/**
	 * Get a document by URI. Prefers open documents, otherwise loads from filesystem.
	 */
	get(uri: string): Promise<ProvidedDocument | null>;
	/**
	 * Return the document's full text content.
	 */
	getText(doc: ProvidedDocument): string;
	/**
	 * Return the IR document (for traversal).
	 */
	getIR(doc: ProvidedDocument): IRDocument;
	/**
	 * Convert an LSP Position to a byte offset in the document text.
	 */
	positionToOffset(doc: ProvidedDocument, pos: Position): number;
	/**
	 * Convert a Loc (byte offsets) to an LSP Range.
	 */
	locToRange(doc: ProvidedDocument, loc: Loc): Range | null;
	/**
	 * Convert a JSON pointer (with or without leading '#'; may be '/...') to a Range.
	 */
	pointerToRange(doc: ProvidedDocument, pointer: string): Range | null;
	/**
	 * Find an IR node by pointer (accepts pointers like '/components/...' or '#/...').
	 */
	findNode(doc: ProvidedDocument, pointer: string): IRNode | null;
}

export function createDocumentProvider(args: {
	documents: TextDocuments<TextDocument>;
	cache: DocumentCache;
	project: WorkspaceProject;
}): DocumentProvider {
	return new DefaultDocumentProvider(args.documents, args.cache, args.project);
}

class DefaultDocumentProvider implements DocumentProvider {
	constructor(
		private readonly documents: TextDocuments<TextDocument>,
		private readonly cache: DocumentCache,
		private readonly project: WorkspaceProject,
	) {}

	async get(uri: string): Promise<ProvidedDocument | null> {
		const open = this.documents.get(uri);
		if (open) {
			const cached = this.cache.get(open);
			return { kind: "open", uri: cached.uri, cached };
		}

		const parsed = await this.project
			.getDocumentTypeCache()
			.getDocument(uri, this.project.getFileSystem());
		if (!parsed) return null;
		return { kind: "fs", uri: parsed.uri, parsed };
	}

	getText(doc: ProvidedDocument): string {
		return doc.kind === "open" ? doc.cached.content : doc.parsed.rawText;
	}

	getIR(doc: ProvidedDocument): IRDocument {
		return doc.kind === "open" ? doc.cached.ir : doc.parsed.ir;
	}

	positionToOffset(doc: ProvidedDocument, pos: Position): number {
		if (doc.kind === "open") {
			return this.cache.positionToOffset(doc.cached, pos);
		}

		const offsets = getOrBuildLineOffsets(doc.parsed);
		const lineOffset = offsets[pos.line] ?? 0;
		return lineOffset + pos.character;
	}

	locToRange(doc: ProvidedDocument, loc: Loc): Range | null {
		if (!loc) return null;
		if (doc.kind === "open") {
			return this.cache.locToRange(doc.cached, loc);
		}

		const offsets = getOrBuildLineOffsets(doc.parsed);
		const start = getLineCol(loc.start ?? 0, offsets);
		const end = getLineCol(loc.end ?? loc.start ?? 0, offsets);
		if (!start || !end) return null;
		return {
			start: { line: start.line - 1, character: start.col - 1 },
			end: { line: end.line - 1, character: end.col - 1 },
		};
	}

	pointerToRange(doc: ProvidedDocument, pointer: string): Range | null {
		const normalized = normalizePointer(pointer);
		if (doc.kind === "open") {
			const node = findNodeByPointer(doc.cached.ir, normalized);
			if (!node?.loc) return null;
			return this.cache.locToRange(doc.cached, node.loc);
		}
		return doc.parsed.sourceMap.pointerToRange(normalized);
	}

	findNode(doc: ProvidedDocument, pointer: string): IRNode | null {
		const normalized = normalizePointer(pointer);
		return findNodeByPointer(this.getIR(doc), normalized);
	}
}

function normalizePointer(pointer: string): string {
	// Engine pointer utilities support:
	// - "#/a/b"
	// - "a/b"
	// - "#"
	// They do NOT handle leading "/a/b" directly (would introduce an empty segment).
	if (!pointer || pointer === "#") return "#";
	if (pointer.startsWith("/")) return `#${pointer}`;
	return pointer;
}

function getOrBuildLineOffsets(doc: ParsedDocument): number[] {
	if (doc._lineOffsets && Array.isArray(doc._lineOffsets)) {
		return doc._lineOffsets;
	}
	const offsets = buildLineOffsets(doc.rawText);
	doc._lineOffsets = offsets;
	return offsets;
}


