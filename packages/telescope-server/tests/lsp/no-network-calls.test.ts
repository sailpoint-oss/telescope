import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import * as path from "node:path";

const LSP_SRC_DIR = path.join(import.meta.dir, "..", "..", "src", "lsp");

async function listTsFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const out: string[] = [];
	for (const ent of entries) {
		const full = path.join(dir, ent.name);
		if (ent.isDirectory()) {
			out.push(...(await listTsFiles(full)));
		} else if (ent.isFile() && ent.name.endsWith(".ts")) {
			out.push(full);
		}
	}
	return out;
}

test("LSP runtime must not perform network calls", async () => {
	const files = await listTsFiles(LSP_SRC_DIR);

	const offenders: Array<{ file: string; pattern: string }> = [];
	const forbiddenPatterns = [
		"fetch(",
		"http://127.0.0.1:7243/ingest",
		"https://127.0.0.1:7243/ingest",
	];

	for (const file of files) {
		const content = await readFile(file, "utf8");
		for (const pat of forbiddenPatterns) {
			if (content.includes(pat)) {
				offenders.push({ file, pattern: pat });
			}
		}
	}

	expect(offenders).toEqual([]);
});
