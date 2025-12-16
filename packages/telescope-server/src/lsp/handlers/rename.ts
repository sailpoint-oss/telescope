/**
 * Rename Handler
 *
 * Provides rename functionality for OpenAPI documents.
 *
 * @module lsp/handlers/rename
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type {
	PrepareRenameParams,
	RenameParams,
	Range,
	WorkspaceEdit,
	TextEdit,
} from "vscode-languageserver-protocol";

import type { DocumentCache, CachedDocument } from "../document-cache.js";
import type { TelescopeContext } from "../context.js";
import { createDocumentProvider } from "../services/document-provider.js";
import type { ProvidedDocument } from "../services/document-provider.js";
import type { WorkspaceProject } from "../workspace/workspace-project.js";
import {
	isOpenAPIDocument,
	findAllRefNodes,
	resolveRefTarget,
} from "./shared.js";
import { joinPointer } from "../../engine/utils/pointer-utils.js";

/**
 * Register rename handlers on the connection.
 */
export function registerRenameHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
	getProject: () => WorkspaceProject,
): void {
	// Prepare rename
	connection.onPrepareRename((params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return null;

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return null;

		return prepareRename(cached, params.position, cache, ctx);
	});

	// Execute rename
	connection.onRenameRequest(async (params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return null;

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return null;

		const provider = createDocumentProvider({
			documents,
			cache,
			project: getProject(),
		});
		return await executeRename(cached, params, cache, ctx, provider);
	});
}

/**
 * Prepare rename at a position.
 */
function prepareRename(
	cached: CachedDocument,
	position: { line: number; character: number },
	cache: DocumentCache,
	ctx: TelescopeContext,
): Range | { range: Range; placeholder: string } | null {
	const offset = cache.positionToOffset(cached, position);

	// Check if on a component definition
	const componentInfo = findComponentAtOffset(cached, offset, cache);
	if (componentInfo) {
		return {
			range: componentInfo.range,
			placeholder: componentInfo.name,
		};
	}

	// Check if on an operationId
	const opIdInfo = findOperationIdAtOffset(cached, offset, cache);
	if (opIdInfo) {
		return {
			range: opIdInfo.range,
			placeholder: opIdInfo.name,
		};
	}

	// Check if on a tag name (root tags[] or operation tags[])
	const tagInfo = findTagNameAtOffset(cached, offset, cache);
	if (tagInfo) {
		return { range: tagInfo.range, placeholder: tagInfo.name };
	}

	return null;
}

/**
 * Execute rename operation.
 */
async function executeRename(
	cached: CachedDocument,
	params: RenameParams,
	cache: DocumentCache,
	ctx: TelescopeContext,
	provider: ReturnType<typeof createDocumentProvider>,
): Promise<WorkspaceEdit | null> {
	const offset = cache.positionToOffset(cached, params.position);
	const newName = params.newName;

	// Check if renaming a component
	const componentInfo = findComponentAtOffset(cached, offset, cache);
	if (componentInfo) {
		return await renameComponent(componentInfo, newName, cached, cache, ctx, provider);
	}

	// Check if renaming an operationId
	const opIdInfo = findOperationIdAtOffset(cached, offset, cache);
	if (opIdInfo) {
		return await renameOperationId(opIdInfo, newName, cached, cache, ctx, provider);
	}

	// Check if renaming a tag
	const tagInfo = findTagNameAtOffset(cached, offset, cache);
	if (tagInfo) {
		return await renameTag(tagInfo, newName, ctx, provider);
	}

	return null;
}

interface ComponentInfo {
	type: string; // "schemas", "parameters", etc.
	name: string;
	pointer: string;
	range: Range;
}

interface OperationIdInfo {
	name: string;
	range: Range;
	path: string;
	method: string;
}

interface TagNameInfo {
	name: string;
	range: Range;
}

/**
 * Find a component definition at the given offset.
 */
function findComponentAtOffset(
	cached: CachedDocument,
	offset: number,
	cache: DocumentCache,
): ComponentInfo | null {
	const ast = cached.parsedObject as Record<string, unknown>;
	const components = ast?.components as Record<string, unknown> | undefined;
	if (!components) return null;

	const componentTypes = [
		"schemas",
		"parameters",
		"responses",
		"requestBodies",
		"headers",
		"securitySchemes",
		"links",
		"callbacks",
	];

	for (const type of componentTypes) {
		const section = components[type] as Record<string, unknown> | undefined;
		if (!section) continue;

		for (const name of Object.keys(section)) {
			const range = cache.getRange(cached, ["components", type, name]);
			if (!range) continue;

			// Check if offset is within the name range (first line of the component)
			const startOffset = cache.positionToOffset(cached, range.start);
			const lineEndOffset = cached.content.indexOf("\n", startOffset);
			const effectiveEndOffset =
				lineEndOffset === -1 ? cached.content.length : lineEndOffset;

			if (offset >= startOffset && offset <= effectiveEndOffset) {
				return {
					type,
					name,
					pointer: `/components/${type}/${name}`,
					range: {
						start: range.start,
						end: {
							line: range.start.line,
							character: range.start.character + name.length,
						},
					},
				};
			}
		}
	}

	return null;
}

