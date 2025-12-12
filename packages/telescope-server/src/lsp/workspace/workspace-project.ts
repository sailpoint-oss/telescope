import { URI } from "vscode-uri";

import type { FileSystem } from "../../engine/fs-types.js";
import { FileType } from "../../engine/fs-types.js";
import type { LintingContext } from "../../engine/index.js";
import {
	DocumentTypeCache,
	discoverWorkspaceRoots,
	NodeFileSystem,
	ProjectContextCache,
	resolveLintingContext,
} from "../../engine/index.js";
import { isConfigFile } from "../utils.js";

export interface WorkspaceProjectOptions {
	/**
	 * Workspace folder URI for this server instance.
	 * In multi-root VS Code, the extension spawns one server per folder.
	 */
	workspaceFolderUri: string;
	/**
	 * Optional FileSystem. Defaults to a Node-backed FS.
	 * Useful for testing.
	 */
	fileSystem?: FileSystem;
}

/**
 * WorkspaceProject centralizes per-workspace state for the LSP:
 * - root discovery (entrypoints)
 * - document type caching
 * - project context caching (graphs, indexes)
 *
 * This is intentionally LSP-agnostic so it can be re-used by CLI/CI later.
 */
export class WorkspaceProject {
	private readonly workspaceFolderUri: string;
	private readonly fs: FileSystem;
	private readonly docTypeCache = new DocumentTypeCache();
	private readonly projectCache = new ProjectContextCache();

	private candidateOpenApiFiles: string[] | null = null;
	private roots: string[] = [];
	private rootsDirty = true;

	constructor(options: WorkspaceProjectOptions) {
		this.workspaceFolderUri = options.workspaceFolderUri;
		this.fs = options.fileSystem ?? new NodeFileSystem();
	}

	getWorkspaceFolderUri(): string {
		return this.workspaceFolderUri;
	}

	getFileSystem(): FileSystem {
		return this.fs;
	}

	getDocumentTypeCache(): DocumentTypeCache {
		return this.docTypeCache;
	}

	getProjectContextCache(): ProjectContextCache {
		return this.projectCache;
	}

	/**
	 * Candidate OpenAPI files from the client scanner.
	 * This is a hint to reduce scanning work; the server remains authoritative.
	 */
	setCandidateOpenApiFiles(files: string[]): void {
		this.candidateOpenApiFiles = files.filter((u) => !isConfigFile(u));
		this.rootsDirty = true;
	}

	/**
	 * Called when a file changes in the workspace (client notification or LSP change).
	 */
	notifyFileChange(uri: string): void {
		if (isConfigFile(uri)) return;

		const normalized = normalizeFileUri(uri);
		this.docTypeCache.invalidate(normalized);
		this.projectCache.invalidateForDocument(normalized);
		this.rootsDirty = true;
	}

	/**
	 * Get known root documents (entrypoints). Computes them lazily.
	 */
	async getRootUris(): Promise<string[]> {
		if (this.rootsDirty) {
			await this.refreshRoots();
		}
		return this.roots;
	}

	/**
	 * Resolve the linting context for a URI (root/project-aware vs fragment vs multi-root).
	 *
	 * Optionally provide an overlay file system for open documents so that
	 * analysis uses in-memory content without requiring disk writes.
	 */
	async resolveLintingContext(
		uri: string,
		fileSystemOverride?: FileSystem,
		options?: {
			/**
			 * If false, do not use the shared project cache.
			 * This is important when analyzing in-memory (unsaved) document content.
			 */
			useProjectCache?: boolean;
		},
	): Promise<LintingContext> {
		const fs = fileSystemOverride ?? this.fs;
		const useProjectCache = options?.useProjectCache ?? true;
		return await resolveLintingContext(
			uri,
			fs,
			[this.workspaceFolderUri],
			this.docTypeCache,
			useProjectCache ? this.projectCache : undefined,
		);
	}

	/**
	 * Create a FileSystem wrapper that overlays in-memory document contents over the base FS.
	 */
	createOverlayFileSystem(openDocs: Map<string, string>): FileSystem {
		return new OverlayFileSystem(this.fs, openDocs);
	}

	private async refreshRoots(): Promise<void> {
		this.rootsDirty = false;

		const found = new Set<string>();

		// Prefer client-provided candidate list to reduce scanning work.
		if (this.candidateOpenApiFiles && this.candidateOpenApiFiles.length > 0) {
			for (const uri of this.candidateOpenApiFiles) {
				const normalized = normalizeFileUri(uri);
				try {
					if (await this.docTypeCache.isRootDocument(normalized, this.fs)) {
						found.add(normalized);
					}
				} catch {
					// Ignore unreadable files; cache will mark unknown.
				}
			}
		}

		// Fallback: discover roots from the filesystem if client list is missing/empty.
		if (found.size === 0) {
			const roots = await discoverWorkspaceRoots(
				[this.workspaceFolderUri],
				this.fs,
				this.docTypeCache,
			);
			for (const r of roots) found.add(normalizeFileUri(r));
		}

		this.roots = Array.from(found).sort();
	}
}

/**
 * Overlay in-memory content over an underlying FileSystem.
 * Used to make diagnostics reflect open buffers.
 */
class OverlayFileSystem implements FileSystem {
	constructor(
		private readonly base: FileSystem,
		private readonly openDocs: Map<string, string>,
	) {}

	async readFile(uri: URI): Promise<string | undefined> {
		const key = uri.with({ fragment: undefined }).toString();
		const fromMemory = this.openDocs.get(key);
		if (fromMemory !== undefined) {
			return fromMemory;
		}
		return await this.base.readFile(uri);
	}

	async readDirectory(uri: URI): Promise<[string, FileType][]> {
		return await this.base.readDirectory(uri);
	}

	async stat(
		uri: URI,
	): Promise<
		| { type: FileType; size?: number; mtime?: number; ctime?: number }
		| undefined
	> {
		const key = uri.with({ fragment: undefined }).toString();
		const fromMemory = this.openDocs.get(key);
		if (fromMemory !== undefined) {
			const now = Date.now();
			return {
				type: FileType.File,
				size: fromMemory.length,
				mtime: now,
				ctime: now,
			};
		}
		return await this.base.stat(uri);
	}
}

function normalizeFileUri(uri: string): string {
	try {
		return URI.parse(uri).with({ fragment: undefined }).toString();
	} catch {
		return uri;
	}
}
