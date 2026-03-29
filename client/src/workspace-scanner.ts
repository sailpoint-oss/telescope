/**
 * Workspace Scanner for OpenAPI Documents
 *
 * Provides background scanning of workspace files to classify OpenAPI documents.
 * Uses batch processing and caching to efficiently handle large workspaces.
 *
 * In the new architecture, each Session has its own WorkspaceScanner instance
 * scoped to a specific workspace folder.
 */

import { open as fsOpen, stat as fsStat } from "node:fs/promises";
import * as vscode from "vscode";
import * as jsonc from "jsonc-parser";
import { isOpenAPIDocument } from "./classifier";
import { extractYAMLTopLevelKeys, keysToRecord } from "./utils";

/**
 * Result of scanning a single file.
 */
export interface ScanResult {
	/** File URI */
	uri: string;
	/** Whether the file is an OpenAPI document */
	isOpenAPI: boolean;
	/** Timestamp when the file was scanned */
	scannedAt: number;
}

/**
 * Persistent cache entry keyed by URI.
 * Used to avoid re-reading/re-parsing unchanged files across extension restarts.
 */
interface PersistedScanEntry {
	mtime: number;
	size: number;
	isOpenAPI: boolean;
	scannedAt: number;
}

export interface WorkspaceScannerOptions {
	workspaceState?: vscode.Memento;
	storageKey?: string;
}

/**
 * Progress callback for scan operations.
 */
export type ScanProgressCallback = (scanned: number, total: number) => void;

/**
 * Determine if a file is JSON based on its path.
 */
function isJSONFile(filePath: string): boolean {
	return filePath.toLowerCase().endsWith(".json");
}

function isJSONCFile(filePath: string): boolean {
	return filePath.toLowerCase().endsWith(".jsonc");
}

/**
 * Filter function to determine if a file should be scanned.
 */
export type FileFilter = (uri: vscode.Uri) => boolean;

/**
 * Callback for status updates during scanning.
 * Used to centralize status bar management in SessionManager.
 */
export type ScanStatusCallback = (status: string) => void;

/**
 * WorkspaceScanner provides background scanning of workspace files
 * to identify OpenAPI documents.
 *
 * Features:
 * - Can be scoped to a specific workspace folder
 * - Batch processing with configurable batch size
 * - In-memory caching of results
 * - Progress reporting via callback
 * - Cancellation support
 * - Efficient: only reads first 4KB of each file
 * - Pattern-based filtering via FileFilter
 */
export class WorkspaceScanner {
	/** Cache of scan results by URI */
	private cache = new Map<string, ScanResult>();

	/** Optional persistent cache (stored via VS Code Memento) */
	private persisted: Record<string, PersistedScanEntry> = {};
	private workspaceState: vscode.Memento | null = null;
	private storageKey: string | null = null;
	private persistTimer: ReturnType<typeof setTimeout> | null = null;
	private persistDirty = false;

	/** Whether a scan is currently in progress */
	private scanning = false;

	/** Cancellation token for current scan */
	private cancellationSource: vscode.CancellationTokenSource | null = null;

	/** Number of OpenAPI files found */
	private openAPICount = 0;

	/** Optional filter function to determine which files to scan */
	private fileFilter: FileFilter | null = null;

	/** Optional discovery patterns from config (used to narrow file enumeration) */
	private discoveryPatterns: string[] | null = null;

	/** Optional workspace folder to scope scanning to */
	private workspaceFolder: vscode.WorkspaceFolder | null = null;

	/** Callback for status updates (replaces direct status bar manipulation) */
	private statusCallback: ScanStatusCallback | null = null;

	/**
	 * Create a new WorkspaceScanner.
	 *
	 * @param workspaceFolder - Optional workspace folder to scope scanning to
	 */
	constructor(workspaceFolder?: vscode.WorkspaceFolder, options?: WorkspaceScannerOptions) {
		this.workspaceFolder = workspaceFolder || null;
		this.workspaceState = options?.workspaceState ?? null;
		this.storageKey = options?.storageKey ?? null;

		if (this.workspaceState && this.storageKey) {
			this.persisted =
				this.workspaceState.get<Record<string, PersistedScanEntry>>(this.storageKey) ??
				{};
		}
	}

	/**
	 * Set the workspace folder to scope scanning to.
	 * When set, only files within this folder will be scanned.
	 */
	setWorkspaceFolder(folder: vscode.WorkspaceFolder | null): void {
		this.workspaceFolder = folder;
	}

	/**
	 * Get the workspace folder this scanner is scoped to.
	 */
	getWorkspaceFolder(): vscode.WorkspaceFolder | null {
		return this.workspaceFolder;
	}

