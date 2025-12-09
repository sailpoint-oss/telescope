/**
 * Tests for JSON string mapping utilities.
 *
 * These utilities handle bidirectional position mapping between
 * JSON-escaped source text and decoded content.
 */

import { describe, expect, it } from "bun:test";
import {
	buildJsonStringMapping,
	buildLineOffsets,
	decodedRangeToSource,
	decodedToSource,
	jsonStringEncode,
	sourceRangeToDecoded,
	sourceToDecoded,
} from "../../src/lsp/languages/virtualCodes/json-string-mapping";

describe("buildJsonStringMapping", () => {
	it("handles simple string with no escapes", () => {
		const source = '"Hello World"';
		const mapping = buildJsonStringMapping(source, 1, 11); // Skip quotes

		expect(mapping.decodedContent).toBe("Hello World");
		expect(mapping.sourceLength).toBe(11);
	});

	it("handles newline escape sequence", () => {
		const source = '"Hello\\nWorld"';
		const mapping = buildJsonStringMapping(source, 1, 12);

		expect(mapping.decodedContent).toBe("Hello\nWorld");
		// Source: Hello\nWorld = 12 chars
		// Decoded: Hello + newline + World = 11 chars
		expect(mapping.sourceLength).toBe(12);
	});

	it("handles multiple escape sequences", () => {
		const source = '"Line1\\nLine2\\nLine3"';
		const mapping = buildJsonStringMapping(source, 1, 19);

		expect(mapping.decodedContent).toBe("Line1\nLine2\nLine3");
	});

	it("handles tab escape sequence", () => {
		const source = '"Hello\\tWorld"';
		const mapping = buildJsonStringMapping(source, 1, 12);

		expect(mapping.decodedContent).toBe("Hello\tWorld");
	});

	it("handles escaped quote", () => {
		const source = '"Say \\"Hello\\""';
		const mapping = buildJsonStringMapping(source, 1, 13);

		expect(mapping.decodedContent).toBe('Say "Hello"');
	});

	it("handles escaped backslash", () => {
		const source = '"Path\\\\to\\\\file"';
		const mapping = buildJsonStringMapping(source, 1, 14);

		expect(mapping.decodedContent).toBe("Path\\to\\file");
	});

	it("handles unicode escape sequence", () => {
		const source = '"Hello\\u0020World"';
		const mapping = buildJsonStringMapping(source, 1, 16);

		expect(mapping.decodedContent).toBe("Hello World");
	});

	it("handles mixed escape sequences", () => {
		const source = '"# Title\\n\\nParagraph with \\"quotes\\""';
		const mapping = buildJsonStringMapping(source, 1, 36);

		expect(mapping.decodedContent).toBe('# Title\n\nParagraph with "quotes"');
	});
});

describe("sourceToDecoded", () => {
	it("maps position before any escapes correctly", () => {
		const source = '"Hello\\nWorld"';
		const mapping = buildJsonStringMapping(source, 1, 12);

		// Position 0-4 are "Hello" - direct mapping
		expect(sourceToDecoded(mapping, 0)).toBe(0);
		expect(sourceToDecoded(mapping, 4)).toBe(4);
	});

	it("maps position at escape sequence correctly", () => {
		const source = '"Hello\\nWorld"';
		const mapping = buildJsonStringMapping(source, 1, 12);

		// Position 5 is 'H' end, position 6-7 is '\n' in source
		// After escape (position 7), decoded position should be 6
		expect(sourceToDecoded(mapping, 5)).toBe(5); // Just before \n
		expect(sourceToDecoded(mapping, 7)).toBe(6); // After \n (start of "World")
	});

	it("maps position after escapes correctly", () => {
		const source = '"Hello\\nWorld"';
		const mapping = buildJsonStringMapping(source, 1, 12);

		// "World" starts at source position 7, decoded position 6
		expect(sourceToDecoded(mapping, 11)).toBe(10); // 'd' in World
	});

	it("clamps positions to valid range", () => {
		const source = '"Hello"';
		const mapping = buildJsonStringMapping(source, 1, 5);

		expect(sourceToDecoded(mapping, -5)).toBe(0);
		expect(sourceToDecoded(mapping, 100)).toBe(5);
	});
});

