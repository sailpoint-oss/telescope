import { describe, expect, it } from "bun:test";
import { parseTree } from "jsonc-parser";
import { buildIRFromJson } from "./builder-json.js";
import type { IRDocument, IRNode } from "./types.js";

describe("buildIRFromJson", () => {
	it("should build IR from simple JSON object", () => {
		const json = '{"key": "value"}';
		const ast = JSON.parse(json);
		const tree = parseTree(json);
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromJson(
			"file:///test.json",
			ast,
			tree,
			json,
			hash,
			mtimeMs,
			"3.1",
		);

		expect(ir.uri).toBe("file:///test.json");
		expect(ir.format).toBe("json");
		expect(ir.version).toBe("3.1");
		expect(ir.rawText).toBe(json);
		expect(ir.root.kind).toBe("object");
		expect(ir.root.children).toBeDefined();
		expect(ir.root.children?.length).toBe(1);
		expect(ir.root.children?.[0]?.key).toBe("key");
		expect(ir.root.children?.[0]?.kind).toBe("string");
		expect(ir.root.children?.[0]?.value).toBe("value");
	});

	it("should build IR from JSON array", () => {
		const json = '["item1", "item2"]';
		const ast = JSON.parse(json);
		const tree = parseTree(json);
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromJson(
			"file:///test.json",
			ast,
			tree,
			json,
			hash,
			mtimeMs,
			"3.0",
		);

		expect(ir.root.kind).toBe("array");
		expect(ir.root.children).toBeDefined();
		expect(ir.root.children?.length).toBe(2);
		expect(ir.root.children?.[0]?.kind).toBe("string");
		expect(ir.root.children?.[0]?.value).toBe("item1");
		expect(ir.root.children?.[1]?.value).toBe("item2");
	});

	it("should build IR from nested JSON object", () => {
		const json = '{"parent": {"child": "value"}}';
		const ast = JSON.parse(json);
		const tree = parseTree(json);
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromJson(
			"file:///test.json",
			ast,
			tree,
			json,
			hash,
			mtimeMs,
			"3.1",
		);

		expect(ir.root.kind).toBe("object");
		const parent = ir.root.children?.find((c) => c.key === "parent");
		expect(parent).toBeDefined();
		expect(parent?.kind).toBe("object");
		const child = parent?.children?.find((c) => c.key === "child");
		expect(child).toBeDefined();
		expect(child?.kind).toBe("string");
		expect(child?.value).toBe("value");
	});

	it("should set correct JSON pointers", () => {
		const json = '{"a": {"b": "c"}}';
		const ast = JSON.parse(json);
		const tree = parseTree(json);
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromJson(
			"file:///test.json",
			ast,
			tree,
			json,
			hash,
			mtimeMs,
			"3.1",
		);

		expect(ir.root.ptr).toBe("#");
		const a = ir.root.children?.find((c) => c.key === "a");
		expect(a?.ptr).toBe("#/a");
		const b = a?.children?.find((c) => c.key === "b");
		expect(b?.ptr).toBe("#/a/b");
	});

	it("should set correct location offsets", () => {
		const json = '{"key": "value"}';
		const ast = JSON.parse(json);
		const tree = parseTree(json);
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromJson(
			"file:///test.json",
			ast,
			tree,
			json,
			hash,
			mtimeMs,
			"3.1",
		);

		expect(ir.root.loc.start).toBeGreaterThanOrEqual(0);
		expect(ir.root.loc.end).toBeLessThanOrEqual(json.length);
		expect(ir.root.loc.end).toBeGreaterThan(ir.root.loc.start);

		const keyNode = ir.root.children?.[0];
		if (keyNode) {
			expect(keyNode.loc.keyStart).toBeDefined();
			expect(keyNode.loc.keyEnd).toBeDefined();
			expect(keyNode.loc.valStart).toBeDefined();
			expect(keyNode.loc.valEnd).toBeDefined();
		}
	});

	it("should handle JSON with escaped pointer segments", () => {
		const json = '{"key/with/slash": "value", "key~with~tilde": "value2"}';
		const ast = JSON.parse(json);
		const tree = parseTree(json);
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromJson(
			"file:///test.json",
			ast,
			tree,
			json,
			hash,
			mtimeMs,
			"3.1",
		);

		const slashKey = ir.root.children?.find((c) => c.key === "key/with/slash");
		expect(slashKey).toBeDefined();
		expect(slashKey?.ptr).toContain("~1"); // Escaped slash

		const tildeKey = ir.root.children?.find((c) => c.key === "key~with~tilde");
		expect(tildeKey).toBeDefined();
		expect(tildeKey?.ptr).toContain("~0"); // Escaped tilde
	});

	it("should handle null tree gracefully", () => {
		const json = "null";
		const ast = null;
		const tree = null;
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromJson(
			"file:///test.json",
			ast,
			tree,
			json,
			hash,
			mtimeMs,
			"3.1",
		);

		expect(ir.root.kind).toBe("null");
		expect(ir.root.value).toBe(null);
	});
});
