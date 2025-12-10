import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../../test-utils.js";
import operationIdUniqueInPath from "./id-unique-in-path.js";

describe("operation-id-unique-in-path", () => {
	it("should error when duplicate operationIds exist in same path", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-id-unique-in-path-error",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationIdUniqueInPath],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-id-unique-in-path",
				"Duplicate operationId",
			),
		).toBe(true);
	});

	it("should pass when operationIds are unique in path", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/operation-id-unique-in-path-valid",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationIdUniqueInPath],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-id-unique-in-path",
		);
		expect(diagnostics.length).toBe(0);
	});
});
