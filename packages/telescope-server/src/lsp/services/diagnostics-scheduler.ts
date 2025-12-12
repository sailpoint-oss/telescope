import { createHash } from "node:crypto";
import type { CancellationToken } from "vscode-languageserver";
import type { Diagnostic } from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import type { FileSystem } from "../../engine/fs-types.js";
import type {
	Diagnostic as EngineDiagnostic,
	LintingContext,
	ProjectContext,
	Rule,
} from "../../engine/index.js";
import { lintDocument } from "../../engine/index.js";
import {
	computeContentHash,
	DiagnosticsCache,
} from "./shared/diagnostics-cache.js";

export interface RootDiagnosticsSnapshot {
	projectHash: string;
	rulesSignature: string;
	byUri: Map<string, Diagnostic[]>;
	/**
	 * All document URIs that participate in this root project context.
	 * Used for invalidation when any referenced document changes.
	 */
	uris: Set<string>;
}

/**
 * DiagnosticsScheduler provides:
 * - per-document diagnostic caching (resultId/contentHash)
 * - root-level workspace diagnostic caching (projectHash/rulesSignature)
 * - invalidation hooks for file changes
 * - basic cancellation + concurrency limiting
 */
export class DiagnosticsScheduler {
	private readonly docCache = new DiagnosticsCache();
	private readonly rootCache = new Map<string, RootDiagnosticsSnapshot>();
	private readonly uriToRoots = new Map<string, Set<string>>();

	private readonly inFlightRoots = new Map<
		string,
		Promise<RootDiagnosticsSnapshot>
	>();
	private readonly maxRootConcurrency: number;

	constructor(options?: { maxRootConcurrency?: number }) {
		this.maxRootConcurrency = options?.maxRootConcurrency ?? 2;
	}

	/**
	 * Clear all cached diagnostics (document + root snapshots).
	 */
	clear(): void {
		this.docCache.clear();
		for (const rootUri of Array.from(this.rootCache.keys())) {
			this.dropRootSnapshot(rootUri);
		}
		this.rootCache.clear();
		this.uriToRoots.clear();
	}

	/**
	 * Invalidate cached results affected by a document URI.
	 */
	invalidateForDocument(uri: string): void {
		this.docCache.invalidate(uri);

		const roots = this.uriToRoots.get(uri);
		if (!roots) return;
		for (const rootUri of roots) {
			this.dropRootSnapshot(rootUri);
		}
		this.uriToRoots.delete(uri);
	}

	/**
	 * Used for document diagnostics. If `previousResultId` matches and content is unchanged,
	 * returns `kind: \"unchanged\"`.
	 */
	async getOrComputeDocumentDiagnostics(args: {
		uri: string;
		previousResultId: string | undefined;
		/** Current content (if open). If omitted, content will be read via fileSystem. */
		content?: string;
		fileSystem: FileSystem;
		compute: () => Promise<Diagnostic[]>;
	}): Promise<
		| { kind: "unchanged"; resultId: string | undefined }
		| { kind: "full"; resultId: string; items: Diagnostic[] }
	> {
		const content =
			args.content ??
			(await args.fileSystem.readFile(URI.parse(args.uri))) ??
			"";
		const contentHash = computeContentHash(content);

		const cached = this.docCache.get(args.uri);
		const cachedResultId = cached?.resultId;

		// Fast path: nothing changed and client already has the same resultId.
		if (
			cachedResultId &&
			args.previousResultId === cachedResultId &&
			!this.docCache.needsRevalidation(args.uri, contentHash)
		) {
			return { kind: "unchanged", resultId: cachedResultId };
		}

		if (!this.docCache.needsRevalidation(args.uri, contentHash) && cached) {
			// Content unchanged but client didn't have matching previousResultId;
			// return full payload with stable resultId.
			return {
				kind: "full",
				resultId: cached.resultId,
				items: cached.diagnostics,
			};
		}

		const diagnostics = await args.compute();
		this.docCache.set(args.uri, diagnostics, contentHash);
		const resultId = this.docCache.getResultId(args.uri);
		// ResultId should always exist immediately after set()
		return {
			kind: "full",
			resultId: resultId ?? "unknown",
			items: diagnostics,
		};
	}

