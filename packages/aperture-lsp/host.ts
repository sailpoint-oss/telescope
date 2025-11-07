import type { ReadResult, VfsHost } from "host";
import { NodeHost } from "host";
import type { OpenApiDocumentStore } from "./documents.js";

export function createSnapshotHost(
	store: OpenApiDocumentStore,
	fallback: VfsHost = new NodeHost(),
): VfsHost {
	return new SnapshotHost(store, fallback);
}

class SnapshotHost implements VfsHost {
	constructor(
		private readonly store: OpenApiDocumentStore,
		private readonly fallback: VfsHost,
	) {}

	async read(uri: string): Promise<ReadResult> {
		const cached = this.store.asReadResult(uri);
		if (cached) {
			return cached;
		}
		return this.fallback.read(uri);
	}

	async exists(uri: string): Promise<boolean> {
		if (this.store.get(uri)) {
			return true;
		}
		return this.fallback.exists(uri);
	}

	async glob(patterns: string[]): Promise<string[]> {
		return this.fallback.glob(patterns);
	}

	watch(uris: string[], onChange: (uri: string) => void): () => void {
		// Wrap onChange to update store when files change
		const wrappedOnChange = (uri: string) => {
			// Invalidate store entry when file changes
			this.store.delete(uri);
			onChange(uri);
		};
		return this.fallback.watch(uris, wrappedOnChange);
	}

	resolve(fromUri: string, ref: string): string {
		return this.fallback.resolve(fromUri, ref);
	}

	onFileChange(uri: string, callback: () => void): () => void {
		// If fallback supports file change events, use it
		if (this.fallback.onFileChange) {
			return this.fallback.onFileChange(uri, () => {
				// Invalidate store entry when file changes
				this.store.delete(uri);
				callback();
			});
		}
		// Otherwise, no-op unsubscribe
		return () => undefined;
	}
}
