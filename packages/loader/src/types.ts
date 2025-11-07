import type { OpenAPI } from "blueprint";

export type DocumentFormat = "yaml" | "json";

export interface Position {
	line: number;
	character: number;
}

export interface Range {
	start: Position;
	end: Position;
}

export interface SourceMap {
	pointerToRange(pointer: string): Range | null;
	rangeToPointer(range: Range): string | null;
}

export interface ParsedDocument {
	uri: string;
	format: DocumentFormat;
	version: string;
	ast: OpenAPI | Record<string, unknown> | unknown;
	sourceMap: SourceMap;
	rawText: string;
	hash: string;
	mtimeMs: number;
}
