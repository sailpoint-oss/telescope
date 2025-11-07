import { describe, expect, it } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import parameterIn from "./in";

describe("parameter-in", () => {
	it("should error when 'in' is missing", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-in-missing",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterIn],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"parameter-in",
				"must specify a valid 'in' value",
			),
		).toBe(true);
	});

	it("should error when 'in' is not a string", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-in-not-string",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterIn],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"parameter-in",
				"must be a string",
			),
		).toBe(true);
	});

	it("should error when 'in' value is invalid for OpenAPI 3.x", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-in-invalid-value",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterIn],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"parameter-in",
				"must be one of: query, header, path, cookie",
			),
		).toBe(true);
	});

	it("should pass when 'in' value is valid", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/parameter-in-valid-query",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterIn],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-in");
		expect(diagnostics.length).toBe(0);
	});
});

