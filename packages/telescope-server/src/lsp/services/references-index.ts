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

interface RefHit {
	sourceUri: string;
	range: Location["range"];
	isInternal: boolean;
}

interface SourceIndex {
	hash: string;
	hits: RefHit[];
	// Also keep pointer-level hits for efficient removal.
	byPointerKey: Map<string, RefHit[]>;
	byFileKey: Map<string, RefHit[]>;
}

/**
 * Result of indexing a single source file.
 * Used to batch updates to shared maps after concurrent indexing.
 */
type SourceIndexResult =
	| {
			type: "add";
			sourceUri: string;
			hash: string;
			hits: RefHit[];
			byPointerKey: Map<string, RefHit[]>;
			byFileKey: Map<string, RefHit[]>;
	  }
	| {
			type: "remove";
			sourceUri: string;
	  };

/**
 * FS-backed index of inbound $ref references.
 *
 * Designed for LSP features like:
 * - top-of-file `Used by: N` inlay hints
 * - code lens reference counts for components
 * - actionable \"show references\" commands
 */
export class ReferencesIndex {
	// Result cache (derived from the index). Cleared on any invalidation.
	private readonly cache = new Map<string, InboundRefsResult>();

	// Incremental index state
	private readonly sourceIndex = new Map<string, SourceIndex>();
	private readonly dirtySources = new Set<string>();

	// Reverse indexes
	private readonly fileToHits = new Map<string, RefHit[]>();
	private readonly pointerToHits = new Map<string, RefHit[]>();

	constructor(
		private readonly fileSystem: FileSystem,
		private readonly docCache: DocumentTypeCache,
		private readonly getKnownOpenApiFiles: () => string[],
	) {}

	clear(): void {
		this.cache.clear();
		this.sourceIndex.clear();
		this.dirtySources.clear();
		this.fileToHits.clear();
		this.pointerToHits.clear();
	}

	invalidate(uri: string): void {
		// Targeted: only re-index the changed source next time we need it.
		this.dirtySources.add(normalizeUri(uri));
		// Conservative for result cache: any query result could change.
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

		await this.ensureIndexed();

		const normalizedTargetUri = normalizeUri(targetUri);
		const normalizedTargetPointer = normalizePointerFragment(targetPointer);

		const excludeSelf = options?.excludeSelf ?? false;

		const pointerKey = `${normalizedTargetUri}#${normalizedTargetPointer}`;
		const hits = this.pointerToHits.get(pointerKey) ?? [];
		const result = buildInboundRefsResult(hits, normalizedTargetUri, excludeSelf);

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

		await this.ensureIndexed();

		const normalizedTargetUri = normalizeUri(targetUri);
		const excludeSelf = options?.excludeSelf ?? false;

		const hits = this.fileToHits.get(normalizedTargetUri) ?? [];
		const result = buildInboundRefsResult(hits, normalizedTargetUri, excludeSelf);
		this.cache.set(key, result);
		return result;
	}

	// -------------------------------------------------------------------------
	// Index maintenance
	// -------------------------------------------------------------------------
	private async ensureIndexed(): Promise<void> {
		// Drop sources that no longer participate.
		const known = this.getKnownOpenApiFiles().map((u) => normalizeUri(u));
		const knownSet = new Set(known);

		for (const sourceUri of Array.from(this.sourceIndex.keys())) {
			if (!knownSet.has(sourceUri)) {
				this.removeSource(sourceUri);
			}
		}
		for (const sourceUri of Array.from(this.dirtySources)) {
			if (!knownSet.has(sourceUri)) {
				this.dirtySources.delete(sourceUri);
			}
		}

		// Determine which sources need indexing
		const toIndex = known.filter(
			(sourceUri) =>
				!this.sourceIndex.has(sourceUri) || this.dirtySources.has(sourceUri),
		);

		if (toIndex.length === 0) return;

		// Index dirty or missing sources concurrently, collecting results.
		// Each worker returns its index result; we merge into shared maps afterwards
		// to avoid concurrent modification of shared state.
		const results = await runWithConcurrencyCollect(toIndex, 4, async (sourceUri) => {
			return await this.indexSourceCollect(sourceUri);
		});

		// Merge all results into shared indexes (single-threaded, no race)
		for (const result of results) {
			if (!result) continue;
			this.applyIndexResult(result);
		}
	}

	/**
	 * Index a single source file and return the result without modifying shared state.
	 * This allows concurrent indexing without race conditions on shared maps.
	 */
	private async indexSourceCollect(sourceUri: string): Promise<SourceIndexResult | null> {
		const normalizedSource = normalizeUri(sourceUri);

		const doc = await this.docCache.getDocument(normalizedSource, this.fileSystem);
		const existing = this.sourceIndex.get(normalizedSource);
		if (!doc) {
			if (existing) {
				// Mark for removal - will be handled in applyIndexResult
				return { type: "remove", sourceUri: normalizedSource };
			}
			this.dirtySources.delete(normalizedSource);
			return null;
		}

		if (existing && existing.hash === doc.hash) {
			this.dirtySources.delete(normalizedSource);
			return null;
		}

		const hits: RefHit[] = [];
		const byPointerKey = new Map<string, RefHit[]>();
		const byFileKey = new Map<string, RefHit[]>();

		const refs = findAllRefNodesInIR(doc.ir.root);
		for (const { ref, node } of refs) {
			const resolved = resolveRefForMatch(normalizedSource, ref);
			if (!resolved) continue;

			const range = nodePtrToRange(doc, node.ptr);
			if (!range) continue;

			const targetFile = resolved.targetUri;
			const pointer = normalizePointerFragment(resolved.pointer);
			const hit: RefHit = {
				sourceUri: normalizedSource,
				range,
				isInternal: normalizedSource === targetFile,
			};
			hits.push(hit);

			const fileKey = targetFile;
			const ptrKey = `${targetFile}#${pointer}`;

			const ptrList = byPointerKey.get(ptrKey) ?? [];
			ptrList.push(hit);
			byPointerKey.set(ptrKey, ptrList);

			const fileList = byFileKey.get(fileKey) ?? [];
			fileList.push(hit);
			byFileKey.set(fileKey, fileList);
		}

		return {
			type: "add",
			sourceUri: normalizedSource,
			hash: doc.hash,
			hits,
			byPointerKey,
			byFileKey,
		};
	}

