import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../../test-utils.js";
import operationUserLevels from "./user-levels.js";

describe("operation-user-levels", () => {
	it("should error when x-sailpoint-userLevels is missing", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-user-levels-missing",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationUserLevels],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-user-levels",
				"x-sailpoint-userLevels",
			),
		).toBe(true);
	});

	it("should error when user level format is invalid", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-user-levels-invalid-format",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationUserLevels],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-user-levels",
				"uppercase with underscores",
			),
		).toBe(true);
	});

	it("should pass when user levels are valid", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/operation-user-levels-valid",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationUserLevels],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-user-levels",
		);
		expect(diagnostics.length).toBe(0);
	});
});
