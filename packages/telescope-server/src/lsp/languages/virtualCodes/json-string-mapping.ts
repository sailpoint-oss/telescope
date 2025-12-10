/**
 * JSON String Mapping Utilities
 *
 * Provides bidirectional position mapping between JSON-escaped source text
 * and decoded content. This is essential for providing accurate LSP features
 * (hover, completion, diagnostics) for markdown content embedded in JSON strings.
 *
 * JSON escape sequences handled:
 * - \n (newline) - 2 source chars → 1 decoded char
 * - \t (tab) - 2 source chars → 1 decoded char
 * - \r (carriage return) - 2 source chars → 1 decoded char
 * - \\ (backslash) - 2 source chars → 1 decoded char
 * - \" (quote) - 2 source chars → 1 decoded char
 * - \/ (forward slash) - 2 source chars → 1 decoded char
 * - \b (backspace) - 2 source chars → 1 decoded char
 * - \f (form feed) - 2 source chars → 1 decoded char
 * - \uXXXX (unicode) - 6 source chars → 1 decoded char
 *
 * @module lsp/languages/virtualCodes/json-string-mapping
 */

import type { Position, Range } from "vscode-languageserver-protocol";

/**
 * Represents a mapping between a JSON string in source and its decoded content.
 */
export interface JsonStringMapping {
	/** Start offset in JSON source (after opening quote) */
	sourceStart: number;
	/** Length in source bytes (includes escape sequences, excludes quotes) */
	sourceLength: number;
	/** The decoded markdown string content */
	decodedContent: string;
	/** Pre-computed position map for efficient lookups */
	positionMap: PositionMapEntry[];
}

/**
 * An entry in the position map that tracks the relationship between
 * source and decoded positions at escape sequence boundaries.
 */
interface PositionMapEntry {
	/** Offset in source (relative to sourceStart) */
	sourceOffset: number;
	/** Offset in decoded content */
	decodedOffset: number;
}

/**
 * Build a JsonStringMapping from source text.
 *
 * @param sourceText - The full source document text
 * @param sourceStart - Start offset in source (after opening quote)
 * @param sourceLength - Length of the string content in source (excluding quotes)
 * @returns A JsonStringMapping with pre-computed position map
 */
export function buildJsonStringMapping(
	sourceText: string,
	sourceStart: number,
	sourceLength: number,
): JsonStringMapping {
	const positionMap: PositionMapEntry[] = [];
	let sourceOffset = 0;
	let decodedOffset = 0;
	const decodedChars: string[] = [];

	// Always start with a mapping at position 0
	positionMap.push({ sourceOffset: 0, decodedOffset: 0 });

	while (sourceOffset < sourceLength) {
		const char = sourceText[sourceStart + sourceOffset];
		if (!char) continue;

		if (char === "\\") {
			// Escape sequence
			const nextChar = sourceText[sourceStart + sourceOffset + 1];

			if (nextChar === "u") {
				// Unicode escape: \uXXXX (6 source chars → 1 decoded char)
				const hex = sourceText.slice(
					sourceStart + sourceOffset + 2,
					sourceStart + sourceOffset + 6,
				);
				const codePoint = Number.parseInt(hex, 16);
				if (!Number.isNaN(codePoint)) {
					decodedChars.push(String.fromCharCode(codePoint));
				}
				sourceOffset += 6;
			} else {
				// Standard escape: 2 source chars → 1 decoded char
				const decoded = decodeEscapeChar(nextChar);
				decodedChars.push(decoded);
				sourceOffset += 2;
			}

			decodedOffset++;

			// Record boundary after escape sequence
			positionMap.push({ sourceOffset, decodedOffset });
		} else {
			// Regular character: 1:1 mapping
			decodedChars.push(char);
			sourceOffset++;
			decodedOffset++;
		}
	}

	return {
		sourceStart,
		sourceLength,
		decodedContent: decodedChars.join(""),
		positionMap,
	};
}

/**
 * Decode a single escape character.
 */
function decodeEscapeChar(char: string | undefined): string {
	switch (char) {
		case "n":
			return "\n";
		case "t":
			return "\t";
		case "r":
			return "\r";
		case "b":
			return "\b";
		case "f":
			return "\f";
		case "\\":
			return "\\";
		case '"':
			return '"';
		case "/":
			return "/";
		default:
			// Unknown escape - return as-is
			return char ?? "";
	}
}

