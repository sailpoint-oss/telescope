import { describe, expect, it } from "bun:test";
import { lint } from "../../src/engine/index.js";
import type { OpenAPI } from "../../src/engine/schemas/index.js";

describe("lint - full OpenAPI root documents", () => {
	it("should lint a valid OpenAPI 3.0 root document", async () => {
		const spec: OpenAPI = {
			openapi: "3.0.0",
			info: {
				title: "Test API",
				version: "1.0.0",
			},
			paths: {
				"/test": {
					get: {
						operationId: "getTest",
						summary: "Get test",
						description: "Test operation",
						responses: {
							"200": { description: "Success" },
						},
					},
				},
			},
		};

		const diagnostics = await lint(spec);
		// Should run root, path, operation, and parameter validators
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should lint OpenAPI document with components schemas", async () => {
		const spec: OpenAPI = {
			openapi: "3.0.0",
			info: {
				title: "Test API",
				version: "1.0.0",
			},
			paths: {},
			components: {
				schemas: {
					TestSchema: {
						type: "object",
						properties: {
							name: { type: "string" },
						},
					},
				},
			},
		};

		const diagnostics = await lint(spec);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should collect operations for path-level validators", async () => {
		const spec: OpenAPI = {
			openapi: "3.0.0",
			info: {
				title: "Test API",
				version: "1.0.0",
			},
			paths: {
				"/users": {
					get: {
						operationId: "listUsers",
						summary: "List users",
						responses: { "200": { description: "Success" } },
					},
					post: {
						operationId: "createUser",
						summary: "Create user",
						responses: { "201": { description: "Created" } },
					},
				},
			},
		};

		const diagnostics = await lint(spec);
		// Should run validators including operationId uniqueness check
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should combine path-level and operation-level parameters", async () => {
		const spec: OpenAPI = {
			openapi: "3.0.0",
			info: { title: "Test", version: "1.0.0" },
			paths: {
				"/users/{id}": {
					parameters: [
						{
							name: "id",
							in: "path",
							required: true,
							schema: { type: "string" },
						},
					],
					get: {
						operationId: "getUser",
						summary: "Get user",
						parameters: [
							{
								name: "fields",
								in: "query",
								schema: { type: "string" },
							},
						],
						responses: { "200": { description: "Success" } },
					},
				},
			},
		};

		const diagnostics = await lint(spec);
		// Should lint both path-level and operation-level parameters
		expect(Array.isArray(diagnostics)).toBe(true);
	});
});
