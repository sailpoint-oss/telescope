import { readFile } from "node:fs/promises";
import { join } from "node:path";

type SpecVersion = "2.0" | "3.0.4" | "3.1.2" | "3.2.0";

const SPEC_FILES: Record<SpecVersion, string> = {
	"2.0": "specifications/2.0.md",
	"3.0.4": "specifications/3.0.4.md",
	"3.1.2": "specifications/3.1.2.md",
	"3.2.0": "specifications/3.2.0.md",
};

function collectAnchors(markdown: string): Set<string> {
	const anchors = new Set<string>();

	// Common pattern in your markdown exports:
	// <a name="paths-object"></a>
	const re = /<a\s+name="([^"]+)"\s*><\/a>/g;
	for (const m of markdown.matchAll(re)) {
		if (m[1]) anchors.add(m[1]);
	}

	// Also collect markdown heading anchors (best-effort). This is not exact, but helpful.
	const headingRe = /^(#{1,6})\s+(.+?)\s*$/gm;
	for (const m of markdown.matchAll(headingRe)) {
		const raw = m[2]?.trim();
		if (!raw) continue;
		const slug = raw
			.toLowerCase()
			.replace(/[`"'().,:/\\]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-");
		if (slug) anchors.add(slug);
	}

	return anchors;
}

async function main() {
	const cwd = process.cwd();
	const results: Record<string, number> = {};

	for (const [ver, rel] of Object.entries(SPEC_FILES)) {
		// script runs from `packages/telescope-server/`; specs live at repo root.
		const path = join(cwd, "..", "..", rel);
		const md = await readFile(path, "utf8");
		const anchors = collectAnchors(md);
		results[ver] = anchors.size;
	}

	// For now, this just prints counts; later we’ll wire it to validate schema meta anchors.
	// This is intentionally lightweight and non-opinionated.
	console.log(JSON.stringify(results, null, 2));
}

await main();


