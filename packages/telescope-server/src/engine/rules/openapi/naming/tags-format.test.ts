import { describe, expect, it } from "bun:test";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import { runEngine } from "../../api.js";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../../test-utils.js";
import operationTagsFormat from "./tags-format.js";

describe("operation-tags-format", () => {
	it("should flag when tag is not Title Case", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-tags-not-title-case",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationTagsFormat],
		});

		expect(
			hasDiagnostic(result.diagnostics, "operation-tags-format", "uppercase letter"),
		).toBe(true);
	});

	it("should warn when tag has duplicate", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-warnings.yaml",
			"/test/operation-tags-warning-duplicate",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationTagsFormat],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-tags-format");
		const warnings = diagnostics.filter(
			(d) => d.severity === DiagnosticSeverity.Warning,
		);
		expect(warnings.length).toBeGreaterThan(0);
	});

	it("should pass when tags are valid Title Case", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/operation-tags-valid",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationTagsFormat],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-tags-format");
		const errors = diagnostics.filter(
			(d) => d.severity === DiagnosticSeverity.Error,
		);
		expect(errors.length).toBe(0);
	});
});
