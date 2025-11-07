import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import parameterFormats from "./formats";

describe("parameter-formats", () => {
	it("should error when integer parameter lacks format", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-formats-integer-missing",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterFormats],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"parameter-formats",
				"format int32 or int64",
			),
		).toBe(true);
	});

	it("should error when number parameter lacks format", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-formats-number-missing",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterFormats],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"parameter-formats",
				"format float or double",
			),
		).toBe(true);
	});

	it("should pass when integer has valid format", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/parameter-formats-valid",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterFormats],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"parameter-formats",
		);
		expect(diagnostics.length).toBe(0);
	});
});