/**
 * Convert a source offset to a decoded offset.
 *
 * @param mapping - The JSON string mapping
 * @param sourceOffset - Offset in source (relative to sourceStart)
 * @returns Corresponding offset in decoded content
 */
export function sourceToDecoded(
	mapping: JsonStringMapping,
	sourceOffset: number,
): number {
	// Clamp to valid range
	if (sourceOffset <= 0) return 0;
	if (sourceOffset >= mapping.sourceLength)
		return mapping.decodedContent.length;

	// Binary search for the closest position map entry
	const { positionMap } = mapping;
	let low = 0;
	let high = positionMap.length - 1;

	while (low < high) {
		const mid = Math.floor((low + high + 1) / 2);
		const entry = positionMap[mid];
		if (!entry) break;

		if (entry.sourceOffset <= sourceOffset) {
			low = mid;
		} else {
			high = mid - 1;
		}
	}

	const entry = positionMap[low];
	if (!entry) return 0;

	// Calculate offset from the found entry
	// Between entries, source and decoded advance 1:1
	const sourceFromEntry = sourceOffset - entry.sourceOffset;
	return entry.decodedOffset + sourceFromEntry;
}

/**
 * Convert a decoded offset to a source offset.
 *
 * @param mapping - The JSON string mapping
 * @param decodedOffset - Offset in decoded content
 * @returns Corresponding offset in source (relative to sourceStart)
 */
export function decodedToSource(
	mapping: JsonStringMapping,
	decodedOffset: number,
): number {
	// Clamp to valid range
	if (decodedOffset <= 0) return 0;
	if (decodedOffset >= mapping.decodedContent.length)
		return mapping.sourceLength;

	// Binary search for the closest position map entry
	const { positionMap } = mapping;
	let low = 0;
	let high = positionMap.length - 1;

	while (low < high) {
		const mid = Math.floor((low + high + 1) / 2);
		const entry = positionMap[mid];
		if (!entry) break;

		if (entry.decodedOffset <= decodedOffset) {
			low = mid;
		} else {
			high = mid - 1;
		}
	}

	const entry = positionMap[low];
	if (!entry) return 0;

	// Calculate offset from the found entry
	const decodedFromEntry = decodedOffset - entry.decodedOffset;
	return entry.sourceOffset + decodedFromEntry;
}

/**
 * Convert a decoded range to a source range.
 *
 * @param mapping - The JSON string mapping
 * @param startDecoded - Start offset in decoded content
 * @param endDecoded - End offset in decoded content
 * @returns Source range { start, end } relative to sourceStart
 */
export function decodedRangeToSource(
	mapping: JsonStringMapping,
	startDecoded: number,
	endDecoded: number,
): { start: number; end: number } {
	return {
		start: decodedToSource(mapping, startDecoded),
		end: decodedToSource(mapping, endDecoded),
	};
}

/**
 * Convert a source range to a decoded range.
 *
 * @param mapping - The JSON string mapping
 * @param startSource - Start offset in source (relative to sourceStart)
 * @param endSource - End offset in source (relative to sourceStart)
 * @returns Decoded range { start, end }
 */
export function sourceRangeToDecoded(
	mapping: JsonStringMapping,
	startSource: number,
	endSource: number,
): { start: number; end: number } {
	return {
		start: sourceToDecoded(mapping, startSource),
		end: sourceToDecoded(mapping, endSource),
	};
}

/**
 * Encode a string for use in a JSON string value.
 * This is the inverse of JSON.parse for string contents.
 *
 * @param decoded - The decoded string content
 * @returns JSON-escaped string (without surrounding quotes)
 */
export function jsonStringEncode(decoded: string): string {
	let result = "";
	for (const char of decoded) {
		switch (char) {
			case "\n":
				result += "\\n";
				break;
			case "\t":
				result += "\\t";
				break;
			case "\r":
				result += "\\r";
				break;
			case "\b":
				result += "\\b";
				break;
			case "\f":
				result += "\\f";
				break;
			case "\\":
				result += "\\\\";
				break;
			case '"':
				result += '\\"';
				break;
			default: {
				const code = char.charCodeAt(0);
				// Escape control characters
				if (code < 0x20) {
					result += `\\u${code.toString(16).padStart(4, "0")}`;
				} else {
					result += char;
				}
			}
		}
	}
	return result;
}

