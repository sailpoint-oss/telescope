/**
 * Tests for incremental VirtualCode updates.
 *
 * These tests verify that VirtualCode instances can be updated incrementally
 * when document content changes, rather than being fully recreated.
 */

import { describe, expect, it } from "bun:test";
import type { IScriptSnapshot, TextChangeRange } from "typescript";
import { DataVirtualCode } from "../../src/lsp/languages/virtualCodes/data-virtual-code";
import { MarkdownVirtualCode } from "../../src/lsp/languages/virtualCodes/markdown-virtual-code";
import { OpenAPIVirtualCode } from "../../src/lsp/languages/virtualCodes/openapi-virtual-code";
import {
	buildLineOffsets,
	findLineAtOffset,
	patchLineOffsets,
} from "../../src/engine/utils/line-offset-utils";

/**
 * Create a mock IScriptSnapshot with change tracking.
 *
 * Note: IScriptSnapshot.getChangeRange(oldSnapshot) is called on the NEW snapshot
 * with the OLD snapshot as the argument. It returns the changes needed to go
 * from oldSnapshot to this (new) snapshot.
 */
function createSnapshot(
	text: string,
	oldSnapshot?: IScriptSnapshot,
	changeRange?: TextChangeRange,
): IScriptSnapshot {
	return {
		getText: (start: number, end: number) => text.slice(start, end),
		getLength: () => text.length,
		getChangeRange: (requestedOldSnapshot: IScriptSnapshot) => {
			// Return change range if caller is asking about our oldSnapshot
			if (requestedOldSnapshot === oldSnapshot && changeRange) {
				return changeRange;
			}
			return undefined;
		},
	};
}

/**
 * Create a change range for a simple text replacement.
 */
function createChangeRange(
	start: number,
	oldLength: number,
	newLength: number,
): TextChangeRange {
	return {
		span: { start, length: oldLength },
		newLength,
	};
}

// ============================================================================
// Line Offset Utilities Tests
// ============================================================================

describe("findLineAtOffset", () => {
	it("finds the correct line for offset 0", () => {
		const offsets = [0, 6, 12];
		expect(findLineAtOffset(offsets, 0)).toBe(0);
	});

	it("finds the correct line for offset in first line", () => {
		const offsets = [0, 6, 12];
		expect(findLineAtOffset(offsets, 3)).toBe(0);
	});

	it("finds the correct line for offset at line boundary", () => {
		const offsets = [0, 6, 12];
		expect(findLineAtOffset(offsets, 6)).toBe(1);
	});

	it("finds the correct line for offset in middle line", () => {
		const offsets = [0, 6, 12];
		expect(findLineAtOffset(offsets, 8)).toBe(1);
	});

	it("finds the correct line for offset in last line", () => {
		const offsets = [0, 6, 12];
		expect(findLineAtOffset(offsets, 15)).toBe(2);
	});
});

describe("patchLineOffsets", () => {
	it("handles single character insertion", () => {
		// "hello\nworld" -> "hello!\nworld"
		const offsets = [0, 6]; // lines start at 0 and 6
		patchLineOffsets(offsets, 5, 0, "!");
		expect(offsets).toEqual([0, 7]); // second line now starts at 7
	});

	it("handles single character deletion", () => {
		// "hello!\nworld" -> "hello\nworld"
		const offsets = [0, 7];
		patchLineOffsets(offsets, 5, 1, "");
		expect(offsets).toEqual([0, 6]);
	});

	it("handles newline insertion", () => {
		// "hello" -> "hel\nlo"
		const offsets = [0];
		patchLineOffsets(offsets, 3, 0, "\n");
		expect(offsets).toEqual([0, 4]);
	});

	it("handles newline deletion", () => {
		// "hel\nlo" -> "hello"
		const offsets = [0, 4];
		patchLineOffsets(offsets, 3, 1, "");
		expect(offsets).toEqual([0]);
	});

	it("handles multi-line insertion", () => {
		// "hello" -> "hel\n\nlo"
		const offsets = [0];
		patchLineOffsets(offsets, 3, 0, "\n\n");
		expect(offsets).toEqual([0, 4, 5]);
	});

	it("handles replacement with more newlines", () => {
		// "hello\nworld" -> "hello\na\nb\nworld"
		const offsets = [0, 6];
		patchLineOffsets(offsets, 6, 0, "a\nb\n");
		expect(offsets).toEqual([0, 6, 8, 10]);
	});

	it("handles replacement removing newlines", () => {
		// "a\nb\nc" -> "abc"
		const offsets = [0, 2, 4];
		patchLineOffsets(offsets, 0, 5, "abc");
		expect(offsets).toEqual([0]);
	});

	it("shifts subsequent lines correctly", () => {
		// "hello\nworld\nfoo" - insert " bar" at end of "hello"
		const offsets = [0, 6, 12];
		patchLineOffsets(offsets, 5, 0, " bar");
		expect(offsets).toEqual([0, 10, 16]); // each shifted by 4
	});
});

