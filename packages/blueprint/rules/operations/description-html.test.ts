import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import operationDescriptionHtml from "./description-html";

describe("operation-description-html", () => {
	it("should error when description contains HTML tags", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-description-html-tags",
		);

		const result = runEngine(project, [project.docs.keys().next().value!], {
			rules: [operationDescriptionHtml],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-description-html",
				"raw HTML tags",
			),
		).toBe(true);
	});

	it("should error when description contains invalid HTML entities", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-description-html-entity",
		);

		const result = runEngine(project, [project.docs.keys().next().value!], {
			rules: [operationDescriptionHtml],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-description-html",
				"HTML entities",
			),
		).toBe(true);
	});

	it("should pass when description is clean", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/operation-description-html-valid",
		);

		const result = runEngine(project, [project.docs.keys().next().value!], {
			rules: [operationDescriptionHtml],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-description-html",
		);
		expect(diagnostics.length).toBe(0);
	});
});
