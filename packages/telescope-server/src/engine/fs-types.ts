/**
 * File System Types
 *
 * These types provide a minimal file system abstraction that was previously
 * imported from Volar. This allows the engine to work independently of Volar.
 *
 * @module engine/fs-types
 */

import type { URI } from "vscode-uri";

/**
 * File type enumeration (matches Volar's FileType).
 */
export const FileType = {
	Unknown: 0,
	File: 1,
	Directory: 2,
	SymbolicLink: 64,
} as const;

export type FileType = (typeof FileType)[keyof typeof FileType];

/**
 * File system interface for reading files and directories.
 * Compatible with Volar's FileSystem interface.
 */
export interface FileSystem {
	/**
	 * Read a file's contents.
	 * @param uri - The file URI
	 * @returns The file contents as a string, or undefined if not found
	 */
	readFile(uri: URI): Promise<string | undefined>;

	/**
	 * Read a directory's contents.
	 * @param uri - The directory URI
	 * @returns Array of [name, type] tuples
	 */
	readDirectory(uri: URI): Promise<[string, FileType][]>;

	/**
	 * Get file/directory stats.
	 * @param uri - The file or directory URI
	 * @returns Stats object with type, or undefined if not found
	 */
	stat(uri: URI): Promise<
		| {
				type: FileType;
				/** Optional size in bytes (for files) */
				size?: number;
				/** Optional modified time in ms since epoch */
				mtime?: number;
				/** Optional created time in ms since epoch */
				ctime?: number;
		  }
		| undefined
	>;
}

/**
 * Cancellation token interface (matches LSP/Volar).
 */
export interface CancellationToken {
	/**
	 * Whether cancellation has been requested.
	 */
	readonly isCancellationRequested: boolean;

	/**
	 * Event fired when cancellation is requested.
	 */
	onCancellationRequested?: (callback: () => void) => void;
}