	/**
	 * Set the file filter function.
	 * This filter is called for each file to determine if it should be scanned.
	 *
	 * @param filter - Filter function that returns true for files to scan
	 */
	setFileFilter(filter: FileFilter | null): void {
		this.fileFilter = filter;
	}

	/**
	 * Provide the configured OpenAPI patterns so the scanner can narrow file enumeration.
	 *
	 * Semantics: this is a best-effort performance optimization only.
	 * We still apply the authoritative `fileFilter` after enumeration to preserve correctness.
	 */
	setDiscoveryPatterns(patterns: string[] | null): void {
		this.discoveryPatterns = patterns && patterns.length > 0 ? patterns : null;
	}

	/**
	 * Set the status callback for progress updates.
	 * This centralizes status bar management in SessionManager.
	 *
	 * @param callback - Callback function that receives status messages
	 */
	setStatusCallback(callback: ScanStatusCallback | null): void {
		this.statusCallback = callback;
	}

	/**
	 * Check if a scan is currently in progress.
	 */
	isScanning(): boolean {
		return this.scanning;
	}

	/**
	 * Get the number of OpenAPI files found.
	 */
	getOpenAPICount(): number {
		return this.openAPICount;
	}

	/**
	 * Recompute the OpenAPI count from the cache. Call this after
	 * classifying individual files (e.g. from a file watcher) to keep
	 * the count accurate between full workspace scans.
	 */
	recount(): void {
		let count = 0;
		for (const result of this.cache.values()) {
			if (result.isOpenAPI) count++;
		}
		this.openAPICount = count;
	}

	/**
	 * Cancel any ongoing scan.
	 */
	cancelScan(): void {
		if (this.cancellationSource) {
			this.cancellationSource.cancel();
			this.cancellationSource = null;
		}
		this.scanning = false;
	}

	/**
	 * Scan for OpenAPI documents.
	 *
	 * If a workspace folder is set, only scans that folder.
	 * Otherwise, scans the entire workspace.
	 *
	 * @param onProgress - Optional callback for progress updates
	 * @param batchSize - Number of files to process per batch (default: 10)
	 * @returns Array of URIs that are OpenAPI documents
	 */
	async scanWorkspace(
		onProgress?: ScanProgressCallback,
		batchSize = 10,
	): Promise<string[]> {
		if (this.scanning) {
			console.debug("Scan already in progress");
			return [];
		}

		this.scanning = true;
		this.cancellationSource = new vscode.CancellationTokenSource();
		const token = this.cancellationSource.token;

		try {
			const excludePattern = "**/{node_modules,.git,dist,build,coverage,.telescope}/**";

			// Build include patterns:
			// - If config patterns are simple (positive only), enumerate only those globs.
			// - Otherwise, fall back to all YAML/JSON and rely on the authoritative fileFilter.
			const includePatterns = getIncludePatternsForScan(
				this.workspaceFolder,
				this.discoveryPatterns,
			);

			let allFiles: vscode.Uri[] = [];
			for (const includePattern of includePatterns) {
				if (token.isCancellationRequested) return [];
				const files = await vscode.workspace.findFiles(
					includePattern,
					excludePattern,
					undefined,
					token,
				);
				allFiles.push(...files);
			}

			// Deduplicate when multiple include patterns overlap
			if (allFiles.length > 1) {
				const seen = new Set<string>();
				allFiles = allFiles.filter((u) => {
					const key = u.toString();
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				});
			}

			if (token.isCancellationRequested) {
				return [];
			}

			// Apply file filter if set
			let files = allFiles;
			if (this.fileFilter) {
				files = files.filter((uri) => this.fileFilter?.(uri) ?? true);
			}

			const openAPIFiles: string[] = [];
			const total = files.length;

			// Update status via callback
			this.reportStatus(`Scanning... 0/${total}`);

			// Concurrency-limited worker pool (batchSize == concurrency for back-compat)
			const concurrency = Math.max(1, Math.min(batchSize, 32));
			let scanned = 0;
			let idx = 0;

			const workers = Array.from({ length: concurrency }).map(async () => {
				for (;;) {
					if (token.isCancellationRequested) return;
					const myIdx = idx++;
					if (myIdx >= files.length) return;

					const uri = files[myIdx];
					if (!uri) return;
					const result = await this.classifyFile(uri, token);
					if (result?.isOpenAPI) {
						openAPIFiles.push(result.uri);
					}

					scanned++;
					onProgress?.(scanned, total);
					this.reportStatus(`Scanning... ${scanned}/${total}`);
				}
			});

			await Promise.all(workers);

			this.openAPICount = openAPIFiles.length;
			this.reportStatus(`OpenAPI: ${this.openAPICount} files`);

			return openAPIFiles;
		} finally {
			this.scanning = false;
			this.cancellationSource = null;
			this.flushPersistedSoon();
		}
	}

