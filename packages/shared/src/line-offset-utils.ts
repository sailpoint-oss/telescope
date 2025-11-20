/**
 * Line offset utilities for converting byte offsets to line/column positions.
 * Used for converting source positions to LSP ranges.
 */

/**
 * Build line offsets cache for efficient offset-to-line conversion.
 * Returns an array where each index represents a line number (1-indexed)
 * and the value is the byte offset where that line starts.
 *
 * @param text - The text content to analyze
 * @returns Array of byte offsets, one per line
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
 * Convert byte offset to line/column position using line offsets cache.
 *
 * @param offset - The byte offset in the text
 * @param lineOffsets - Array of line offsets from buildLineOffsets()
 * @returns Object with line (1-indexed) and col (1-indexed) properties
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