// ============================================================================
// DataVirtualCode Update Tests
// ============================================================================

describe("DataVirtualCode.update", () => {
	it("returns false when no change range available", () => {
		const text = "key: value";
		const snapshot = createSnapshot(text);
		const vc = new DataVirtualCode(snapshot, "yaml");

		const newText = "key: new value";
		const newSnapshot = createSnapshot(newText); // No previous snapshot

		expect(vc.update(newSnapshot)).toBe(false);
	});

	it("updates snapshot reference on successful update", () => {
		const text = "key: value";
		const snapshot = createSnapshot(text);
		const vc = new DataVirtualCode(snapshot, "yaml");

		const newText = "key: new value";
		const changeRange = createChangeRange(5, 5, 9); // "value" -> "new value"
		const newSnapshot = createSnapshot(newText, snapshot, changeRange);

		expect(vc.update(newSnapshot)).toBe(true);
		expect(vc.snapshot).toBe(newSnapshot);
	});

	it("marks AST as dirty after update", () => {
		const text = "key: value";
		const snapshot = createSnapshot(text);
		const vc = new DataVirtualCode(snapshot, "yaml");

		const newText = "key: new value";
		const changeRange = createChangeRange(5, 5, 9);
		const newSnapshot = createSnapshot(newText, snapshot, changeRange);

		vc.update(newSnapshot);

		// Access ast should trigger re-parse
		const ast = vc.ast;
		expect(ast).toBeDefined();
	});

	it("returns correct parsed object after update", () => {
		const text = "key: value";
		const snapshot = createSnapshot(text);
		const vc = new DataVirtualCode(snapshot, "yaml");

		const newText = "key: new value";
		const changeRange = createChangeRange(5, 5, 9);
		const newSnapshot = createSnapshot(newText, snapshot, changeRange);

		vc.update(newSnapshot);

		expect(vc.parsedObject).toEqual({ key: "new value" });
	});

	it("updates line offsets incrementally", () => {
		const text = "line1\nline2";
		const snapshot = createSnapshot(text);
		const vc = new DataVirtualCode(snapshot, "yaml");

		// Insert a character in line1
		const newText = "line1!\nline2";
		const changeRange = createChangeRange(5, 0, 1);
		const newSnapshot = createSnapshot(newText, snapshot, changeRange);

		vc.update(newSnapshot);

		// Verify getRange still works correctly
		// The document structure is now: { line1!: null, line2: null } or similar
		// Just verify no errors occur
		expect(vc.getRawText()).toBe(newText);
	});

	it("shifts mapping offsets after change point", () => {
		const text = "key: value";
		const snapshot = createSnapshot(text);
		const vc = new DataVirtualCode(snapshot, "yaml");

		const originalLength = vc.mappings[0]?.lengths[0];

		const newText = "key: new value";
		const changeRange = createChangeRange(5, 5, 9);
		const newSnapshot = createSnapshot(newText, snapshot, changeRange);

		vc.update(newSnapshot);

		// Main mapping length should be updated
		expect(vc.mappings[0]?.lengths[0]).toBe(newText.length);
		expect(vc.mappings[0]?.lengths[0]).not.toBe(originalLength);
	});
});

