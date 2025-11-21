import type {
	CodeMapping,
	IScriptSnapshot,
	VirtualCode,
} from "@volar/language-core";
import * as jsonc from "jsonc-parser";
import * as yaml from "yaml";
import type { ParsedContent } from "../../types.js";

export class UniversalVirtualCode implements VirtualCode, ParsedContent {
	id: string;
	languageId: string;
	mappings: CodeMapping[] = [];
	parsedObject: unknown;
	ast: unknown;
	embeddedCodes = [];

	constructor(
		public snapshot: IScriptSnapshot,
		public type: "json" | "yaml",
	) {
		this.id = type;
		this.languageId = type;
		this.update(this.snapshot);
	}

	update(newSnapshot: IScriptSnapshot) {
		this.snapshot = newSnapshot;
		const text = newSnapshot.getText(0, newSnapshot.getLength());

		if (this.type === "json") {
			try {
				this.parsedObject = jsonc.parse(text);
				this.ast = jsonc.parseTree(text);
			} catch {
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
