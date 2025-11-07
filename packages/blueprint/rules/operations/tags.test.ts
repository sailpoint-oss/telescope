import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import operationTags from "./tags";

describe("operation-tags", () => {
	it("should error when tags are missing", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-tags-missing",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [operationTags],
		});

		expect(
			hasDiagnostic(result.diagnostics, "operation-tags", "at least one tag"),
		).toBe(true);
	});

	it("should error when tag is not Title Case", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-tags-not-title-case",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [operationTags],
		});

		expect(
			hasDiagnostic(result.diagnostics, "operation-tags", "uppercase letter"),
		).toBe(true);
	});

	it("should warn when tag has duplicate", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-warnings.yaml",
			"/test/operation-tags-warning-duplicate",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [operationTags],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-tags");
		const warnings = diagnostics.filter((d) => d.severity === "warning");
		expect(warnings.length).toBeGreaterThan(0);
	});

	it("should pass when tags are valid Title Case", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/operation-tags-valid",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [operationTags],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-tags");
		const errors = diagnostics.filter((d) => d.severity === "error");
		expect(errors.length).toBe(0);
	});
});