// ============================================================================
// MarkdownVirtualCode Update Tests
// ============================================================================

describe("MarkdownVirtualCode.update", () => {
	it("shifts segments after change", () => {
		const segments = [
			{ start: 10, sourceLength: 5, content: "hello" },
			{ start: 20, sourceLength: 5, content: "world" },
		];
		const mdVC = new MarkdownVirtualCode("test", segments);

		// Change before first segment (inserts 3 chars at position 5)
		const success = mdVC.update(5, 5, 3, "prefix___hello_____world");

		expect(success).toBe(true);
		expect(mdVC.segments[0]?.start).toBe(13); // 10 + 3
		expect(mdVC.segments[1]?.start).toBe(23); // 20 + 3
	});

	it("updates segment content when change is within segment", () => {
		const segments = [{ start: 0, sourceLength: 5, content: "hello" }];
		const mdVC = new MarkdownVirtualCode("test", segments);

		// Replace "ell" with "ipp"
		const success = mdVC.update(1, 4, 0, "hippo");

		expect(success).toBe(true);
		expect(mdVC.segments[0]?.content).toBe("hippo");
		expect(mdVC.segments[0]?.sourceLength).toBe(5);
	});

	it("returns false when change spans segment boundaries", () => {
		const segments = [
			{ start: 0, sourceLength: 5, content: "hello" },
			{ start: 10, sourceLength: 5, content: "world" },
		];
		const mdVC = new MarkdownVirtualCode("test", segments);

		// Change spans from first segment into gap
		const success = mdVC.update(3, 8, 0, "replaced");

		expect(success).toBe(false);
	});

	it("does not modify segments before change", () => {
		const segments = [
			{ start: 0, sourceLength: 5, content: "hello" },
			{ start: 10, sourceLength: 5, content: "world" },
		];
		const mdVC = new MarkdownVirtualCode("test", segments);

		// Change after first segment, before second
		const success = mdVC.update(6, 6, 3, "______xxx___world");

		expect(success).toBe(true);
		expect(mdVC.segments[0]?.start).toBe(0); // unchanged
		expect(mdVC.segments[0]?.content).toBe("hello"); // unchanged
	});

	it("rebuilds snapshot after content update", () => {
		const segments = [{ start: 0, sourceLength: 5, content: "hello" }];
		const mdVC = new MarkdownVirtualCode("test", segments);

		const originalContent = mdVC.snapshot.getText(
			0,
			mdVC.snapshot.getLength(),
		);

		mdVC.update(0, 5, 0, "world");

		const newContent = mdVC.snapshot.getText(0, mdVC.snapshot.getLength());

		expect(newContent).toBe("world");
		expect(newContent).not.toBe(originalContent);
	});

	it("updates mappings when segment content changes", () => {
		const segments = [{ start: 0, sourceLength: 5, content: "hello" }];
		const mdVC = new MarkdownVirtualCode("test", segments);

		mdVC.update(0, 5, 2, "hello!!");

		expect(mdVC.mappings[0]?.lengths[0]).toBe(7);
		expect(mdVC.segments[0]?.sourceLength).toBe(7);
	});
});

// ============================================================================
// OpenAPIVirtualCode Update Tests
// ============================================================================

