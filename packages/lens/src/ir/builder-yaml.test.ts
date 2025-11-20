import { describe, expect, it } from "bun:test";
import YAML from "yaml";
import { buildIRFromYaml } from "./builder-yaml.js";
import type { IRDocument } from "./types.js";

describe("buildIRFromYaml", () => {
	it("should build IR from simple YAML object", () => {
		const yaml = "key: value";
		const document = YAML.parseDocument(yaml);
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromYaml(
			"file:///test.yaml",
			document,
			yaml,
			hash,
			mtimeMs,
			"3.1",
		);

		expect(ir.uri).toBe("file:///test.yaml");
		expect(ir.format).toBe("yaml");
		expect(ir.version).toBe("3.1");
		expect(ir.rawText).toBe(yaml);
		expect(ir.root.kind).toBe("object");
		expect(ir.root.children).toBeDefined();
		expect(ir.root.children?.length).toBe(1);
		expect(ir.root.children?.[0]?.key).toBe("key");
		expect(ir.root.children?.[0]?.kind).toBe("string");
		expect(ir.root.children?.[0]?.value).toBe("value");
	});

	it("should build IR from YAML array", () => {
		const yaml = "- item1\n- item2";
		const document = YAML.parseDocument(yaml);
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromYaml(
			"file:///test.yaml",
			document,
			yaml,
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

	it("should build IR from nested YAML object", () => {
		const yaml = "parent:\n  child: value";
		const document = YAML.parseDocument(yaml);
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromYaml(
			"file:///test.yaml",
			document,
			yaml,
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
		const yaml = "a:\n  b: c";
		const document = YAML.parseDocument(yaml);
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromYaml(
			"file:///test.yaml",
			document,
			yaml,
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
		const yaml = "key: value";
		const document = YAML.parseDocument(yaml);
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromYaml(
			"file:///test.yaml",
			document,
			yaml,
			hash,
			mtimeMs,
			"3.1",
		);

		expect(ir.root.loc.start).toBeGreaterThanOrEqual(0);
		expect(ir.root.loc.end).toBeLessThanOrEqual(yaml.length);
		expect(ir.root.loc.end).toBeGreaterThan(ir.root.loc.start);

		const keyNode = ir.root.children?.[0];
		if (keyNode) {
			expect(keyNode.loc.keyStart).toBeDefined();
			expect(keyNode.loc.keyEnd).toBeDefined();
			expect(keyNode.loc.valStart).toBeDefined();
			expect(keyNode.loc.valEnd).toBeDefined();
		}
	});

	it("should handle YAML with different scalar types", () => {
		const yaml = "string: text\nnumber: 42\nboolean: true\nnullValue: null";
		const document = YAML.parseDocument(yaml);
		const hash = "test-hash";
		const mtimeMs = Date.now();

		const ir = buildIRFromYaml(
			"file:///test.yaml",
			document,
			yaml,
			hash,
			mtimeMs,
			"3.1",
		);

		const stringNode = ir.root.children?.find((c) => c.key === "string");
		expect(stringNode?.kind).toBe("string");

		const numberNode = ir.root.children?.find((c) => c.key === "number");
		expect(numberNode?.kind).toBe("number");

		const booleanNode = ir.root.children?.find((c) => c.key === "boolean");
		expect(booleanNode?.kind).toBe("boolean");

		const nullNode = ir.root.children?.find((c) => c.key === "nullValue");
		expect(nullNode?.kind).toBe("null");
		expect(nullNode?.value).toBe(null);
	});
});