	/**
	 * Classify a single file.
	 *
	 * @param uri - File URI to classify
	 * @param token - Optional cancellation token
	 * @returns Scan result, or null if cancelled/failed
	 */
	async classifyFile(
		uri: vscode.Uri,
		token?: vscode.CancellationToken,
	): Promise<ScanResult | null> {
		if (token?.isCancellationRequested) {
			return null;
		}

		const uriString = uri.toString();
		const filePath = uri.fsPath;

		try {
			// Fast path: unchanged file (mtime+size) => reuse persisted result
			const stat = await this.getStat(uri);
			const persisted = stat ? this.persisted[uriString] : undefined;
			if (
				stat &&
				persisted &&
				persisted.mtime === stat.mtime &&
				persisted.size === stat.size
			) {
				const cached: ScanResult = {
					uri: uriString,
					isOpenAPI: persisted.isOpenAPI,
					scannedAt: persisted.scannedAt,
				};
				this.cache.set(uriString, cached);
				return cached;
			}

			const isJSON = isJSONFile(filePath) || isJSONCFile(filePath);
			const maxBytes = isJSON ? 256 * 1024 : 64 * 1024;
			const text = await this.readFilePrefix(uri, maxBytes);

			// Extract top-level keys in a bounded way (no full parse of huge files)
			const keys = isJSON ? extractJSONCTopLevelKeys(text) : extractYAMLTopLevelKeys(text);
			const root = keysToRecord(keys);
			const isOpenAPI = root ? isOpenAPIDocument(root) : false;

			const result: ScanResult = {
				uri: uriString,
				isOpenAPI,
				scannedAt: Date.now(),
			};

			this.cache.set(uriString, result);
			if (stat && this.workspaceState && this.storageKey) {
				this.persisted[uriString] = {
					mtime: stat.mtime,
					size: stat.size,
					isOpenAPI,
					scannedAt: result.scannedAt,
				};
				this.persistDirty = true;
			}
			return result;
		} catch (error) {
			console.debug(`Failed to classify ${uriString}:`, error);
			return null;
		}
	}

	/**
	 * Get cached classification for a URI.
	 *
	 * @param uri - File URI to look up
	 * @returns Cached scan result, or undefined if not cached
	 */
	getClassification(uri: string): ScanResult | undefined {
		return this.cache.get(uri);
	}

	/**
	 * Update the in-memory classification for an open document.
	 * This is used for live LSP-driven reclassification and does not persist
	 * unsaved document state across sessions.
	 */
	rememberClassification(uri: string, isOpenAPI: boolean): void {
		const existing = this.cache.get(uri);
		if (existing?.isOpenAPI !== isOpenAPI) {
			if (existing?.isOpenAPI) {
				this.openAPICount--;
			}
			if (isOpenAPI) {
				this.openAPICount++;
			}
		}
		this.cache.set(uri, {
			uri,
			isOpenAPI,
			scannedAt: Date.now(),
		});
	}

	/**
	 * Check if a cached result is still fresh.
	 *
	 * @param result - Scan result to check
	 * @param maxAgeMs - Maximum age in milliseconds (default: 5 minutes)
	 * @returns true if the result is fresh
	 */
	isFresh(result: ScanResult, maxAgeMs = 300000): boolean {
		return Date.now() - result.scannedAt < maxAgeMs;
	}

	/**
	 * Clear the cache.
	 */
	clearCache(): void {
		this.cache.clear();
		this.openAPICount = 0;
	}

	/**
	 * Invalidate a specific file from the cache.
	 *
	 * @param uri - File URI to invalidate
	 */
	invalidate(uri: string): void {
		const result = this.cache.get(uri);
		if (result?.isOpenAPI) {
			this.openAPICount--;
		}
		this.cache.delete(uri);
		if (this.persisted[uri]) {
			delete this.persisted[uri];
			this.persistDirty = true;
			this.flushPersistedSoon();
		}
	}

	/**
	 * Get all cached OpenAPI file URIs.
	 */
	getOpenAPIFiles(): string[] {
		const files: string[] = [];
		for (const [uri, result] of this.cache) {
			if (result.isOpenAPI) {
				files.push(uri);
			}
		}
		return files;
	}

	/**
	 * Report status via callback.
	 * Includes workspace folder name prefix if scoped to a folder.
	 */
	private reportStatus(text: string): void {
		if (this.statusCallback) {
			const prefix = this.workspaceFolder
				? `${this.workspaceFolder.name}: `
				: "";
			this.statusCallback(`${prefix}${text}`);
		}
	}

