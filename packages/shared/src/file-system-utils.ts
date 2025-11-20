import type { FileSystem } from "@volar/language-service";
import { FileType } from "@volar/language-service";
import { URI } from "vscode-uri";

/**
 * Check if a file exists using Volar's FileSystem.
 *
 * @param fileSystem - Volar FileSystem instance
 * @param uri - The URI to check (fragments will be stripped for file operations)
 * @returns true if the file exists, false otherwise
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
 * Read a file using Volar's FileSystem and return text with metadata.
 *
 * @param fileSystem - Volar FileSystem instance
 * @param uri - The URI to read (fragments will be stripped for file operations)
 * @returns Object with text, mtimeMs, and hash, or undefined if file doesn't exist
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
 * Uses Volar's FileSystem.readDirectory for efficient traversal.
 *
 * @param fileSystem - Volar FileSystem instance
 * @param dirUri - The directory URI to start from
 * @param extension - File extension to match (e.g., ".yaml", ".json")
 * @param results - Array to collect matching file URIs
 * @param visited - Set of visited directory URIs to prevent cycles
 * @param maxDepth - Maximum directory depth to traverse
 * @param currentDepth - Current depth in traversal
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
 * Glob-like function using Volar's FileSystem.
 * Finds files matching glob patterns (e.g., recursive patterns for .yaml, .yml, .json files).
 *
 * @param fileSystem - Volar FileSystem instance
 * @param patterns - Array of glob patterns
 * @param workspaceFolders - Array of workspace folder URIs to search in
 * @param shouldProcessFile - Optional callback to filter files
 * @returns Array of matching file URIs
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
 * Implements Volar's FileSystem interface for use in tests and validation scenarios.
 */
export class MemoryFileSystem implements FileSystem {
	private files = new Map<string, { text: string; mtimeMs: number }>();

	/**
	 * Normalize URI by stripping fragment (consistent with Volar FileSystem behavior).
	 * Fragments are document-level, not file-level.
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
	 */
	addFile(uri: string, text: string, mtimeMs: number = Date.now()): void {
		// Normalize URI (strip fragment) when storing files
		const normalizedUri = this.normalizeUri(uri);
		this.files.set(normalizedUri, { text, mtimeMs });
	}

	async readFile(uri: URI): Promise<string | undefined> {
		// Normalize URI (strip fragment) when reading files
		const normalizedUri = this.normalizeUri(uri);
		const file = this.files.get(normalizedUri);
		return file?.text;
	}

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

	async readDirectory(_uri: URI): Promise<[string, FileType][]> {
		return [];
	}
}

