import { promises as fs } from "node:fs";
import type { URI } from "vscode-uri";
import { type FileSystem, FileType } from "../fs-types.js";

/**
 * Node-backed FileSystem implementation for the engine.
 *
 * Designed for:
 * - LSP server usage (reading workspace files from disk)
 * - CLI/CI usage (GitHub Actions, headless runs)
 *
 * Notes:
 * - Only supports `file://` URIs.
 * - Callers should strip fragments; we defensively strip them anyway.
 */
export class NodeFileSystem implements FileSystem {
	private toFsPath(uri: URI): string | null {
		// Fragments are document-level, not file-level.
		const base = uri.with({ fragment: undefined });

		// Only support file URIs.
		if (base.scheme && base.scheme !== "file") {
			return null;
		}

		try {
			// vscode-uri's fsPath handles platform specifics.
			return base.fsPath;
		} catch {
			return null;
		}
	}

	async readFile(uri: URI): Promise<string | undefined> {
		const fsPath = this.toFsPath(uri);
		if (!fsPath) return undefined;

		try {
			return await fs.readFile(fsPath, "utf8");
		} catch (err) {
			if (isErrno(err, "ENOENT") || isErrno(err, "EISDIR")) {
				return undefined;
			}
			throw err;
		}
	}

	async readDirectory(uri: URI): Promise<[string, FileType][]> {
		const fsPath = this.toFsPath(uri);
		if (!fsPath) return [];

		try {
			const entries = await fs.readdir(fsPath, { withFileTypes: true });
			return entries.map((ent) => {
				const type = ent.isDirectory()
					? FileType.Directory
					: ent.isFile()
						? FileType.File
						: ent.isSymbolicLink()
							? FileType.SymbolicLink
							: FileType.Unknown;
				return [ent.name, type] as [string, FileType];
			});
		} catch (err) {
			if (isErrno(err, "ENOENT") || isErrno(err, "ENOTDIR")) {
				return [];
			}
			throw err;
		}
	}

	async stat(uri: URI): Promise<
		| {
				type: FileType;
				size?: number;
				mtime?: number;
				ctime?: number;
		  }
		| undefined
	> {
		const fsPath = this.toFsPath(uri);
		if (!fsPath) return undefined;

		try {
			const st = await fs.stat(fsPath);
			const type = st.isDirectory()
				? FileType.Directory
				: st.isFile()
					? FileType.File
					: st.isSymbolicLink()
						? FileType.SymbolicLink
						: FileType.Unknown;
			return {
				type,
				size: st.size,
				mtime: st.mtimeMs,
				ctime: st.ctimeMs,
			};
		} catch (err) {
			if (isErrno(err, "ENOENT")) {
				return undefined;
			}
			throw err;
		}
	}
}

function isErrno(err: unknown, code: string): boolean {
	if (!err || typeof err !== "object") return false;
	return "code" in err && (err as { code?: unknown }).code === code;
}