/**
 * Find an operationId at the given offset.
 */
function findOperationIdAtOffset(
	cached: CachedDocument,
	offset: number,
	cache: DocumentCache,
): OperationIdInfo | null {
	const ast = cached.parsedObject as Record<string, unknown>;
	const paths = ast?.paths as Record<string, unknown> | undefined;
	if (!paths) return null;

	const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

	for (const [path, pathItem] of Object.entries(paths)) {
		if (!pathItem || typeof pathItem !== "object") continue;

		for (const method of methods) {
			const operation = (pathItem as Record<string, unknown>)[method] as
				| Record<string, unknown>
				| undefined;
			if (!operation?.operationId) continue;

			const opIdRange = cache.getRange(cached, [
				"paths",
				path,
				method,
				"operationId",
			]);
			if (!opIdRange) continue;

			const startOffset = cache.positionToOffset(cached, opIdRange.start);
			const endOffset = cache.positionToOffset(cached, opIdRange.end);

			if (offset >= startOffset && offset <= endOffset) {
				return {
					name: String(operation.operationId),
					range: opIdRange,
					path,
					method,
				};
			}
		}
	}

	return null;
}

/**
 * Find a tag name at the given offset (root tags[] or operation tags[] value).
 */
function findTagNameAtOffset(
	cached: CachedDocument,
	offset: number,
	cache: DocumentCache,
): TagNameInfo | null {
	const ast = cached.parsedObject as Record<string, unknown>;

	// Root tags array: tags[i].name
	const tags = ast?.tags as Array<{ name?: unknown }> | undefined;
	if (Array.isArray(tags)) {
		for (let i = 0; i < tags.length; i++) {
			const t = tags[i];
			if (!t || typeof t !== "object") continue;
			if (typeof (t as any).name !== "string") continue;
			const range = cache.getRange(cached, ["tags", i, "name"]);
			if (!range) continue;
			const startOffset = cache.positionToOffset(cached, range.start);
			const endOffset = cache.positionToOffset(cached, range.end);
			if (offset >= startOffset && offset <= endOffset) {
				return { name: String((t as any).name), range };
			}
		}
	}

	// Operation tags arrays
	const paths = ast?.paths as Record<string, unknown> | undefined;
	if (paths) {
		const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
		for (const [path, pathItem] of Object.entries(paths)) {
			if (!pathItem || typeof pathItem !== "object") continue;

			for (const method of methods) {
				const operation = (pathItem as any)[method] as Record<string, unknown> | undefined;
				if (!operation || !Array.isArray((operation as any).tags)) continue;
				const opTags = (operation as any).tags as unknown[];
				for (let i = 0; i < opTags.length; i++) {
					if (typeof opTags[i] !== "string") continue;
					const range = cache.getRange(cached, ["paths", path, method, "tags", i]);
					if (!range) continue;
					const startOffset = cache.positionToOffset(cached, range.start);
					const endOffset = cache.positionToOffset(cached, range.end);
					if (offset >= startOffset && offset <= endOffset) {
						return { name: String(opTags[i]), range };
					}
				}
			}
		}
	}

	return null;
}

