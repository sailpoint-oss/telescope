import { describe, expect, it } from "bun:test";
import crypto from "node:crypto";

import { buildRefGraph } from "./ref-graph";
import type { VfsHost, ReadResult } from "host";
import { loadDocument } from "loader";

import { buildIndex } from "./index";

class MemoryHost implements VfsHost {
	private files = new Map<string, { text: string; mtimeMs: number }>();

	addFile(uri: string, text: string, mtimeMs: number = Date.now()): void {
		this.files.set(uri, { text, mtimeMs });
	}

	async read(uri: string): Promise<ReadResult> {
		const file = this.files.get(uri);
		if (!file) {
			throw new Error(`File not found: ${uri}`);
		}
		return {
			text: file.text,
			mtimeMs: file.mtimeMs,
			hash: crypto.createHash("sha1").update(file.text).digest("hex"),
		};
	}

	async exists(uri: string): Promise<boolean> {
		return this.files.has(uri);
	}

	async glob(_patterns: string[]): Promise<string[]> {
		return Array.from(this.files.keys());
	}

	watch(_uris: string[], _onChange: (uri: string) => void): () => void {
		return () => undefined;
	}

	resolve(fromUri: string, ref: string): string {
		if (/^https?:/i.test(ref)) {
			return ref;
		}
		const base = fromUri.replace(/[^/]*$/, "");
		return base + ref.replace(/^\.\//, "");
	}
}

describe("buildIndex - example fragments", () => {
	it("indexes standalone example documents", async () => {
		const host = new MemoryHost();
		const uri = "file:///examples/pet-example.yaml";
		host.addFile(
			uri,
			`summary: Small pet example\ndescription: Sample example fragment\nvalue:\n  id: 123\n  status: available\n`,
		);

		const doc = await loadDocument({ host, uri });
		const docs = new Map([[uri, doc]]);
		const { graph, resolver } = buildRefGraph({ docs, host });
		const index = buildIndex({ docs, graph, resolver });

		const exampleKey = `${uri}##`;
		const exampleRef = index.examples.get(exampleKey);
		expect(exampleRef).toBeDefined();
		expect(exampleRef?.pointer).toBe("#");
		expect(exampleRef?.node).toHaveProperty("value");
	});
});

