import type { Location } from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import type { DocumentTypeCache } from "../../engine/context/document-cache.js";
import type { FileSystem } from "../../engine/fs-types.js";
import type { IRNode } from "../../engine/ir/types.js";
import type { ParsedDocument } from "../../engine/types.js";
import { normalizeUri, resolveRef } from "../../engine/utils/ref-utils.js";

export interface InboundRefsResult {
	/** All inbound $ref locations (internal + external unless excluded). */
	locations: Location[];
	/** Counts per source file (internal + external unless excluded). */
	byFile: Map<string, number>;
	/** Inbound refs originating from the same file as the target (e.g. `#/...`). */
	internalLocations: Location[];
	internalByFile: Map<string, number>;
	/** Inbound refs originating from other files. */
	externalLocations: Location[];
	externalByFile: Map<string, number>;
}

export interface InboundRefsOptions {
	/** If true, exclude refs whose source document is the same as the target document. */
	excludeSelf?: boolean;
}

/**
 * FS-backed index of inbound $ref references.
 *
 * Designed for LSP features like:
 * - top-of-file `Used by: N` inlay hints
 * - code lens reference counts for components
 * - actionable \"show references\" commands
 */
export class ReferencesIndex {
	private readonly cache = new Map<string, InboundRefsResult>();

	constructor(
		private readonly fileSystem: FileSystem,
		private readonly docCache: DocumentTypeCache,
		private readonly getKnownOpenApiFiles: () => string[],
	) {}

	clear(): void {
		this.cache.clear();
	}

	invalidate(_uri: string): void {
		// Conservative: changes can affect many targets, so we drop all.
		this.cache.clear();
	}

	/**
	 * Find inbound references to a specific file+pointer target.
	 *
	 * @param targetUri File URI (fragment ignored)
	 * @param targetPointer JSON pointer without leading '#', e.g. \"/components/schemas/User\".
	 */
	async getInboundRefsToPointer(
		targetUri: string,
		targetPointer: string,
		options?: InboundRefsOptions,
	): Promise<InboundRefsResult> {
		const key = `${normalizeUri(targetUri)}#${normalizePointerFragment(targetPointer)}?excludeSelf=${options?.excludeSelf ? "1" : "0"}`;
		const cached = this.cache.get(key);
		if (cached) return cached;

		const normalizedTargetUri = normalizeUri(targetUri);
		const normalizedTargetPointer = normalizePointerFragment(targetPointer);

		const excludeSelf = options?.excludeSelf ?? false;

		const byFile = new Map<string, number>();
		const locations: Location[] = [];
		const internalByFile = new Map<string, number>();
		const internalLocations: Location[] = [];
		const externalByFile = new Map<string, number>();
		const externalLocations: Location[] = [];

		for (const sourceUri of this.getKnownOpenApiFiles()) {
			const normalizedSource = normalizeUri(sourceUri);
			if (excludeSelf && normalizedSource === normalizedTargetUri) {
				continue;
			}

			const doc = await this.docCache.getDocument(sourceUri, this.fileSystem);
			if (!doc) continue;

			const refs = findAllRefNodesInIR(doc.ir.root);
			for (const { ref, node } of refs) {
				const resolved = resolveRefForMatch(sourceUri, ref);
				if (!resolved) continue;

				if (
					resolved.targetUri === normalizedTargetUri &&
					normalizePointerFragment(resolved.pointer) === normalizedTargetPointer
				) {
					const range = nodePtrToRange(doc, node.ptr);
					if (!range) continue;

					locations.push({ uri: normalizeUri(sourceUri), range });
					byFile.set(sourceUri, (byFile.get(sourceUri) ?? 0) + 1);

					if (normalizedSource === normalizedTargetUri) {
						internalLocations.push({ uri: normalizeUri(sourceUri), range });
						internalByFile.set(
							sourceUri,
							(internalByFile.get(sourceUri) ?? 0) + 1,
						);
					} else {
						externalLocations.push({ uri: normalizeUri(sourceUri), range });
						externalByFile.set(
							sourceUri,
							(externalByFile.get(sourceUri) ?? 0) + 1,
						);
					}
				}
			}
		}

		const result: InboundRefsResult = {
			locations,
			byFile,
			internalLocations,
			internalByFile,
			externalLocations,
			externalByFile,
		};
		this.cache.set(key, result);
		return result;
	}

