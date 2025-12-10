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

	it("should build IR with $ref nodes having correct structure", () => {
		const yaml = `components:
  schemas:
    Pet:
      $ref: "./schemas/Pet.yaml"
    User:
      $ref: "#/components/schemas/LocalUser"`;
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

		// Navigate to components/schemas/Pet/$ref
		const components = ir.root.children?.find((c) => c.key === "components");
		expect(components).toBeDefined();
		expect(components?.kind).toBe("object");

		const schemas = components?.children?.find((c) => c.key === "schemas");
		expect(schemas).toBeDefined();
		expect(schemas?.kind).toBe("object");

		const pet = schemas?.children?.find((c) => c.key === "Pet");
		expect(pet).toBeDefined();
		expect(pet?.kind).toBe("object");

		// The $ref should be a child of Pet with key "$ref"
		const petRef = pet?.children?.find((c) => c.key === "$ref");
		expect(petRef).toBeDefined();
		expect(petRef?.kind).toBe("string");
		expect(petRef?.key).toBe("$ref");
		expect(petRef?.value).toBe("./schemas/Pet.yaml");
		expect(petRef?.loc).toBeDefined();
		expect(petRef?.loc.start).toBeGreaterThanOrEqual(0);
		expect(petRef?.loc.end).toBeGreaterThan(petRef?.loc.start ?? 0);

		// Check the second $ref (internal reference)
		const user = schemas?.children?.find((c) => c.key === "User");
		const userRef = user?.children?.find((c) => c.key === "$ref");
		expect(userRef).toBeDefined();
		expect(userRef?.kind).toBe("string");
		expect(userRef?.key).toBe("$ref");
		expect(userRef?.value).toBe("#/components/schemas/LocalUser");
	});

	it("should build IR with $ref at path level", () => {
		const yaml = `paths:
  /pets:
    $ref: "./paths/pets.yaml"`;
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

		const paths = ir.root.children?.find((c) => c.key === "paths");
		expect(paths).toBeDefined();

		const petsPath = paths?.children?.find((c) => c.key === "/pets");
		expect(petsPath).toBeDefined();
		expect(petsPath?.kind).toBe("object");

		const ref = petsPath?.children?.find((c) => c.key === "$ref");
		expect(ref).toBeDefined();
		expect(ref?.kind).toBe("string");
		expect(ref?.key).toBe("$ref");
		expect(ref?.value).toBe("./paths/pets.yaml");
	});
});
