import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile, stat } from "node:fs/promises";
import crypto from "node:crypto";
import fg from "fast-glob";
import { watch, type WatchOptions, type FSWatcher } from "chokidar";
import type { ReadResult, VfsHost } from "./index";

interface NodeHostOptions {
	watchOptions?: WatchOptions;
}

export class NodeHost implements VfsHost {
	private readonly watchOptions: WatchOptions;

	constructor(options: NodeHostOptions = {}) {
		this.watchOptions = options.watchOptions ?? { ignoreInitial: true };
	}

	async read(uri: string): Promise<ReadResult> {
		const filePath = this.toFsPath(uri);
		const [text, fileStat] = await Promise.all([
			readFile(filePath, "utf8"),
			stat(filePath),
		]);
		return {
			text,
			mtimeMs: fileStat.mtimeMs,
			hash: crypto.createHash("sha1").update(text).digest("hex"),
		};
	}

	async exists(uri: string): Promise<boolean> {
		try {
			await stat(this.toFsPath(uri));
			return true;
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw error;
		}
	}

	async glob(patterns: string[]): Promise<string[]> {
		const results = await fg(patterns, { dot: false, absolute: true });
		return results.map((filePath) => this.toUri(filePath));
	}

	watch(uris: string[], onChange: (uri: string) => void): () => void {
		const watchers: FSWatcher[] = [];
		for (const uri of uris) {
			const fsPath = this.toFsPath(uri);
			const watcher = watch(fsPath, this.watchOptions).on("all", () => {
				onChange(uri);
			});
			watchers.push(watcher);
		}
		return () => {
			for (const watcher of watchers) {
				void watcher.close();
			}
		};
	}

	resolve(fromUri: string, ref: string): string {
		if (/^https?:/i.test(ref)) {
			return ref;
		}
		const basePath = dirname(this.toFsPath(fromUri));
		const resolved = resolvePath(basePath, ref);
		return this.toUri(resolved);
	}

	private toFsPath(uri: string): string {
		if (uri.startsWith("file://")) {
			return fileURLToPath(uri);
		}
		return uri;
	}

	private toUri(fsPath: string): string {
		if (fsPath.startsWith("file://")) {
			return fsPath;
		}
		return pathToFileURL(fsPath).toString();
	}
}
