import crypto from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import type { TextDocuments } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import type { ReadResult, VfsHost } from "./index";

export class LspHost implements VfsHost {
	constructor(private readonly documents: TextDocuments<TextDocument>) {}

	async read(uri: string): Promise<ReadResult> {
		const doc = this.documents.get(uri);
		if (doc) {
			const text = doc.getText();
			return {
				text,
				mtimeMs: doc.version,
				hash: crypto.createHash("sha1").update(text).digest("hex"),
			};
		}

		const filePath = URI.parse(uri).fsPath;
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
		if (this.documents.get(uri)) return true;
		try {
			await stat(URI.parse(uri).fsPath);
			return true;
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw error;
		}
	}

	async glob(_patterns: string[]): Promise<string[]> {
		// Glob support can be delegated to the CLI host; the LSP host relies on the
		// project graph built by the CLI host when the workspace was indexed.
		return [];
	}

	watch(_uris: string[], _onChange: (uri: string) => void): () => void {
		// Watching is handled by the VS Code client; no-op for now.
		return () => undefined;
	}

	resolve(fromUri: string, ref: string): string {
		if (/^https?:/i.test(ref)) return ref;
		const baseUri = URI.parse(fromUri);
		const basePath = baseUri.fsPath;
		const baseDir = dirname(basePath);
		const resolvedPath = resolvePath(baseDir, ref);
		const resolvedUri = URI.file(resolvedPath);
		return resolvedUri.toString();
	}
}
