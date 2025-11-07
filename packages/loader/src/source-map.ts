import type { Range, SourceMap } from "./types";

export class MutableSourceMap implements SourceMap {
	private readonly pointerToRangeMap = new Map<string, Range>();
	private readonly rangeKeyToPointer = new Map<string, string>();

	set(pointer: string, range: Range) {
		this.pointerToRangeMap.set(pointer, range);
		this.rangeKeyToPointer.set(this.serializeRange(range), pointer);
	}

	pointerToRange(pointer: string): Range | null {
		return this.pointerToRangeMap.get(pointer) ?? null;
	}

	rangeToPointer(range: Range): string | null {
		return this.rangeKeyToPointer.get(this.serializeRange(range)) ?? null;
	}

	private serializeRange(range: Range): string {
		return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
	}
}