describe("decodedToSource", () => {
	it("maps decoded position to source position", () => {
		const source = '"Hello\\nWorld"';
		const mapping = buildJsonStringMapping(source, 1, 12);

		// Decoded "Hello" maps to source 0-4
		expect(decodedToSource(mapping, 0)).toBe(0);
		expect(decodedToSource(mapping, 4)).toBe(4);
	});

	it("maps position after decoded newline to correct source", () => {
		const source = '"Hello\\nWorld"';
		const mapping = buildJsonStringMapping(source, 1, 12);

		// Decoded position 6 (start of "World") should map to source 7 (after \n)
		expect(decodedToSource(mapping, 6)).toBe(7);
	});

	it("handles multiple escapes", () => {
		const source = '"A\\nB\\nC"';
		const mapping = buildJsonStringMapping(source, 1, 7);

		// Decoded: "A\nB\nC" = 5 chars
		// Source positions: A=0, \n=1-2, B=3, \n=4-5, C=6
		// Note: decodedToSource returns the START of each decoded character in source
		expect(decodedToSource(mapping, 0)).toBe(0); // A starts at 0
		expect(decodedToSource(mapping, 1)).toBe(1); // newline starts at 1 (\n spans 1-2)
		expect(decodedToSource(mapping, 2)).toBe(3); // B starts at 3
		expect(decodedToSource(mapping, 3)).toBe(4); // newline starts at 4 (\n spans 4-5)
		expect(decodedToSource(mapping, 4)).toBe(6); // C starts at 6
	});
});

describe("sourceRangeToDecoded", () => {
	it("converts source range to decoded range", () => {
		const source = '"Hello\\nWorld"';
		const mapping = buildJsonStringMapping(source, 1, 12);

		// Source range covering "World" (positions 7-12)
		const result = sourceRangeToDecoded(mapping, 7, 12);

		expect(result.start).toBe(6);
		expect(result.end).toBe(11);
	});
});

describe("decodedRangeToSource", () => {
	it("converts decoded range to source range", () => {
		const source = '"Hello\\nWorld"';
		const mapping = buildJsonStringMapping(source, 1, 12);

		// Decoded range covering "World" (positions 6-11)
		const result = decodedRangeToSource(mapping, 6, 11);

		expect(result.start).toBe(7);
		expect(result.end).toBe(12);
	});
});

describe("jsonStringEncode", () => {
	it("encodes newlines", () => {
		expect(jsonStringEncode("Hello\nWorld")).toBe("Hello\\nWorld");
	});

	it("encodes tabs", () => {
		expect(jsonStringEncode("Hello\tWorld")).toBe("Hello\\tWorld");
	});

	it("encodes quotes", () => {
		expect(jsonStringEncode('Say "Hello"')).toBe('Say \\"Hello\\"');
	});

	it("encodes backslashes", () => {
		expect(jsonStringEncode("Path\\to\\file")).toBe("Path\\\\to\\\\file");
	});

	it("encodes control characters", () => {
		expect(jsonStringEncode("Hello\x00World")).toBe("Hello\\u0000World");
	});

	it("preserves regular characters", () => {
		expect(jsonStringEncode("Hello World 123 !@#")).toBe("Hello World 123 !@#");
	});

	it("handles markdown content", () => {
		const markdown = '# Title\n\nParagraph with "quotes" and **bold**';
		const encoded = jsonStringEncode(markdown);

		expect(encoded).toBe(
			'# Title\\n\\nParagraph with \\"quotes\\" and **bold**',
		);
	});
});

describe("buildLineOffsets", () => {
	it("returns [0] for empty string", () => {
		expect(buildLineOffsets("")).toEqual([0]);
	});

	it("returns [0] for single line", () => {
		expect(buildLineOffsets("Hello")).toEqual([0]);
	});

	it("returns correct offsets for multiple lines", () => {
		expect(buildLineOffsets("Hello\nWorld")).toEqual([0, 6]);
	});

	it("handles multiple newlines", () => {
		expect(buildLineOffsets("A\nB\nC")).toEqual([0, 2, 4]);
	});

	it("handles trailing newline", () => {
		expect(buildLineOffsets("Hello\n")).toEqual([0, 6]);
	});
});

describe("roundtrip encoding", () => {
	it("preserves content through encode/decode cycle", () => {
		const original = "# API Documentation\n\nThis is a *markdown* description.";

		// Encode to JSON string content
		const encoded = jsonStringEncode(original);

		// Build a fake source to decode
		const fakeSource = `"${encoded}"`;
		const mapping = buildJsonStringMapping(fakeSource, 1, encoded.length);

		expect(mapping.decodedContent).toBe(original);
	});

	it("handles complex markdown", () => {
		const original = `# Title

## Section 1

Some text with **bold** and *italic*.

- Item 1
- Item 2

\`\`\`javascript
const x = "hello";
\`\`\`
`;

		const encoded = jsonStringEncode(original);
		const fakeSource = `"${encoded}"`;
		const mapping = buildJsonStringMapping(fakeSource, 1, encoded.length);

		expect(mapping.decodedContent).toBe(original);
	});
});
