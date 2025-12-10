import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../../test-utils.js";
import parameterFilters from "./filters.js";

describe("parameter-filters", () => {
	it("should error when filters parameter lacks description", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-filters-missing-description",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [parameterFilters],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"parameter-filters",
				"standard collection parameter",
			),
		).toBe(true);
	});

	it("should error when filters description lacks required link", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-filters-description-lacks-link",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [parameterFilters],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"parameter-filters",
				"description must reference",
			),
		).toBe(true);
	});

	it("should pass when filters has proper description", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/parameter-filters-valid",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [parameterFilters],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"parameter-filters",
		);
		expect(diagnostics.length).toBe(0);
	});
});
