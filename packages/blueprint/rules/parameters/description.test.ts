import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import parameterDescription from "./description";

describe("parameter-description", () => {
	it("should error when description is missing", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-description-missing",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterDescription],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"parameter-description",
				"descriptive explanation",
			),
		).toBe(true);
	});

	it("should error when description is too short", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-description-too-short",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterDescription],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"parameter-description",
				"at least 8 characters",
			),
		).toBe(true);
	});

	it("should pass when description is valid", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/parameter-description-valid",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterDescription],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"parameter-description",
		);
		expect(diagnostics.length).toBe(0);
	});
});