async function renameTag(
	info: TagNameInfo,
	newName: string,
	ctx: TelescopeContext,
	provider: ReturnType<typeof createDocumentProvider>,
): Promise<WorkspaceEdit> {
	const changes: Record<string, TextEdit[]> = {};
	const oldName = info.name;

	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = await provider.get(uri);
		if (!doc) continue;

		const ast =
			doc.kind === "open"
				? (doc.cached.parsedObject as Record<string, unknown>)
				: (doc.parsed.ast as Record<string, unknown>);

		// Root tags array: tags[i].name
		const tags = ast?.tags as Array<{ name?: unknown }> | undefined;
		if (Array.isArray(tags)) {
			for (let i = 0; i < tags.length; i++) {
				const t = tags[i] as any;
				if (!t || typeof t !== "object") continue;
				if (t.name !== oldName) continue;
				const ptr = joinPointer(["tags", String(i), "name"]);
				const range = provider.pointerToRange(doc, ptr);
				if (!range) continue;
				if (!changes[uri]) changes[uri] = [];
				changes[uri].push({ range, newText: newName });
			}
		}

		// Operation tags arrays
		const paths = ast?.paths as Record<string, unknown> | undefined;
		if (paths) {
			const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
			for (const [path, pathItem] of Object.entries(paths)) {
				if (!pathItem || typeof pathItem !== "object") continue;

				for (const method of methods) {
					const operation = (pathItem as any)[method] as Record<string, unknown> | undefined;
					if (!operation || !Array.isArray((operation as any).tags)) continue;
					const opTags = (operation as any).tags as unknown[];
					for (let i = 0; i < opTags.length; i++) {
						if (opTags[i] !== oldName) continue;
						const ptr = joinPointer(["paths", String(path), method, "tags", String(i)]);
						const range = provider.pointerToRange(doc, ptr);
						if (!range) continue;
						if (!changes[uri]) changes[uri] = [];
						changes[uri].push({ range, newText: newName });
					}
				}
			}
		}
	}

	return { changes };
}

/**
 * Rename a component and all its references.
 */
async function renameComponent(
	info: ComponentInfo,
	newName: string,
	cached: CachedDocument,
	cache: DocumentCache,
	ctx: TelescopeContext,
	provider: ReturnType<typeof createDocumentProvider>,
): Promise<WorkspaceEdit> {
	const changes: Record<string, TextEdit[]> = {};

	// Rename the definition
	if (!changes[cached.uri]) changes[cached.uri] = [];
	changes[cached.uri].push({
		range: info.range,
		newText: newName,
	});

	// Find and rename all references
	const oldPointer = `/components/${info.type}/${info.name}`;
	const newPointer = `/components/${info.type}/${newName}`;
	const oldRefPattern = `#${oldPointer}`;
	const newRefPattern = `#${newPointer}`;

	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = await provider.get(uri);
		if (!doc) continue;

		const refs = findAllRefNodes(provider.getIR(doc).root);
		for (const { node, ref } of refs) {
			// Check for same-document refs
			if (ref === oldRefPattern) {
				if (!node.loc) continue;
				const range = provider.locToRange(doc, node.loc);
				if (!range) continue;

				if (!changes[uri]) changes[uri] = [];
				changes[uri].push({
					range,
					newText: newRefPattern,
				});
			}

			// Check for cross-document refs
			if (uri !== cached.uri) {
				const { targetUri, pointer } = resolveRefTarget(uri, ref);
				if (targetUri === cached.uri && pointer === oldPointer) {
					if (!node.loc) continue;
					const range = provider.locToRange(doc, node.loc);
					if (!range) continue;

					// Construct the new ref value maintaining the same file portion (no naive replace)
					const newRef =
						ref.startsWith("#")
							? `#${newPointer}`
							: ref.includes("#")
								? `${ref.split("#", 2)[0]}#${newPointer}`
								: ref;

					if (!changes[uri]) changes[uri] = [];
					changes[uri].push({
						range,
						newText: newRef,
					});
				}
			}
		}
	}

	// If renaming a security scheme, also rename its usage in `security` requirements (not $ref-based)
	if (info.type === "securitySchemes") {
		await renameSecuritySchemeUsage(
			info.name,
			newName,
			ctx,
			provider,
			changes,
		);
	}

	return { changes };
}

async function renameSecuritySchemeUsage(
	oldName: string,
	newName: string,
	ctx: TelescopeContext,
	provider: ReturnType<typeof createDocumentProvider>,
	changes: Record<string, TextEdit[]>,
): Promise<void> {
	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = await provider.get(uri);
		if (!doc) continue;

		const ast =
			doc.kind === "open"
				? (doc.cached.parsedObject as Record<string, unknown>)
				: (doc.parsed.ast as Record<string, unknown>);

		// Root-level security
		const rootSecurity = ast.security as Array<Record<string, unknown>> | undefined;
		if (Array.isArray(rootSecurity)) {
			for (let i = 0; i < rootSecurity.length; i++) {
				const req = rootSecurity[i];
				if (!req || typeof req !== "object") continue;
				if (!(oldName in req)) continue;
				await addKeyRenameEdit(doc, uri, ["security", String(i), oldName], oldName, newName, provider, changes);
			}
		}

		// Operation-level security
		const paths = ast.paths as Record<string, unknown> | undefined;
		if (paths) {
			const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
			for (const [path, pathItem] of Object.entries(paths)) {
				if (!pathItem || typeof pathItem !== "object") continue;
				for (const method of methods) {
					const op = (pathItem as any)[method] as Record<string, unknown> | undefined;
					if (!op) continue;
					const sec = op.security as Array<Record<string, unknown>> | undefined;
					if (!Array.isArray(sec)) continue;
					for (let i = 0; i < sec.length; i++) {
						const req = sec[i];
						if (!req || typeof req !== "object") continue;
						if (!(oldName in req)) continue;
						await addKeyRenameEdit(
							doc,
							uri,
							["paths", path, method, "security", String(i), oldName],
							oldName,
							newName,
							provider,
							changes,
						);
					}
				}
			}
		}
	}
}

