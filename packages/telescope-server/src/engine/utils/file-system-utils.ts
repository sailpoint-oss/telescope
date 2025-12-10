/**
 * File System Utilities
 *
 * This module provides utilities for file system operations using Volar's
 * FileSystem interface. It includes:
 *
 * - File existence checking
 * - File reading with metadata (hash, mtime)
 * - Directory traversal for finding OpenAPI files
 * - Glob-like pattern matching
 * - In-memory file system for testing
 *
 * All utilities are designed to work with Volar's FileSystem interface,
 * which abstracts over the actual file system implementation.
 *
 * @module utils/file-system-utils
 *
 * @example
 * ```typescript
 * import { fileExists, readFileWithMetadata, globFiles, MemoryFileSystem } from "telescope-server";
 *
 * // Check if file exists
 * const exists = await fileExists(fileSystem, "file:///api.yaml");
 *
 * // Read with metadata
 * const data = await readFileWithMetadata(fileSystem, "file:///api.yaml");
 * console.log(data.text, data.hash, data.mtimeMs);
 *
 * // Find all YAML files
 * const files = await globFiles(fileSystem, ["**\/*.yaml"], workspaceFolders);
 *
 * // Use in-memory for tests
 * const memFs = new MemoryFileSystem();
 * memFs.addFile("file:///api.yaml", "openapi: 3.1.0");
 * ```
 */

import type { FileSystem } from "@volar/language-service";
import { FileType } from "@volar/language-service";
import { URI } from "vscode-uri";

/**
 * Check if a file exists using Volar's FileSystem.
 *
 * Fragments are automatically stripped from the URI since they are
 * document-level identifiers, not file-level.
 *
 * @param fileSystem - Volar FileSystem instance
 * @param uri - The URI to check (fragments will be stripped)
 * @returns true if the file exists, false otherwise
 *
 * @example
 * ```typescript
 * // File exists check
 * await fileExists(fileSystem, URI.parse("file:///api.yaml"));
 * // true/false
 *
 * // Fragments are stripped
 * await fileExists(fileSystem, "file:///api.yaml#/paths");
 * // Same as checking "file:///api.yaml"
 * ```
 */
export async function fileExists(
	fileSystem: FileSystem,
	uri: URI | string,
): Promise<boolean> {
	const volarUri = typeof uri === "string" ? URI.parse(uri) : uri;
	// Strip fragment before file system operations (Volar-native: fragments are document-level, not file-level)
	const baseUri = volarUri.with({ fragment: undefined });
	const stat = await fileSystem.stat(baseUri);
	return stat !== undefined && stat.type === FileType.File;
}

/**
 * Read a file with metadata using Volar's FileSystem.
 *
 * Returns the file content along with modification time and content hash.
 * The hash can be used for cache invalidation.
 *
 * @param fileSystem - Volar FileSystem instance
 * @param uri - The URI to read (fragments will be stripped)
 * @returns Object with text, mtimeMs, and hash; or undefined if file doesn't exist
 *
 * @example
 * ```typescript
 * const data = await readFileWithMetadata(fileSystem, "file:///api.yaml");
 * if (data) {
 *   console.log(`Content: ${data.text.substring(0, 100)}...`);
 *   console.log(`Modified: ${new Date(data.mtimeMs)}`);
 *   console.log(`Hash: ${data.hash}`);
 * }
 * ```
 */
export async function readFileWithMetadata(
	fileSystem: FileSystem,
	uri: URI | string,
): Promise<{ text: string; mtimeMs: number; hash: string } | undefined> {
	const volarUri = typeof uri === "string" ? URI.parse(uri) : uri;
	// Strip fragment before file system operations (Volar-native: fragments are document-level, not file-level)
	const baseUri = volarUri.with({ fragment: undefined });
	const text = await fileSystem.readFile(baseUri);
	if (text === undefined) {
		return undefined;
	}

	const stat = await fileSystem.stat(baseUri);
	const mtimeMs = stat?.mtime ?? Date.now();

	// Import hash function dynamically to avoid circular dependencies
	const { computeDocumentHash } = await import("./hash-utils.js");

	return {
		text,
		mtimeMs,
		hash: computeDocumentHash(text),
	};
}

