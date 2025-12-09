import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../../test-utils.js";
import operationPagination from "./pagination.js";

describe("operation-pagination", () => {
	it("should error when GET list operation lacks limit parameter", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/pagination-missing-limit",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationPagination],
		});

		expect(
			hasDiagnostic(result.diagnostics, "operation-pagination", "limit"),
		).toBe(true);
	});

	it("should error when GET list operation lacks offset parameter", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/pagination-missing-offset",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationPagination],
		});

		expect(
			hasDiagnostic(result.diagnostics, "operation-pagination", "offset"),
		).toBe(true);
	});

	it("should error when limit lacks minimum/maximum", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/pagination-limit-lacks-bounds",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationPagination],
		});

		expect(
			hasDiagnostic(result.diagnostics, "operation-pagination", "minimum"),
		).toBe(true);
	});

	it("should pass when pagination is properly configured", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/pagination-valid",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationPagination],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-pagination",
		);
		expect(diagnostics.length).toBe(0);
	});
});
