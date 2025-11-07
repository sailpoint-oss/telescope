export interface ReadResult {
	text: string;
	mtimeMs: number;
	hash: string;
}

/**
 * Optional interface for VfsHost implementations that support file change events.
 * This allows cache invalidation and other optimizations.
 */
export interface FileChangeEmitter {
	/**
	 * Subscribe to file change events for a specific URI.
	 * Returns a function to unsubscribe.
	 * @param uri - The URI to watch for changes
	 * @param callback - Callback invoked when the file changes
	 * @returns Unsubscribe function
	 */
	onFileChange?(uri: string, callback: () => void): () => void;
}

export interface VfsHost extends Partial<FileChangeEmitter> {
	read(uri: string): Promise<ReadResult>;
	exists(uri: string): Promise<boolean>;
	glob(patterns: string[]): Promise<string[]>;
	watch(uris: string[], onChange: (uri: string) => void): () => void;
	resolve(fromUri: string, ref: string): string;
}

export { NodeHost } from "./node-host";
export { LspHost } from "./lsp-host";
export { CachedVfsHost } from "./cached-host";
