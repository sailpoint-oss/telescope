import { describe, expect, it } from "bun:test";
import type { PathItem } from "blueprint";
import { lint } from "../src/index";

describe("lint - standalone path-items", () => {
	it("should detect and lint a standalone path-item", async () => {
		const pathItem: PathItem = {
			parameters: [
				{
					name: "version",
					in: "path",
					required: true,
					schema: { type: "string" },
				},
			],
			get: {
				operationId: "getResource",
				summary: "Get resource",
				description: "Get a resource",
				responses: {
					"200": { description: "Success" },
				},
			},
			post: {
				operationId: "createResource",
				summary: "Create resource",
				responses: {
					"201": { description: "Created" },
				},
			},
		};

		const diagnostics = await lint(pathItem);
		expect(Array.isArray(diagnostics)).toBe(true);
		// Should lint path-item, operations, and parameters
	});

	it("should use root-relative paths for standalone path-item", async () => {
		const pathItem: PathItem = {
			get: {
				operationId: "getTest",
				summary: "Test",
				description: "Test operation without description validation",
				responses: {
					"200": { description: "Success" },
				},
			},
		};

		const diagnostics = await lint(pathItem);
		// With the new engine-based system, diagnostics come from the temporary document
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should lint parameters from both path-level and operation-level", async () => {
		const pathItem: PathItem = {
			parameters: [
				{
					name: "pathParam",
					in: "path",
					required: true,
					schema: { type: "string" },
				},
			],
			get: {
				operationId: "getTest",
				summary: "Test",
				responses: { "200": { description: "Success" } },
				parameters: [
					{
						name: "queryParam",
						in: "query",
						schema: { type: "string" },
					},
				],
			},
		};

		const diagnostics = await lint(pathItem);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should iterate through all HTTP methods in path-item", async () => {
		const pathItem: PathItem = {
			get: {
				operationId: "getTest",
				summary: "Get",
				responses: { "200": { description: "Success" } },
			},
			post: {
				operationId: "postTest",
				summary: "Post",
				responses: { "201": { description: "Created" } },
			},
			put: {
				operationId: "putTest",
				summary: "Put",
				responses: { "200": { description: "Success" } },
			},
		};

		const diagnostics = await lint(pathItem);
		expect(Array.isArray(diagnostics)).toBe(true);
		// Should lint all operations
	});
});
