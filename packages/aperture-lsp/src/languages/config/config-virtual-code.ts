import type { CodeMapping, VirtualCode } from "@volar/language-core";
import type { IScriptSnapshot } from "typescript";
import { type Document, LineCounter, parseDocument } from "yaml";
import type { z } from "zod";
import type { TelescopeConfigSchema } from "../../services/config/config-schema.js";

export type TelescopeConfig = z.infer<typeof TelescopeConfigSchema>;

// We can optionally export other inferred types if needed, or let TS infer them.
// For now, we'll just reference TelescopeConfig.

export class ConfigVirtualCode implements VirtualCode {
	id = "root";
	// We use 'yaml' as the language ID so other YAML-aware tools can pick it up
	languageId = "yaml";
	mappings: CodeMapping[] = [];

	// Store the parsed document for the service plugin to reuse
	ast: Document | undefined;
	lineCounter: LineCounter | undefined;

	constructor(public snapshot: IScriptSnapshot) {
		this.update(snapshot);
	}

	update(newSnapshot: IScriptSnapshot) {
		this.snapshot = newSnapshot;
		const text = newSnapshot.getText(0, newSnapshot.getLength());

		// 1. Parse to AST with 'yaml' using LineCounter for precise location tracking
		this.lineCounter = new LineCounter();
		this.ast = parseDocument(text, { lineCounter: this.lineCounter });

		// 2. Create Mappings
		// Since we aren't transforming the code, we map 1:1.
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
