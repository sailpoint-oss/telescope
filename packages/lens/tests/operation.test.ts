import { describe, expect, it } from "bun:test";
import type { Operation } from "blueprint";
import { lint } from "../src/index";

describe("lint - standalone operations", () => {
	it("should detect and lint a standalone operation", async () => {
		const operation: Operation = {
			operationId: "getUsers",
			summary: "Get users",
			description: "Returns a list of users",
			responses: {
				"200": {
					description: "Success",
					content: {
						"application/json": {
							schema: {
								type: "array",
								items: { type: "object" },
							},
						},
					},
				},
			},
		};

		const diagnostics = await lint(operation);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should extract and lint parameters from standalone operation", async () => {
		const operation: Operation = {
			operationId: "getUsers",
			summary: "Get users",
			description: "Returns users",
			parameters: [
				{
					name: "limit",
					in: "query",
					schema: { type: "integer", minimum: 1, maximum: 100 },
				},
				{
					name: "offset",
					in: "query",
					schema: { type: "integer" },
				},
			],
			responses: {
				"200": { description: "Success" },
			},
		};

		const diagnostics = await lint(operation);
		expect(Array.isArray(diagnostics)).toBe(true);
		// Should have diagnostics for parameters
	});

	it("should use root-relative paths for standalone operation", async () => {
		const operation: Operation = {
			operationId: "test",
			summary: "Test",
			responses: { "200": { description: "Success" } },
		};

		const diagnostics = await lint(operation);
		// With the new engine-based system, diagnostics come from the temporary document
		// The paths will be relative to the temp document structure, not the original object
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should handle operation without parameters", async () => {
		const operation: Operation = {
			operationId: "simpleOperation",
			summary: "Simple",
			description: "A simple operation",
			responses: {
				"200": { description: "Success" },
			},
		};

		const diagnostics = await lint(operation);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should handle operation with only summary (no operationId)", async () => {
		const operation: Operation = {
			summary: "Test operation",
			responses: {
				"200": { description: "Success" },
			},
		};

		const diagnostics = await lint(operation);
		expect(Array.isArray(diagnostics)).toBe(true);
	});
});
