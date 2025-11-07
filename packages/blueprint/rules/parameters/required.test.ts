import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import parameterRequired from "./required";

describe("parameter-required", () => {
	it("should error when required field is missing", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-required-missing",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterRequired],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"parameter-required",
				"explicitly declare",
			),
		).toBe(true);
	});

	it("should pass when required is explicitly set", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/parameter-required-valid",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterRequired],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"parameter-required",
		);
		expect(diagnostics.length).toBe(0);
	});
});