	/**
	 * Compute (or reuse) diagnostics for a root entrypoint, returning a snapshot grouped by URI.
	 * Caller is responsible for splitting/merging across roots.
	 */
	async getOrComputeRootDiagnostics(args: {
		rootUri: string;
		rulesSignature: string;
		fileSystem: FileSystem;
		resolveContext: () => Promise<LintingContext>;
		token?: CancellationToken;
		rules: Rule[];
		toLspDiagnostic: (d: EngineDiagnostic) => Diagnostic;
		compareDiagnostics: (a: Diagnostic, b: Diagnostic) => number;
	}): Promise<RootDiagnosticsSnapshot> {
		const cached = this.rootCache.get(args.rootUri);
		if (cached && cached.rulesSignature === args.rulesSignature) {
			return cached;
		}

		const existingInFlight = this.inFlightRoots.get(args.rootUri);
		if (existingInFlight) {
			return await existingInFlight;
		}

		const promise = this.computeRootDiagnostics(args).finally(() => {
			this.inFlightRoots.delete(args.rootUri);
		});
		this.inFlightRoots.set(args.rootUri, promise);
		return await promise;
	}

	private async computeRootDiagnostics(args: {
		rootUri: string;
		rulesSignature: string;
		fileSystem: FileSystem;
		resolveContext: () => Promise<LintingContext>;
		token?: CancellationToken;
		rules: Rule[];
		toLspDiagnostic: (d: EngineDiagnostic) => Diagnostic;
		compareDiagnostics: (a: Diagnostic, b: Diagnostic) => number;
	}): Promise<RootDiagnosticsSnapshot> {
		// Concurrency limiting: simple cooperative gate.
		await this.acquireRootSlot(args.token);
		try {
			args.token?.isCancellationRequested && throwCancelled();

			const lintingContext = await args.resolveContext();
			args.token?.isCancellationRequested && throwCancelled();

			const projectUris = new Set<string>();
			for (const uri of lintingContext.context?.docs.keys() ?? []) {
				projectUris.add(uri);
			}

			const engineDiags = await lintDocument(
				lintingContext,
				args.fileSystem,
				args.rules,
			);
			args.token?.isCancellationRequested && throwCancelled();

			const projectHash = computeProjectHashFromContext(lintingContext);

			const byUri = new Map<string, Diagnostic[]>();
			for (const d of engineDiags) {
				const list = byUri.get(d.uri) ?? [];
				list.push(args.toLspDiagnostic(d));
				byUri.set(d.uri, list);
			}

			for (const list of byUri.values()) {
				list.sort(args.compareDiagnostics);
			}

			const snapshot: RootDiagnosticsSnapshot = {
				projectHash,
				rulesSignature: args.rulesSignature,
				byUri,
				uris: projectUris,
			};

			this.setRootSnapshot(args.rootUri, snapshot);
			return snapshot;
		} finally {
			this.releaseRootSlot();
		}
	}

	private setRootSnapshot(
		rootUri: string,
		snapshot: RootDiagnosticsSnapshot,
	): void {
		this.dropRootSnapshot(rootUri);
		this.rootCache.set(rootUri, snapshot);

		for (const uri of snapshot.uris) {
			const set = this.uriToRoots.get(uri) ?? new Set<string>();
			set.add(rootUri);
			this.uriToRoots.set(uri, set);
		}
	}

	private dropRootSnapshot(rootUri: string): void {
		const existing = this.rootCache.get(rootUri);
		if (!existing) return;

		for (const uri of existing.uris) {
			const roots = this.uriToRoots.get(uri);
			if (!roots) continue;
			roots.delete(rootUri);
			if (roots.size === 0) this.uriToRoots.delete(uri);
		}

		this.rootCache.delete(rootUri);
	}

	// -------------------------------------------------------------------------
	// Root concurrency gate
	// -------------------------------------------------------------------------
	private inUse = 0;
	private waiters: Array<() => void> = [];

	private async acquireRootSlot(token?: CancellationToken): Promise<void> {
		while (this.inUse >= this.maxRootConcurrency) {
			token?.isCancellationRequested && throwCancelled();
			await new Promise<void>((resolve) => this.waiters.push(resolve));
		}
		this.inUse++;
	}

	private releaseRootSlot(): void {
		this.inUse = Math.max(0, this.inUse - 1);
		const next = this.waiters.shift();
		if (next) next();
	}
}

function computeProjectHashFromContext(ctx: LintingContext): string {
	const project = ctx.context;
	if (!project) return "no-project";
	return computeProjectHash(project);
}

function computeProjectHash(project: ProjectContext): string {
	const hash = createHash("sha1");
	const pairs: Array<[string, string]> = [];
	for (const [uri, doc] of project.docs) {
		pairs.push([uri, doc.hash]);
	}
	pairs.sort((a, b) => a[0].localeCompare(b[0]));
	for (const [uri, h] of pairs) {
		hash.update(uri);
		hash.update("\0");
		hash.update(h);
		hash.update("\n");
	}
	return hash.digest("hex").substring(0, 16);
}

function throwCancelled(): never {
	throw new Error("Cancelled");
}
