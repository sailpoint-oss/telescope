import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../test-utils";
import operationBasicFields from "./basic-fields";

describe("operation-basic-fields", () => {
	it("should error when description is missing", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-basic-fields-missing-description",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationBasicFields],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-basic-fields",
		);
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-basic-fields",
				"descriptive explanation",
			),
		).toBe(true);
	});

	it("should warn when description is too short", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-warnings.yaml",
			"/test/operation-basic-fields-short-description",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationBasicFields],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-basic-fields",
		);
		const warnings = diagnostics.filter((d) => d.severity === "warning");
		expect(warnings.length).toBeGreaterThan(0);
		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-basic-fields",
				"exceed 25 characters",
			),
		).toBe(true);
	});

	it("should error when description contains placeholder text", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-basic-fields-placeholder",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationBasicFields],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-basic-fields",
				"placeholder text",
			),
		).toBe(true);
	});

	it("should pass when description is valid", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/operation-basic-fields-valid",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationBasicFields],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-basic-fields",
		);
		expect(diagnostics.length).toBe(0);
	});
});
