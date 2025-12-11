/**
 * Workspace Scanner for OpenAPI Documents
 *
 * Provides background scanning of workspace files to classify OpenAPI documents.
 * Uses batch processing and caching to efficiently handle large workspaces.
 *
 * In the new architecture, each Session has its own WorkspaceScanner instance
 * scoped to a specific workspace folder.
 */

import * as vscode from "vscode";
import { isOpenAPIDocument } from "./classifier";
import {
	extractJSONTopLevelKeys,
	extractYAMLTopLevelKeys,
	keysToRecord,
} from "./utils";

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
 * Progress callback for scan operations.
 */
export type ScanProgressCallback = (scanned: number, total: number) => void;

/**
 * Determine if a file is JSON based on its path.
 */
function isJSONFile(filePath: string): boolean {
	return filePath.toLowerCase().endsWith(".json");
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

	/** Whether a scan is currently in progress */
	private scanning = false;

	/** Cancellation token for current scan */
	private cancellationSource: vscode.CancellationTokenSource | null = null;

	/** Number of OpenAPI files found */
	private openAPICount = 0;

	/** Optional filter function to determine which files to scan */
	private fileFilter: FileFilter | null = null;

	/** Optional workspace folder to scope scanning to */
	private workspaceFolder: vscode.WorkspaceFolder | null = null;

	/** Callback for status updates (replaces direct status bar manipulation) */
	private statusCallback: ScanStatusCallback | null = null;

	/**
	 * Create a new WorkspaceScanner.
	 *
	 * @param workspaceFolder - Optional workspace folder to scope scanning to
	 */
	constructor(workspaceFolder?: vscode.WorkspaceFolder) {
		this.workspaceFolder = workspaceFolder || null;
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
			// Build the include pattern - scope to workspace folder if set
			const includePattern = this.workspaceFolder
				? new vscode.RelativePattern(
						this.workspaceFolder,
						"**/*.{yaml,yml,json,jsonc}",
					)
				: "**/*.{yaml,yml,json,jsonc}";

			// Find all YAML and JSON files
			const allFiles = await vscode.workspace.findFiles(
				includePattern,
				"**/node_modules/**",
				undefined,
				token,
			);

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

			// Process files in batches
			for (let i = 0; i < files.length; i += batchSize) {
				if (token.isCancellationRequested) {
					break;
				}

				const batch = files.slice(i, Math.min(i + batchSize, files.length));
				const results = await Promise.all(
					batch.map((uri) => this.classifyFile(uri, token)),
				);

				// Collect OpenAPI files
				for (const result of results) {
					if (result?.isOpenAPI) {
						openAPIFiles.push(result.uri);
					}
				}

				// Report progress
				const scanned = Math.min(i + batchSize, total);
				onProgress?.(scanned, total);
				this.reportStatus(`Scanning... ${scanned}/${total}`);

				// Yield to event loop to keep UI responsive
				await new Promise((resolve) => setTimeout(resolve, 0));
			}

			this.openAPICount = openAPIFiles.length;
			this.reportStatus(`OpenAPI: ${this.openAPICount} files`);

			return openAPIFiles;
		} finally {
			this.scanning = false;
			this.cancellationSource = null;
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
			// Read file content - more for JSON since we need valid JSON
			const content = await vscode.workspace.fs.readFile(uri);
			const isJSON = isJSONFile(filePath);
			// JSON needs more content to parse properly, YAML uses regex
			const maxBytes = isJSON ? 16384 : 4096;
			const text = new TextDecoder().decode(content.slice(0, maxBytes));

			// Extract keys based on file type
			const keys = isJSON
				? extractJSONTopLevelKeys(text)
				: extractYAMLTopLevelKeys(text);
			const root = keysToRecord(keys);
			const isOpenAPI = root ? isOpenAPIDocument(root) : false;

			const result: ScanResult = {
				uri: uriString,
				isOpenAPI,
				scannedAt: Date.now(),
			};

			this.cache.set(uriString, result);
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
		// Don't dispose status bar item - it's shared and managed by SessionManager
	}
}
