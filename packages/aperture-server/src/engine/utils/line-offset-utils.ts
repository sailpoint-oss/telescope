/**
 * Line Offset Utilities
 *
 * This module provides utilities for converting byte offsets to line/column
 * positions in text documents. This is essential for mapping IR locations
 * (which use byte offsets) to LSP ranges (which use line/character positions).
 *
 * The approach:
 * 1. Build a line offset cache once per document (buildLineOffsets)
 * 2. Use binary search to efficiently convert offsets to positions (getLineCol)
 * 3. Incrementally patch line offsets when document changes (patchLineOffsets)
 *
 * @module utils/line-offset-utils
 *
 * @example
 * ```typescript
 * import { buildLineOffsets, getLineCol, patchLineOffsets } from "aperture-server";
 *
 * const text = "line1\nline2\nline3";
 * const offsets = buildLineOffsets(text);
 * // [0, 6, 12] - byte offsets where each line starts
 *
 * const pos = getLineCol(8, offsets);
 * // { line: 2, col: 3 } - 1-indexed line and column
 *
 * // After editing "line2" to "line2-modified"
 * patchLineOffsets(offsets, 6, 5, "line2-modified");
 * // offsets updated to [0, 6, 21]
 * ```
 */

/**
 * Build a line offset cache for efficient offset-to-line conversion.
 *
 * Scans the text for newline characters and records the byte offset
 * where each line starts. The first line always starts at offset 0.
 *
 * @param text - The text content to analyze
 * @returns Array of byte offsets where each line starts (0-indexed in array)
 *
 * @example
 * ```typescript
 * const text = "hello\nworld\n";
 * const offsets = buildLineOffsets(text);
 * // [0, 6, 12]
 * // Line 1 starts at offset 0 ("hello")
 * // Line 2 starts at offset 6 ("world")
 * // Line 3 starts at offset 12 (empty after trailing newline)
 * ```
 */
export function buildLineOffsets(text: string): number[] {
	const offsets: number[] = [0];
	let idx = text.indexOf("\n", 0);
	while (idx !== -1) {
		offsets.push(idx + 1);
		idx = text.indexOf("\n", idx + 1);
	}
	return offsets;
}

/**
 * Convert a byte offset to line/column position using a line offset cache.
 *
 * Uses binary search for O(log n) performance on large files.
 * Line and column are returned as 1-indexed values.
 *
 * @param offset - The byte offset in the text
 * @param lineOffsets - Array of line offsets from buildLineOffsets()
 * @returns Object with line (1-indexed) and col (1-indexed) properties
 *
 * @example
 * ```typescript
 * const text = "hello\nworld";
 * const offsets = buildLineOffsets(text);
 * // [0, 6]
 *
 * getLineCol(0, offsets);  // { line: 1, col: 1 } - start of "hello"
 * getLineCol(5, offsets);  // { line: 1, col: 6 } - end of "hello"
 * getLineCol(6, offsets);  // { line: 2, col: 1 } - start of "world"
 * getLineCol(8, offsets);  // { line: 2, col: 3 } - "r" in "world"
 * ```
 */
export function getLineCol(
	offset: number,
	lineOffsets: number[],
): { line: number; col: number } {
	let low = 0;
	let high = lineOffsets.length - 1;
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const currentLineOffset = lineOffsets[mid];
		const nextLineOffset = lineOffsets[mid + 1];

		if (currentLineOffset === undefined) {
			return { line: 1, col: offset + 1 };
		}

		if (currentLineOffset <= offset) {
			if (
				mid === lineOffsets.length - 1 ||
				(nextLineOffset !== undefined && nextLineOffset > offset)
			) {
				return { line: mid + 1, col: offset - currentLineOffset + 1 };
			}
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}
	return { line: 1, col: offset + 1 };
}

/**
 * Find the line index (0-indexed) that contains the given byte offset.
 * Uses binary search for O(log n) performance.
 *
 * @param lineOffsets - Array of line offsets from buildLineOffsets()
 * @param offset - The byte offset to locate
 * @returns The 0-indexed line number containing the offset
 *
 * @example
 * ```typescript
 * const offsets = [0, 6, 12]; // "hello\nworld\n"
 * findLineAtOffset(offsets, 0);  // 0 (first line)
 * findLineAtOffset(offsets, 5);  // 0 (end of first line)
 * findLineAtOffset(offsets, 6);  // 1 (start of second line)
 * findLineAtOffset(offsets, 8);  // 1 (middle of second line)
 * ```
 */
export function findLineAtOffset(lineOffsets: number[], offset: number): number {
	let low = 0;
	let high = lineOffsets.length - 1;

	while (low < high) {
		const mid = Math.floor((low + high + 1) / 2);
		const lineStart = lineOffsets[mid];

		if (lineStart === undefined || lineStart > offset) {
			high = mid - 1;
		} else {
			low = mid;
		}
	}

	return low;
}

/**
 * Incrementally patch a line offsets array after a text change.
 * This is more efficient than rebuilding the entire array for small changes.
 *
 * @param offsets - The line offsets array to patch (mutated in place)
 * @param changeStart - Byte offset where the change starts
 * @param oldLength - Length of the text that was replaced
 * @param newText - The new text that was inserted
 *
 * @example
 * ```typescript
 * const offsets = [0, 6, 12]; // "hello\nworld\n"
 *
 * // Replace "world" (offsets 6-10) with "everyone"
 * patchLineOffsets(offsets, 6, 5, "everyone");
 * // offsets is now [0, 6, 15]
 *
 * // Insert a newline: replace "" at offset 3 with "\n"
 * const offsets2 = [0, 6];
 * patchLineOffsets(offsets2, 3, 0, "\n");
 * // offsets2 is now [0, 4, 7]
 * ```
 */
export function patchLineOffsets(
	offsets: number[],
	changeStart: number,
	oldLength: number,
	newText: string,
): void {
	const delta = newText.length - oldLength;
	const changeEnd = changeStart + oldLength;

	// Find the line where the change starts
	const firstAffectedLine = findLineAtOffset(offsets, changeStart);

	// Count newlines in the old region (lines that will be removed)
	// These are lines whose start offset is > changeStart and <= changeEnd
	let oldNewlineCount = 0;
	for (let i = firstAffectedLine + 1; i < offsets.length; i++) {
		const lineStart = offsets[i];
		if (lineStart === undefined) break;
		if (lineStart > changeEnd) break;
		oldNewlineCount++;
	}

	// Find newlines in the new text and compute their absolute offsets
	const newLineOffsets: number[] = [];
	let searchIdx = 0;
	while (searchIdx < newText.length) {
		const newlineIdx = newText.indexOf("\n", searchIdx);
		if (newlineIdx === -1) break;
		// Absolute offset = changeStart + position in newText + 1 (for the char after newline)
		newLineOffsets.push(changeStart + newlineIdx + 1);
		searchIdx = newlineIdx + 1;
	}

	// Remove old lines that were in the changed region
	// and insert new line offsets
	offsets.splice(firstAffectedLine + 1, oldNewlineCount, ...newLineOffsets);

	// Shift all subsequent line offsets by delta
	const shiftStartIdx = firstAffectedLine + 1 + newLineOffsets.length;
	for (let i = shiftStartIdx; i < offsets.length; i++) {
		const offset = offsets[i];
		if (offset !== undefined) {
			offsets[i] = offset + delta;
		}
	}
}