	/**
	 * Find inbound references to a file target, regardless of pointer.
	 * Used for \"Used by\" at the file level.
	 */
	async getInboundRefs(targetUri: string): Promise<InboundRefsResult> {
		return await this.getInboundRefsWithOptions(targetUri, undefined);
	}

	async getInboundRefsWithOptions(
		targetUri: string,
		options?: InboundRefsOptions,
	): Promise<InboundRefsResult> {
		const key = `${normalizeUri(targetUri)}#*?excludeSelf=${options?.excludeSelf ? "1" : "0"}`;
		const cached = this.cache.get(key);
		if (cached) return cached;

		const normalizedTargetUri = normalizeUri(targetUri);
		const excludeSelf = options?.excludeSelf ?? false;

		const byFile = new Map<string, number>();
		const locations: Location[] = [];
		const internalByFile = new Map<string, number>();
		const internalLocations: Location[] = [];
		const externalByFile = new Map<string, number>();
		const externalLocations: Location[] = [];

		for (const sourceUri of this.getKnownOpenApiFiles()) {
			const normalizedSource = normalizeUri(sourceUri);
			if (excludeSelf && normalizedSource === normalizedTargetUri) {
				continue;
			}

			const doc = await this.docCache.getDocument(sourceUri, this.fileSystem);
			if (!doc) continue;

			const refs = findAllRefNodesInIR(doc.ir.root);
			for (const { ref, node } of refs) {
				const resolved = resolveRefForMatch(sourceUri, ref);
				if (!resolved) continue;

				if (resolved.targetUri === normalizedTargetUri) {
					const range = nodePtrToRange(doc, node.ptr);
					if (!range) continue;

					locations.push({ uri: normalizeUri(sourceUri), range });
					byFile.set(sourceUri, (byFile.get(sourceUri) ?? 0) + 1);

					if (normalizedSource === normalizedTargetUri) {
						internalLocations.push({ uri: normalizeUri(sourceUri), range });
						internalByFile.set(
							sourceUri,
							(internalByFile.get(sourceUri) ?? 0) + 1,
						);
					} else {
						externalLocations.push({ uri: normalizeUri(sourceUri), range });
						externalByFile.set(
							sourceUri,
							(externalByFile.get(sourceUri) ?? 0) + 1,
						);
					}
				}
			}
		}

		const result: InboundRefsResult = {
			locations,
			byFile,
			internalLocations,
			internalByFile,
			externalLocations,
			externalByFile,
		};
		this.cache.set(key, result);
		return result;
	}
}

function resolveRefForMatch(
	sourceUri: string,
	ref: string,
): { targetUri: string; pointer: string } | null {
	// Skip external URL refs.
	if (/^https?:/i.test(ref)) return null;

	try {
		// Absolute file:// refs should not be treated as relative paths.
		if (ref.startsWith("file://")) {
			const [uri, fragment] = ref.split("#", 2);
			const parsed = URI.parse(uri ?? ref);
			const resolved = fragment ? parsed.with({ fragment }) : parsed;
			return {
				targetUri: normalizeUri(resolved.with({ fragment: "" })),
				pointer: resolved.fragment || "",
			};
		}

		// `resolveRef` handles same-document refs and relative file refs and preserves fragment.
		const resolved = resolveRef(URI.parse(sourceUri), ref);
		return {
			targetUri: normalizeUri(resolved.with({ fragment: "" })),
			pointer: resolved.fragment || "",
		};
	} catch {
		return null;
	}
}

function nodePtrToRange(doc: ParsedDocument, ptr: string) {
	try {
		return doc.sourceMap.pointerToRange(ptr);
	} catch {
		return null;
	}
}

function normalizePointerFragment(pointer: string): string {
	if (!pointer) return "";
	if (pointer.startsWith("/")) return pointer;
	// Some refs may produce fragment without leading '/', normalize.
	return `/${pointer}`;
}

function findAllRefNodesInIR(
	node: IRNode,
): Array<{ node: IRNode; ref: string }> {
	const results: Array<{ node: IRNode; ref: string }> = [];

	if (
		node.kind === "string" &&
		node.key === "$ref" &&
		typeof node.value === "string"
	) {
		results.push({ node, ref: node.value });
	}

	if (node.children) {
		for (const child of node.children) {
			results.push(...findAllRefNodesInIR(child));
		}
	}

	return results;
}