	/**
	 * Apply a collected index result to the shared indexes.
	 * Called single-threaded after all concurrent indexing completes.
	 */
	private applyIndexResult(result: SourceIndexResult): void {
		if (result.type === "remove") {
			this.removeSource(result.sourceUri);
			this.dirtySources.delete(result.sourceUri);
			return;
		}

		// If we already had entries, remove them before rebuilding.
		const existing = this.sourceIndex.get(result.sourceUri);
		if (existing) {
			this.removeSource(result.sourceUri);
		}

		// Publish into reverse indexes.
		for (const [fileKey, list] of result.byFileKey) {
			const existingList = this.fileToHits.get(fileKey) ?? [];
			existingList.push(...list);
			this.fileToHits.set(fileKey, existingList);
		}
		for (const [ptrKey, list] of result.byPointerKey) {
			const existingList = this.pointerToHits.get(ptrKey) ?? [];
			existingList.push(...list);
			this.pointerToHits.set(ptrKey, existingList);
		}

		this.sourceIndex.set(result.sourceUri, {
			hash: result.hash,
			hits: result.hits,
			byPointerKey: result.byPointerKey,
			byFileKey: result.byFileKey,
		});
		this.dirtySources.delete(result.sourceUri);
	}

	private removeSource(sourceUri: string): void {
		const existing = this.sourceIndex.get(sourceUri);
		if (!existing) return;

		// Remove pointer-level contributions
		for (const ptrKey of existing.byPointerKey.keys()) {
			const current = this.pointerToHits.get(ptrKey);
			if (!current) continue;
			const next = current.filter((h) => h.sourceUri !== sourceUri);
			if (next.length === 0) this.pointerToHits.delete(ptrKey);
			else this.pointerToHits.set(ptrKey, next);
		}

		// Remove file-level contributions
		for (const fileKey of existing.byFileKey.keys()) {
			const current = this.fileToHits.get(fileKey);
			if (!current) continue;
			const next = current.filter((h) => h.sourceUri !== sourceUri);
			if (next.length === 0) this.fileToHits.delete(fileKey);
			else this.fileToHits.set(fileKey, next);
		}

		this.sourceIndex.delete(sourceUri);
	}
}

function buildInboundRefsResult(
	hits: RefHit[],
	normalizedTargetUri: string,
	excludeSelf: boolean,
): InboundRefsResult {
	const byFile = new Map<string, number>();
	const locations: Location[] = [];
	const internalByFile = new Map<string, number>();
	const internalLocations: Location[] = [];
	const externalByFile = new Map<string, number>();
	const externalLocations: Location[] = [];

	for (const hit of hits) {
		if (excludeSelf && hit.sourceUri === normalizedTargetUri) continue;
		const loc: Location = { uri: hit.sourceUri, range: hit.range };
		locations.push(loc);
		byFile.set(hit.sourceUri, (byFile.get(hit.sourceUri) ?? 0) + 1);

		if (hit.isInternal) {
			internalLocations.push(loc);
			internalByFile.set(hit.sourceUri, (internalByFile.get(hit.sourceUri) ?? 0) + 1);
		} else {
			externalLocations.push(loc);
			externalByFile.set(hit.sourceUri, (externalByFile.get(hit.sourceUri) ?? 0) + 1);
		}
	}

	return {
		locations,
		byFile,
		internalLocations,
		internalByFile,
		externalLocations,
		externalByFile,
	};
}

async function runWithConcurrency<T>(
	items: readonly T[],
	concurrency: number,
	fn: (item: T) => Promise<void>,
): Promise<void> {
	const limit = Math.max(1, concurrency);
	let idx = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }).map(
		async () => {
			for (;;) {
				const i = idx++;
				if (i >= items.length) return;
				await fn(items[i] as T);
			}
		},
	);
	await Promise.all(workers);
}

/**
 * Like runWithConcurrency but collects and returns results from each item.
 * Results are returned in arbitrary order (not necessarily matching input order).
 */
async function runWithConcurrencyCollect<T, R>(
	items: readonly T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const limit = Math.max(1, concurrency);
	let idx = 0;
	const results: R[] = [];
	const workers = Array.from({ length: Math.min(limit, items.length) }).map(
		async () => {
			for (;;) {
				const i = idx++;
				if (i >= items.length) return;
				const result = await fn(items[i] as T);
				results.push(result);
			}
		},
	);
	await Promise.all(workers);
	return results;
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
