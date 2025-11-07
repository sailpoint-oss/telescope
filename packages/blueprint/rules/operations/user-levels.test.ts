import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import operationUserLevels from "./user-levels";

describe("operation-user-levels", () => {
	it("should error when x-sailpoint-userLevels is missing", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-user-levels-missing",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
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

		const result = runEngine(project, [project.docs.keys().next().value], {
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

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [operationUserLevels],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-user-levels",
		);
		expect(diagnostics.length).toBe(0);
	});
});
