import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
	createTestProjectFromExample,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../test-utils";
import rootTags from "./tags";

describe("root-tags", () => {
	it("should error when tags array is missing", async () => {
		const project = await createTestProjectFromExample(
			"test-sailpoint-api-should-error-when-missing.yaml",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [rootTags],
		});

		expect(
			hasDiagnostic(result.diagnostics, "root-tags", "must be present"),
		).toBe(true);
	});

	it("should error when tags are not alphabetically sorted", async () => {
		const project = await createTestProjectFromExample(
			"test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [rootTags],
		});

		expect(
			hasDiagnostic(result.diagnostics, "root-tags", "alphabetically"),
		).toBe(true);
	});

	it("should pass when tags are alphabetically sorted", async () => {
		const project = await createTestProjectFromExample("test-root-valid.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [rootTags],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "root-tags");
		expect(diagnostics.length).toBe(0);
	});
});