	/**
	 * Dispose of resources.
	 */
	dispose(): void {
		this.cancelScan();
		this.clearCache();
		this.flushPersistedNow();
		// Don't dispose status bar item - it's shared and managed by SessionManager
	}

	// -------------------------------------------------------------------------
	// Persistence helpers
	// -------------------------------------------------------------------------
	private flushPersistedSoon(): void {
		if (!this.workspaceState || !this.storageKey) return;
		if (!this.persistDirty) return;
		if (this.persistTimer) return;
		this.persistTimer = setTimeout(() => {
			this.persistTimer = null;
			void this.flushPersistedNow();
		}, 500);
	}

	private async flushPersistedNow(): Promise<void> {
		if (!this.workspaceState || !this.storageKey) return;
		if (!this.persistDirty) return;
		this.persistDirty = false;
		try {
			await this.workspaceState.update(this.storageKey, this.persisted);
		} catch {
			// Best-effort only; never block scanning UX.
		}
	}

	// -------------------------------------------------------------------------
	// IO helpers
	// -------------------------------------------------------------------------
	private async getStat(
		uri: vscode.Uri,
	): Promise<{ mtime: number; size: number } | null> {
		try {
			if (uri.scheme === "file") {
				const st = await fsStat(uri.fsPath);
				return { mtime: st.mtimeMs, size: st.size };
			}
			const st = await vscode.workspace.fs.stat(uri);
			return { mtime: st.mtime, size: st.size };
		} catch {
			return null;
		}
	}

	private async readFilePrefix(uri: vscode.Uri, maxBytes: number): Promise<string> {
		// For local workspaces, use Node FS to avoid reading whole files.
		if (uri.scheme === "file") {
			const st = await this.getStat(uri);
			const toRead = Math.max(0, Math.min(maxBytes, st?.size ?? maxBytes));
			const fh = await fsOpen(uri.fsPath, "r");
			try {
				const buffer = Buffer.alloc(toRead);
				const { bytesRead } = await fh.read(buffer, 0, toRead, 0);
				return new TextDecoder().decode(buffer.subarray(0, bytesRead));
			} finally {
				await fh.close();
			}
		}

		// Fallback: VS Code FS API reads entire contents; still bound in-memory slice.
		const content = await vscode.workspace.fs.readFile(uri);
		const slice = content.slice(0, maxBytes);
		return new TextDecoder().decode(slice);
	}
}

function extractJSONCTopLevelKeys(text: string): Set<string> {
	const keys = new Set<string>();
	const errors: jsonc.ParseError[] = [];
	const tree = jsonc.parseTree(text, errors);
	if (!tree || tree.type !== "object" || !tree.children) {
		return keys;
	}
	for (const prop of tree.children) {
		if (prop.type !== "property" || !prop.children || !prop.children[0]) continue;
		const keyNode = prop.children[0];
		if (typeof keyNode.value === "string") {
			keys.add(keyNode.value);
			if (keys.size >= 20) break;
		}
	}
	return keys;
}

function getIncludePatternsForScan(
	workspaceFolder: vscode.WorkspaceFolder | null,
	openapiPatterns: string[] | null,
): Array<string | vscode.RelativePattern> {
	const defaultPattern = workspaceFolder
		? new vscode.RelativePattern(workspaceFolder, "**/*.{yaml,yml,json,jsonc}")
		: "**/*.{yaml,yml,json,jsonc}";

	if (!openapiPatterns || openapiPatterns.length === 0) {
		return [defaultPattern];
	}

	// Only optimize when patterns are positive-only.
	// If patterns contain negations, last-match-wins semantics can't be represented
	// as include/exclude globs reliably, so we fall back to default enumeration
	// and rely on the authoritative `fileFilter`.
	if (openapiPatterns.some((p) => p.trim().startsWith("!"))) {
		return [defaultPattern];
	}

	// Also ensure patterns look like file globs (not empty / nonsense).
	const cleaned = openapiPatterns
		.map((p) => p.trim())
		.filter(Boolean);
	if (cleaned.length === 0) return [defaultPattern];

	// Only include patterns that plausibly target YAML/JSON files.
	// If patterns are too broad, default enumeration is fine.
	const fileLike = cleaned.filter((p) =>
		/(\.ya?ml|\.jsonc?|\\{yaml,yml,json,jsonc\\})$/i.test(p) ||
		p.includes("*.") ||
		p.includes("{yaml") ||
		p.includes("{json"),
	);
	if (fileLike.length === 0) {
		return [defaultPattern];
	}

	return fileLike.map((p) =>
		workspaceFolder ? new vscode.RelativePattern(workspaceFolder, p) : p,
	);
}
