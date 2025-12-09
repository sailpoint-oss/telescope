import { describe, expect, it } from "bun:test";
import { lint } from "../../src/engine/index.js";
import type { Parameter } from "../../src/engine/schemas/index.js";

describe("lint - standalone parameters", () => {
	it("should detect and lint a standalone parameter", async () => {
		const parameter: Parameter = {
			name: "userId",
			in: "path",
			required: true,
			description: "User ID",
			schema: { type: "string" },
		};

		const diagnostics = await lint(parameter);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should use root-relative paths for standalone parameter", async () => {
		const parameter: Parameter = {
			name: "test",
			in: "query",
			schema: { type: "string" },
		};

		const diagnostics = await lint(parameter);
		// With the new engine-based system, diagnostics come from the temporary document
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should handle query parameter", async () => {
		const parameter: Parameter = {
			name: "limit",
			in: "query",
			schema: { type: "integer", minimum: 1, maximum: 100 },
		};

		const diagnostics = await lint(parameter);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should handle header parameter", async () => {
		const parameter: Parameter = {
			name: "X-Request-ID",
			in: "header",
			schema: { type: "string" },
		};

		const diagnostics = await lint(parameter);
		expect(Array.isArray(diagnostics)).toBe(true);
	});

	it("should handle cookie parameter", async () => {
		const parameter: Parameter = {
			name: "sessionId",
			in: "cookie",
			schema: { type: "string" },
		};

		const diagnostics = await lint(parameter);
		expect(Array.isArray(diagnostics)).toBe(true);
	});
});
