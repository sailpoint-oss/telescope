import crypto from "node:crypto";
import type { LanguageServer } from "@volar/language-server";
import type { Disposable, FileSystem } from "@volar/language-service";
import { FileType } from "@volar/language-service";
import type { ReadResult, VfsHost } from "host";
import { URI } from "vscode-uri";

/**
 * VfsHost implementation that uses Volar's fileSystem API.
 * This provides efficient file access through Volar's abstraction layer.
 */
export class VolarFileSystemHost implements VfsHost {
	private readonly fileChangeListeners = new Map<string, Set<() => void>>();
	private readonly fileWatcherDisposables = new Map<string, Disposable>();

	constructor(
		private readonly server: LanguageServer,
		private readonly fileSystem: FileSystem,
	) {}

	async read(uri: string): Promise<ReadResult> {
		const volarUri = URI.parse(uri);
		const text = await this.fileSystem.readFile(volarUri);
		if (text === undefined) {
			throw new Error(`File not found: ${uri}`);
		}

		const stat = await this.fileSystem.stat(volarUri);
		const mtimeMs = stat?.mtime ?? Date.now();

		return {
			text,
			mtimeMs,
			hash: crypto.createHash("sha1").update(text).digest("hex"),
		};
	}

	async exists(uri: string): Promise<boolean> {
		const volarUri = URI.parse(uri);
		const stat = await this.fileSystem.stat(volarUri);
		return stat !== undefined && stat.type === FileType.File;
	}

	async glob(patterns: string[]): Promise<string[]> {
		// Use Volar's fileSystem.readDirectory to walk directories
		// This is a simplified implementation - full glob pattern matching
		// would require more sophisticated pattern parsing
		const results: string[] = [];
		const visited = new Set<string>();

		// Start from workspace folders
		const workspaceFolders = this.server.workspaceFolders.all;
		if (workspaceFolders.length === 0) {
			return results;
		}

		// For each pattern, try to match against files in workspace
		for (const pattern of patterns) {
			// Simple pattern matching - support **/*.yaml, **/*.yml, **/*.json
			const extensionMatch = pattern.match(/\.(yaml|yml|json)$/);
			if (!extensionMatch) {
				continue;
			}

			const extension = extensionMatch[0];

			// Walk each workspace folder
			for (const folderUri of workspaceFolders) {
				await this.walkDirectory(folderUri, extension, results, visited);
			}
		}

		return results;
	}

	private async walkDirectory(
		dirUri: URI,
		extension: string,
		results: string[],
		visited: Set<string>,
		maxDepth: number = 10,
		currentDepth: number = 0,
	): Promise<void> {
		if (currentDepth >= maxDepth || visited.has(dirUri.toString())) {
			return;
		}

		visited.add(dirUri.toString());

		try {
			const entries = await this.fileSystem.readDirectory(dirUri);
			if (!entries) {
				return;
			}

			for (const [name, fileType] of entries) {
				const childUri = dirUri.with({
					path: `${dirUri.path}/${name}`.replace(/\/+/g, "/"),
				});

				if (fileType === FileType.Directory) {
					// Skip common directories
					if (
						name.startsWith(".") ||
						name === "node_modules" ||
						name === ".git" ||
						name === "dist" ||
						name === "build"
					) {
						continue;
					}
					await this.walkDirectory(
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

	watch(uris: string[], onChange: (uri: string) => void): () => void {
		const disposables: Disposable[] = [];

		// Use Volar's file watcher
		const unsubscribe = this.server.fileWatcher.onDidChangeWatchedFiles(
			(event) => {
				for (const change of event.changes) {
					const changeUri = change.uri.toString();
					if (uris.includes(changeUri)) {
						onChange(changeUri);
					}
				}
			},
		);

		disposables.push(unsubscribe);

		return () => {
			for (const disposable of disposables) {
				disposable.dispose();
			}
		};
	}

	resolve(fromUri: string, ref: string): string {
		if (/^https?:/i.test(ref)) {
			return ref;
		}

		const baseUri = URI.parse(fromUri);
		const baseDir = baseUri.with({
			path: baseUri.path.split("/").slice(0, -1).join("/"),
		});
		const resolvedPath = ref.startsWith("/")
			? ref
			: `${baseDir.path}/${ref}`.replace(/\/+/g, "/");
		const resolvedUri = baseUri.with({ path: resolvedPath });
		return resolvedUri.toString();
	}

	onFileChange(uri: string, callback: () => void): () => void {
		let listeners = this.fileChangeListeners.get(uri);
		if (!listeners) {
			listeners = new Set();
			this.fileChangeListeners.set(uri, listeners);

			// Subscribe to Volar's file watcher for this URI
			const unsubscribe = this.server.fileWatcher.onDidChangeWatchedFiles(
				(event) => {
					for (const change of event.changes) {
						if (change.uri.toString() === uri) {
							// Notify all listeners
							for (const listener of listeners ?? []) {
								listener();
							}
						}
					}
				},
			);

			this.fileWatcherDisposables.set(uri, unsubscribe);
		}

		listeners.add(callback);

		return () => {
			listeners?.delete(callback);
			if (listeners?.size === 0) {
				this.fileChangeListeners.delete(uri);
				this.fileWatcherDisposables.get(uri)?.dispose();
				this.fileWatcherDisposables.delete(uri);
			}
		};
	}
}