/**
 * Recursively walk a directory and find files matching an extension.
 *
 * Uses Volar's FileSystem.readDirectory for efficient traversal.
 * Automatically skips common non-source directories like node_modules, .git, etc.
 *
 * @param fileSystem - Volar FileSystem instance
 * @param dirUri - The directory URI to start from
 * @param extension - File extension to match (e.g., ".yaml", ".json")
 * @param results - Array to collect matching file URIs
 * @param visited - Set of visited directory URIs to prevent cycles
 * @param maxDepth - Maximum directory depth to traverse (default: 10)
 * @param currentDepth - Current depth in traversal (internal use)
 *
 * @example
 * ```typescript
 * const yamlFiles: string[] = [];
 * await walkDirectoryForExtension(
 *   fileSystem,
 *   URI.parse("file:///project/api"),
 *   ".yaml",
 *   yamlFiles
 * );
 * console.log(`Found ${yamlFiles.length} YAML files`);
 * ```
 */
export async function walkDirectoryForExtension(
	fileSystem: FileSystem,
	dirUri: URI,
	extension: string,
	results: string[],
	visited: Set<string> = new Set(),
	maxDepth: number = 10,
	currentDepth: number = 0,
): Promise<void> {
	if (currentDepth >= maxDepth || visited.has(dirUri.toString())) {
		return;
	}

	visited.add(dirUri.toString());

	try {
		const entries = await fileSystem.readDirectory(dirUri);
		if (!entries) {
			return;
		}

		for (const [name, fileType] of entries) {
			// Properly join paths using URI.with() to normalize them
			const dirPath = dirUri.path.endsWith("/")
				? dirUri.path
				: `${dirUri.path}/`;
			const childPath = `${dirPath}${name}`.replace(/\/+/g, "/");
			const childUri = dirUri.with({ path: childPath });

			if (fileType === FileType.Directory) {
				// Skip common directories that contain non-OpenAPI files
				if (
					name.startsWith(".") ||
					name === "node_modules" ||
					name === ".git" ||
					name === "dist" ||
					name === "build" ||
					name === ".next" ||
					name === "coverage" ||
					name === ".vscode" ||
					name === ".idea" ||
					name === "out" ||
					name === "lib" ||
					name === "bin"
				) {
					continue;
				}
				await walkDirectoryForExtension(
					fileSystem,
					childUri,
					extension,
					results,
					visited,
					maxDepth,
					currentDepth + 1,
				);
			} else if (fileType === FileType.File) {
				if (name.toLowerCase().endsWith(extension)) {
					results.push(childUri.toString());
				}
			}
		}
	} catch {
		// Skip directories we can't read
	}
}

/**
 * Find files matching glob patterns using Volar's FileSystem.
 *
 * This is a simplified glob implementation that supports common patterns
 * for OpenAPI files (.yaml, .yml, .json).
 *
 * @param fileSystem - Volar FileSystem instance
 * @param patterns - Array of glob patterns (e.g., ["**\/*.yaml", "**\/*.json"])
 * @param workspaceFolders - Array of workspace folder URIs to search in
 * @param shouldProcessFile - Optional callback to filter files
 * @returns Array of matching file URIs
 *
 * @example
 * ```typescript
 * // Find all YAML and JSON files
 * const files = await globFiles(
 *   fileSystem,
 *   ["**\/*.yaml", "**\/*.yml", "**\/*.json"],
 *   [URI.parse("file:///project")]
 * );
 *
 * // With filter
 * const openApiFiles = await globFiles(
 *   fileSystem,
 *   ["**\/*.yaml"],
 *   workspaceFolders,
 *   (uri) => !uri.includes("/node_modules/")
 * );
 * ```
 */