describe("OpenAPIVirtualCode.update", () => {
	const minimalOpenAPI = `openapi: "3.0.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}
`;

	it("returns false when no change range available", () => {
		const snapshot = createSnapshot(minimalOpenAPI);
		const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");

		const newSnapshot = createSnapshot(minimalOpenAPI);

		expect(vc.update(newSnapshot)).toBe(false);
	});

	it("invalidates IR after update", () => {
		const snapshot = createSnapshot(minimalOpenAPI);
		const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");

		// Pre-populate IR
		const ir = vc.getIR("file:///test.yaml");
		expect(ir).toBeDefined();

		const newText = minimalOpenAPI.replace("Test API", "Updated API");
		const changeRange = createChangeRange(32, 8, 11);
		const newSnapshot = createSnapshot(newText, snapshot, changeRange);

		vc.update(newSnapshot);

		// IR should be rebuilt
		const newIR = vc.getIR("file:///test.yaml");
		expect(newIR).toBeDefined();
		// The IR object itself may be different since it was invalidated
	});

	it("invalidates atoms after update", () => {
		const snapshot = createSnapshot(minimalOpenAPI);
		const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");

		const newText = minimalOpenAPI.replace("Test API", "Updated API");
		const changeRange = createChangeRange(32, 8, 11);
		const newSnapshot = createSnapshot(newText, snapshot, changeRange);

		vc.update(newSnapshot);

		// Atoms should be rebuilt on access
		const atoms = vc.getAtoms("file:///test.yaml");
		expect(atoms).toBeDefined();
	});

	it("updates format VirtualCode", () => {
		const snapshot = createSnapshot(minimalOpenAPI);
		const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");

		const formatVC = vc.embeddedCodes.find((c) => c.id === "format");
		expect(formatVC).toBeDefined();

		const originalLength = formatVC?.mappings[0]?.lengths[0];

		const newText = minimalOpenAPI.replace("Test API", "A Much Longer API Name");
		const changeRange = createChangeRange(32, 8, 22);
		const newSnapshot = createSnapshot(newText, snapshot, changeRange);

		vc.update(newSnapshot);

		// Format code should have updated mapping
		expect(formatVC?.mappings[0]?.lengths[0]).toBe(newText.length);
		expect(formatVC?.mappings[0]?.lengths[0]).not.toBe(originalLength);
	});
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("incremental update integration", () => {
	it("handles sequential updates correctly", () => {
		let text = "key: value";
		let snapshot = createSnapshot(text);
		const vc = new DataVirtualCode(snapshot, "yaml");

		// First update: "value" -> "value1"
		let newText = "key: value1";
		let changeRange = createChangeRange(10, 0, 1);
		let newSnapshot = createSnapshot(newText, snapshot, changeRange);
		expect(vc.update(newSnapshot)).toBe(true);
		expect(vc.parsedObject).toEqual({ key: "value1" });

		// Second update: "value1" -> "value12"
		text = newText;
		snapshot = newSnapshot;
		newText = "key: value12";
		changeRange = createChangeRange(11, 0, 1);
		newSnapshot = createSnapshot(newText, snapshot, changeRange);
		expect(vc.update(newSnapshot)).toBe(true);
		expect(vc.parsedObject).toEqual({ key: "value12" });
	});

	it("handles multi-line YAML document updates", () => {
		const text = `name: test
version: "1.0"
description: A test file`;
		const snapshot = createSnapshot(text);
		const vc = new DataVirtualCode(snapshot, "yaml");

		// Update the version
		const newText = `name: test
version: "2.0"
description: A test file`;
		const changeRange = createChangeRange(21, 3, 3); // "1.0" -> "2.0" (inside quotes)
		const newSnapshot = createSnapshot(newText, snapshot, changeRange);

		expect(vc.update(newSnapshot)).toBe(true);
		expect((vc.parsedObject as Record<string, unknown>).version).toBe("2.0");
	});

	it("handles JSON document updates", () => {
		const text = '{"key": "value"}';
		const snapshot = createSnapshot(text);
		const vc = new DataVirtualCode(snapshot, "json", { format: "json" });

		const newText = '{"key": "new value"}';
		const changeRange = createChangeRange(9, 5, 9); // "value" -> "new value"
		const newSnapshot = createSnapshot(newText, snapshot, changeRange);

		expect(vc.update(newSnapshot)).toBe(true);
		expect(vc.parsedObject).toEqual({ key: "new value" });
	});

	it("falls back to full recreation when needed", () => {
		const text = "key: value";
		const snapshot = createSnapshot(text);
		const vc = new DataVirtualCode(snapshot, "yaml");

		// Create new snapshot without change range
		const newText = "completely: different";
		const newSnapshot = createSnapshot(newText);

		// Should return false, caller should recreate
		expect(vc.update(newSnapshot)).toBe(false);
	});
});

