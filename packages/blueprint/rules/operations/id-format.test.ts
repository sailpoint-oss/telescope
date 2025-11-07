import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import operationIdFormat from "./id-format";

describe("operation-id-format", () => {
	it("should error when operationId is missing", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-id-format-missing",
		);

		const result = runEngine(project, [project.docs.keys().next().value!], {
			rules: [operationIdFormat],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-id-format",
				"must define an operationId",
			),
		).toBe(true);
	});

	it("should error when operationId is not camelCase", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-id-format-not-camelcase",
		);

		const result = runEngine(project, [project.docs.keys().next().value!], {
			rules: [operationIdFormat],
		});

		expect(
			hasDiagnostic(result.diagnostics, "operation-id-format", "camelCase"),
		).toBe(true);
	});

	it("should warn when operationId verb is not in allowed list", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-warnings.yaml",
			"/test/operation-id-format-warning",
		);

		const result = runEngine(project, [project.docs.keys().next().value!], {
			rules: [operationIdFormat],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-id-format",
		);
		const warnings = diagnostics.filter((d) => d.severity === "warning");
		expect(warnings.length).toBeGreaterThan(0);
	});

	it("should pass when operationId is valid camelCase", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/operation-id-format-valid",
		);

		const result = runEngine(project, [project.docs.keys().next().value!], {
			rules: [operationIdFormat],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-id-format",
		);
		const errors = diagnostics.filter((d) => d.severity === "error");
		expect(errors.length).toBe(0);
	});
});
