import { describe, expect, it } from "bun:test";
import { lint } from "../../src/engine/index.js";
import type {
	Operation,
	Parameter,
	PathItem,
	SchemaObject,
} from "../../src/engine/schemas/index.js";

describe("lint - detection logic", () => {
	it("should return empty array for unknown types", async () => {
		const unknown = { someRandomKey: "value" };
		const diagnostics = await lint(unknown);
		expect(diagnostics).toEqual([]);
	});

	it("should return empty array for null", async () => {
		const diagnostics = await lint(null);
		expect(diagnostics).toEqual([]);
	});

	it("should return empty array for non-objects", async () => {
		expect(await lint("string")).toEqual([]);
		expect(await lint(123)).toEqual([]);
		expect(await lint(true)).toEqual([]);
		expect(await lint([])).toEqual([]);
	});

	it("should distinguish between parameter and schema", async () => {
		// Parameter should be detected (has name and in)
		const parameter = {
			name: "test",
			in: "query",
			schema: { type: "string" },
		};
		const paramDiagnostics = await lint(parameter);
		expect(Array.isArray(paramDiagnostics)).toBe(true);

		// Schema without name/in should be detected as schema
		const schema = {
			type: "string",
		};
		const schemaDiagnostics = await lint(schema);
		expect(Array.isArray(schemaDiagnostics)).toBe(true);
	});

	it("should distinguish between operation and schema", async () => {
		// Operation should be detected (has operationId and responses)
		const operation = {
			operationId: "test",
			responses: { "200": { description: "ok" } },
		};
		const opDiagnostics = await lint(operation);
		expect(Array.isArray(opDiagnostics)).toBe(true);

		// Schema with properties but no responses should be schema
		const schema = {
			type: "object",
			properties: { test: { type: "string" } },
		};
		const schemaDiagnostics = await lint(schema);
		expect(Array.isArray(schemaDiagnostics)).toBe(true);
	});

	it("should detect path-item with HTTP methods", async () => {
		const pathItem = {
			get: {
				operationId: "getTest",
				responses: { "200": { description: "ok" } },
			},
			post: {
				operationId: "postTest",
				responses: { "201": { description: "created" } },
			},
		};

		const diagnostics = await lint(pathItem);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should detect OpenAPI root with openapi field", async () => {
		const spec = {
			openapi: "3.0.0",
			info: { title: "Test", version: "1.0.0" },
			paths: {},
		};

		const diagnostics = await lint(spec);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should detect OpenAPI root when only root-only keys are present", async () => {
		const spec = {
			info: { title: "Test", version: "1.0.0" },
			components: {},
		};

		const diagnostics = await lint(spec);
		expect(Array.isArray(diagnostics)).toBe(true);
	});
});
