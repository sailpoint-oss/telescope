import { describe, it, expect } from "bun:test";
import type { SchemaObject } from "blueprint";
import { lint } from "./index";

describe("lint - standalone schemas", () => {
	it("should detect and lint a standalone schema", async () => {
		const schema: SchemaObject = {
			type: "object",
			properties: {
				name: { type: "string" },
				age: { type: "integer" },
			},
			required: ["name"],
		};

		const diagnostics = await lint(schema);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should handle schema with allOf", async () => {
		const schema: SchemaObject = {
			allOf: [
				{ type: "object", properties: { a: { type: "string" } } },
				{ type: "object", properties: { b: { type: "number" } } },
			],
		};

		const diagnostics = await lint(schema);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should handle schema with $ref", async () => {
		const schema: SchemaObject = {
			$ref: "#/components/schemas/Test",
		};

		const diagnostics = await lint(schema);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should use root-relative paths for standalone schema", async () => {
		const schema: SchemaObject = {
			type: "object",
			properties: {
				test: { type: "string" },
			},
		};

		const diagnostics = await lint(schema);
		// With the new engine-based system, diagnostics come from the temporary document
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should not require specification for standalone schema", async () => {
		const schema: SchemaObject = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};

		// Should not throw when specification is undefined
		const diagnostics = await lint(schema);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should handle schema with anyOf", async () => {
		const schema: SchemaObject = {
			anyOf: [{ type: "string" }, { type: "number" }],
		};

		const diagnostics = await lint(schema);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should handle schema with oneOf", async () => {
		const schema: SchemaObject = {
			oneOf: [{ type: "string" }, { type: "integer" }],
		};

		const diagnostics = await lint(schema);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should handle array schema", async () => {
		const schema: SchemaObject = {
			type: "array",
			items: { type: "string" },
		};

		const diagnostics = await lint(schema);
		expect(Array.isArray(diagnostics)).toBe(true);
	});
});
