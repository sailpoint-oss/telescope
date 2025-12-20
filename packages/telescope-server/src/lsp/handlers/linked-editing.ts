/**
 * Linked Editing Handler
 *
 * Implements textDocument/linkedEditingRange for OpenAPI path parameters:
 * editing `{id}` in `/users/{id}` links to matching `parameters[].name` entries.
 *
 * @module lsp/handlers/linked-editing
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { LinkedEditingRanges, Range } from "vscode-languageserver-protocol";

import type { CachedDocument, DocumentCache } from "../document-cache.js";
import type { TelescopeContext } from "../context.js";
import { isOpenAPIDocument } from "./shared.js";

export function registerLinkedEditingHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
): void {
	const logger = ctx.getLogger("LinkedEditing");

	// Defensive: some runtimes may not expose this API surface.
	// If we register unconditionally, the server can crash at startup.
	const c = connection as unknown as {
		languages?: { linkedEditingRange?: { on?: unknown } };
	};
	if (typeof c.languages?.linkedEditingRange?.on !== "function") {
		logger.log("Linked editing not supported by runtime; feature disabled.");
		return;
	}

	connection.languages.linkedEditingRange.on((params): LinkedEditingRanges | null => {
		try {
			const doc = documents.get(params.textDocument.uri);
			if (!doc) return null;

			const cached = cache.get(doc);
			if (!isOpenAPIDocument(cached)) return null;

			return provideLinkedEditingRanges(cached, params.position, cache);
		} catch (error) {
			logger.error(
				`linkedEditingRange failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return null;
		}
	});
}

function provideLinkedEditingRanges(
	cached: CachedDocument,
	position: { line: number; character: number },
	cache: DocumentCache,
): LinkedEditingRanges | null {
	const ast = cached.parsedObject as Record<string, unknown>;
	const paths = ast?.paths as Record<string, unknown> | undefined;
	if (!paths) return null;

	// Find which path key we're on by checking key ranges.
	let matchedPathKey: string | null = null;
	let matchedKeyRange: Range | null = null;

	for (const pathKey of Object.keys(paths)) {
		const kr = cache.getKeyRange(cached, ["paths", pathKey]);
		if (!kr) continue;
		if (kr.start.line !== kr.end.line) continue;

		if (
			position.line === kr.start.line &&
			position.character >= kr.start.character &&
			position.character <= kr.end.character
		) {
			matchedPathKey = pathKey;
			matchedKeyRange = kr;
			break;
		}
	}

	if (!matchedPathKey || !matchedKeyRange) return null;

	// Extract the exact key token text from the line and find the {param} under cursor.
	const lineText = cached.content.split("\n")[matchedKeyRange.start.line] ?? "";
	const tokenText = lineText.slice(
		matchedKeyRange.start.character,
		matchedKeyRange.end.character,
	);

	const re = /\{([^}]+)\}/g;
	let m: RegExpExecArray | null = re.exec(tokenText);
	let paramName: string | null = null;
	let paramNameRange: Range | null = null;
	while (m) {
		const full = m[0];
		const name = m[1] ?? "";
		const startChar = matchedKeyRange.start.character + m.index;
		const endChar = startChar + full.length;
		if (
			position.character >= startChar &&
			position.character <= endChar &&
			name.length > 0
		) {
			paramName = name;
			paramNameRange = {
				start: { line: matchedKeyRange.start.line, character: startChar + 1 },
				end: { line: matchedKeyRange.start.line, character: startChar + 1 + name.length },
			};
			break;
		}
		m = re.exec(tokenText);
	}

	if (!paramName || !paramNameRange) return null;

	const ranges: Range[] = [paramNameRange];

	// Collect matching parameter.name ranges in the relevant Path Item + Operations.
	const pathItem = paths[matchedPathKey] as Record<string, unknown> | undefined;
	if (!pathItem || typeof pathItem !== "object") {
		return { ranges };
	}

	addMatchingParamNameRanges(
		cached,
		cache,
		["paths", matchedPathKey],
		pathItem,
		paramName,
		ranges,
	);

	return { ranges };
}

function addMatchingParamNameRanges(
	cached: CachedDocument,
	cache: DocumentCache,
	basePath: (string | number)[],
	pathItem: Record<string, unknown>,
	paramName: string,
	ranges: Range[],
): void {
	const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

	// Path-item level parameters
	const piParams = pathItem.parameters as Array<Record<string, unknown>> | undefined;
	if (Array.isArray(piParams)) {
		for (let i = 0; i < piParams.length; i++) {
			const p = piParams[i];
			if (!p || typeof p !== "object") continue;
			if (typeof (p as any).$ref === "string") continue;
			if ((p as any).in !== "path") continue;
			if ((p as any).name !== paramName) continue;
			const r = cache.getRange(cached, [...basePath, "parameters", i, "name"]);
			if (r) ranges.push(r);
		}
	}

	// Operation level parameters
	for (const method of methods) {
		const op = pathItem[method] as Record<string, unknown> | undefined;
		if (!op || typeof op !== "object") continue;

		const opParams = op.parameters as Array<Record<string, unknown>> | undefined;
		if (!Array.isArray(opParams)) continue;
		for (let i = 0; i < opParams.length; i++) {
			const p = opParams[i];
			if (!p || typeof p !== "object") continue;
			if (typeof (p as any).$ref === "string") continue;
			if ((p as any).in !== "path") continue;
			if ((p as any).name !== paramName) continue;
			const r = cache.getRange(cached, [...basePath, method, "parameters", i, "name"]);
			if (r) ranges.push(r);
		}
	}
}


