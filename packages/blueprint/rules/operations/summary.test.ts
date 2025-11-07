import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import operationSummary from "./summary";

describe("operation-summary", () => {
	it("should error when summary is missing", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-summary-missing",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [operationSummary],
		});

		expect(
			hasDiagnostic(result.diagnostics, "operation-summary", "short summary"),
		).toBe(true);
	});

	it("should warn when summary exceeds 5 words", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-warnings.yaml",
			"/test/operation-summary-warning",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [operationSummary],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-summary",
		);
		const warnings = diagnostics.filter((d) => d.severity === "warning");
		expect(warnings.length).toBeGreaterThan(0);
	});

	it("should pass when summary is 5 words or less", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/operation-summary-valid",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [operationSummary],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-summary",
		);
		expect(diagnostics.length).toBe(0);
	});
});