export async function globFiles(
	fileSystem: FileSystem,
	patterns: string[],
	workspaceFolders: URI[],
	shouldProcessFile?: (uri: string) => boolean,
): Promise<string[]> {
	const results: string[] = [];
	const visited = new Set<string>();

	// Extract extensions from patterns
	const extensions = new Set<string>();
	for (const pattern of patterns) {
		const extensionMatch = pattern.match(/\.(yaml|yml|json)$/);
		if (extensionMatch) {
			extensions.add(extensionMatch[0]);
		}
	}

	// Walk each workspace folder for each extension
	for (const folderUri of workspaceFolders) {
		for (const extension of extensions) {
			await walkDirectoryForExtension(
				fileSystem,
				folderUri,
				extension,
				results,
				visited,
			);
		}
	}

	// Filter results if callback provided
	if (shouldProcessFile) {
		return results.filter((uri) => shouldProcessFile(uri));
	}

	return results;
}

/**
 * In-memory FileSystem implementation for testing.
 *
 * Implements Volar's FileSystem interface, allowing tests to run
 * without actual file system access. Files are stored in a Map
 * with their content and metadata.
 *
 * @example
 * ```typescript
 * const fs = new MemoryFileSystem();
 *
 * // Add test files
 * fs.addFile("file:///api.yaml", "openapi: 3.1.0\ninfo:\n  title: Test API");
 * fs.addFile("file:///schemas/User.yaml", "type: object");
 *
 * // Use in tests
 * const text = await fs.readFile(URI.parse("file:///api.yaml"));
 * // "openapi: 3.1.0\ninfo:\n  title: Test API"
 *
 * const stat = await fs.stat(URI.parse("file:///api.yaml"));
 * // { type: FileType.File, size: ..., mtime: ..., ctime: ... }
 * ```
 */
export class MemoryFileSystem implements FileSystem {
	private files = new Map<string, { text: string; mtimeMs: number }>();

	/**
	 * Normalize URI by stripping fragment (consistent with Volar FileSystem behavior).
	 * Fragments are document-level, not file-level.
	 *
	 * @internal
	 */
	private normalizeUri(uri: URI | string): string {
		const uriObj = typeof uri === "string" ? URI.parse(uri) : uri;
		return uriObj.with({ fragment: undefined }).toString();
	}

	/**
	 * Add a file to the in-memory filesystem.
	 *
	 * @param uri - The URI of the file
	 * @param text - The file content
	 * @param mtimeMs - Optional modification time (defaults to current time)
	 *
	 * @example
	 * ```typescript
	 * fs.addFile("file:///api.yaml", "openapi: 3.1.0");
	 * fs.addFile("file:///old.yaml", "openapi: 3.0.0", Date.now() - 86400000);
	 * ```
	 */
	addFile(uri: string, text: string, mtimeMs: number = Date.now()): void {
		// Normalize URI (strip fragment) when storing files
		const normalizedUri = this.normalizeUri(uri);
		this.files.set(normalizedUri, { text, mtimeMs });
	}

	/**
	 * Read a file from the in-memory filesystem.
	 */
	async readFile(uri: URI): Promise<string | undefined> {
		// Normalize URI (strip fragment) when reading files
		const normalizedUri = this.normalizeUri(uri);
		const file = this.files.get(normalizedUri);
		return file?.text;
	}

	/**
	 * Get file statistics from the in-memory filesystem.
	 */
	async stat(uri: URI) {
		// Normalize URI (strip fragment) when checking file stats
		const normalizedUri = this.normalizeUri(uri);
		const file = this.files.get(normalizedUri);
		if (!file) {
			return undefined;
		}
		return {
			type: FileType.File,
			size: file.text.length,
			mtime: file.mtimeMs,
			ctime: file.mtimeMs,
		};
	}

	/**
	 * Read directory contents. Returns empty array for in-memory filesystem.
	 */
	async readDirectory(_uri: URI): Promise<[string, FileType][]> {
		return [];
	}
}