/**
 * Convert line/character Position in decoded content to source Position.
 * Requires line offset information from the source document.
 *
 * @param mapping - The JSON string mapping
 * @param decodedPosition - Position in decoded content (line/character)
 * @param decodedLineOffsets - Line offsets for the decoded content
 * @param sourceLineOffsets - Line offsets for the source document
 * @returns Position in source document
 */
export function decodedPositionToSource(
	mapping: JsonStringMapping,
	decodedPosition: Position,
	decodedLineOffsets: number[],
	sourceLineOffsets: number[],
): Position {
	// Convert decoded Position to decoded offset
	const decodedLineStart = decodedLineOffsets[decodedPosition.line] ?? 0;
	const decodedOffset = decodedLineStart + decodedPosition.character;

	// Convert to source offset (relative to sourceStart)
	const sourceOffsetRelative = decodedToSource(mapping, decodedOffset);

	// Convert to absolute source offset
	const sourceOffsetAbsolute = mapping.sourceStart + sourceOffsetRelative;

	// Convert source offset to Position
	return offsetToPosition(sourceOffsetAbsolute, sourceLineOffsets);
}

/**
 * Convert source Position to decoded Position.
 *
 * @param mapping - The JSON string mapping
 * @param sourcePosition - Position in source document
 * @param sourceLineOffsets - Line offsets for the source document
 * @param decodedLineOffsets - Line offsets for the decoded content
 * @returns Position in decoded content
 */
export function sourcePositionToDecoded(
	mapping: JsonStringMapping,
	sourcePosition: Position,
	sourceLineOffsets: number[],
	decodedLineOffsets: number[],
): Position {
	// Convert source Position to source offset
	const sourceLineStart = sourceLineOffsets[sourcePosition.line] ?? 0;
	const sourceOffsetAbsolute = sourceLineStart + sourcePosition.character;

	// Convert to relative offset
	const sourceOffsetRelative = sourceOffsetAbsolute - mapping.sourceStart;

	// Clamp to valid range
	if (sourceOffsetRelative < 0) {
		return { line: 0, character: 0 };
	}
	if (sourceOffsetRelative > mapping.sourceLength) {
		const lastLine = decodedLineOffsets.length - 1;
		const lastLineStart = decodedLineOffsets[lastLine] ?? 0;
		return {
			line: lastLine,
			character: mapping.decodedContent.length - lastLineStart,
		};
	}

	// Convert to decoded offset
	const decodedOffset = sourceToDecoded(mapping, sourceOffsetRelative);

	// Convert decoded offset to Position
	return offsetToPosition(decodedOffset, decodedLineOffsets);
}

/**
 * Convert a decoded Range to source Range.
 *
 * @param mapping - The JSON string mapping
 * @param decodedRange - Range in decoded content
 * @param decodedLineOffsets - Line offsets for decoded content
 * @param sourceLineOffsets - Line offsets for source document
 * @returns Range in source document
 */
export function decodedRangeToSourceRange(
	mapping: JsonStringMapping,
	decodedRange: Range,
	decodedLineOffsets: number[],
	sourceLineOffsets: number[],
): Range {
	return {
		start: decodedPositionToSource(
			mapping,
			decodedRange.start,
			decodedLineOffsets,
			sourceLineOffsets,
		),
		end: decodedPositionToSource(
			mapping,
			decodedRange.end,
			decodedLineOffsets,
			sourceLineOffsets,
		),
	};
}

/**
 * Convert an offset to a Position using line offsets.
 */
function offsetToPosition(offset: number, lineOffsets: number[]): Position {
	// Binary search for the line
	let low = 0;
	let high = lineOffsets.length - 1;

	while (low < high) {
		const mid = Math.floor((low + high + 1) / 2);
		const lineStart = lineOffsets[mid];
		if (lineStart === undefined) break;

		if (lineStart <= offset) {
			low = mid;
		} else {
			high = mid - 1;
		}
	}

	const lineStart = lineOffsets[low] ?? 0;
	return {
		line: low,
		character: offset - lineStart,
	};
}

/**
 * Build line offsets array for a string.
 * Line 0 starts at offset 0, subsequent lines start after each newline.
 *
 * @param text - The text to analyze
 * @returns Array where index is line number and value is start offset
 */
export function buildLineOffsets(text: string): number[] {
	const offsets: number[] = [0];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === "\n") {
			offsets.push(i + 1);
		}
	}
	return offsets;
}
