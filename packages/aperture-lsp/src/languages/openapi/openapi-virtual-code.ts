import type {
	CodeMapping,
	IScriptSnapshot,
	VirtualCode,
} from "@volar/language-core";
import * as jsonc from "jsonc-parser";
import * as yaml from "yaml";
import type { ParsedContent } from "../../types.js";

let warnedInvalidEmbeddedId = false;

function normalizeEmbeddedId(id: string): string {
	const cleaned = id.replace(/#.*/u, "").toLowerCase();
	if (!warnedInvalidEmbeddedId && (id.includes("#") || id !== cleaned)) {
		warnedInvalidEmbeddedId = true;
	}
	return cleaned;
}

export class OpenAPIVirtualCode implements VirtualCode, ParsedContent {
	id = normalizeEmbeddedId("openapi");
	languageId = "openapi";
	mappings: CodeMapping[] = [];
	parsedObject: unknown;
	ast: unknown;
	embeddedCodes = [];

	constructor(
		public snapshot: IScriptSnapshot,
		public type: "json" | "yaml",
	) {
		this.update(this.snapshot);
	}

	update(newSnapshot: IScriptSnapshot) {
		this.snapshot = newSnapshot;
		const text = newSnapshot.getText(0, newSnapshot.getLength());

		// 1. Parse based on type
		if (this.type === "json") {
			try {
				this.parsedObject = JSON.parse(text);
				this.ast = jsonc.parseTree(text);
			} catch {
				// If JSON parse fails, we might want to gracefully handle it
				// but for now we let it throw or set to undefined so validation can handle it
				this.parsedObject = undefined;
				this.ast = undefined;
			}
		} else {
			// YAML
			try {
				const lineCounter = new yaml.LineCounter();
				const doc = yaml.parseDocument(text, { lineCounter });
				this.parsedObject = doc.toJS();
				this.ast = { doc, lineCounter };
			} catch {
				this.parsedObject = undefined;
				this.ast = undefined;
			}
		}

		// 2. Create Mappings (1:1 mapping for the whole file)
		this.mappings = [
			{
				sourceOffsets: [0],
				generatedOffsets: [0],
				lengths: [this.snapshot.getLength()],
				data: {
					verification: true,
					completion: true,
					navigation: true,
					semantic: true,
					structure: true,
					format: true,
				},
			},
		];
	}
}