async function addKeyRenameEdit(
	doc: ProvidedDocument,
	uri: string,
	pointerSegments: string[],
	oldName: string,
	newName: string,
	provider: ReturnType<typeof createDocumentProvider>,
	changes: Record<string, TextEdit[]>,
): Promise<void> {
	const ptr = joinPointer(pointerSegments);
	const range = provider.pointerToRange(doc, ptr);
	if (!range) return;
	const text = provider.getText(doc);
	const line = text.split("\n")[range.start.line] ?? "";

	let startChar = -1;
	let endChar = -1;

	// YAML: key appears as `oldName:` somewhere on the line
	const yamlIdx = line.indexOf(`${oldName}:`);
	if (yamlIdx >= 0) {
		startChar = yamlIdx;
		endChar = yamlIdx + oldName.length;
	} else {
		// JSON: key appears as `"oldName":`
		const jsonNeedle = `"${oldName}"`;
		const jsonIdx = line.indexOf(jsonNeedle);
		if (jsonIdx >= 0) {
			startChar = jsonIdx + 1;
			endChar = startChar + oldName.length;
		}
	}

	if (startChar < 0 || endChar < 0) return;

	if (!changes[uri]) changes[uri] = [];
	changes[uri].push({
		range: {
			start: { line: range.start.line, character: startChar },
			end: { line: range.start.line, character: endChar },
		},
		newText: newName,
	});
}

/**
 * Rename an operationId and all its references.
 */
async function renameOperationId(
	info: OperationIdInfo,
	newName: string,
	cached: CachedDocument,
	cache: DocumentCache,
	ctx: TelescopeContext,
	provider: ReturnType<typeof createDocumentProvider>,
): Promise<WorkspaceEdit> {
	const changes: Record<string, TextEdit[]> = {};

	// Rename the definition
	if (!changes[cached.uri]) changes[cached.uri] = [];
	changes[cached.uri].push({
		range: info.range,
		newText: newName,
	});

	// Search for operationId references in links and callbacks
	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = await provider.get(uri);
		if (!doc) continue;

		// Search for operationId in links
		(await findOperationIdReferences(doc, info.name, cache, provider)).forEach(({ range }) => {
			if (!changes[uri]) changes[uri] = [];
			changes[uri].push({ range, newText: newName });
		});
	}

	return { changes };
}


/**
 * Find references to an operationId in links and callbacks.
 */
async function findOperationIdReferences(
	doc: ProvidedDocument,
	operationId: string,
	cache: DocumentCache,
	provider: ReturnType<typeof createDocumentProvider>,
): Promise<Array<{ range: Range }>> {
	const results: Array<{ range: Range }> = [];
	// doc is always present here

	const ast =
		doc.kind === "open"
			? (doc.cached.parsedObject as Record<string, unknown>)
			: (doc.parsed.ast as Record<string, unknown>);

	// Check links in responses
	const paths = ast?.paths as Record<string, unknown> | undefined;
	if (paths) {
		const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

		for (const [path, pathItem] of Object.entries(paths)) {
			if (!pathItem || typeof pathItem !== "object") continue;

			for (const method of methods) {
				const operation = (pathItem as Record<string, unknown>)[method] as
					| Record<string, unknown>
					| undefined;
				if (!operation) continue;

				const responses = operation.responses as Record<string, unknown> | undefined;
				if (!responses) continue;

				for (const [code, response] of Object.entries(responses)) {
					if (!response || typeof response !== "object") continue;

					const links = (response as Record<string, unknown>).links as
						| Record<string, unknown>
						| undefined;
					if (!links) continue;

					for (const [linkName, link] of Object.entries(links)) {
						if (!link || typeof link !== "object") continue;

						const linkObj = link as Record<string, unknown>;
						if (linkObj.operationId === operationId) {
							const pointer = joinPointer([
								"paths",
								path,
								method,
								"responses",
								code,
								"links",
								linkName,
								"operationId",
							]);
							const range = provider.pointerToRange(doc, pointer);
							if (range) results.push({ range });
						}
					}
				}
			}
		}
	}

	return results;
}

