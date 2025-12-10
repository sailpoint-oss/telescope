import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProjectFromExamples,
	findDiagnostics,
	hasDiagnostic,
} from "../../test-utils.js";
import operationIdUnique from "./operationid-unique.js";

describe("operation-id-unique", () => {
	it("should error when duplicate operationIds exist across files", async () => {
		const project = await createTestProjectFromExamples([
			{
				name: "test-multi-file-refs/id-unique-file1.yaml",
				uri: "file:///file1.yaml",
			},
			{
				name: "test-multi-file-refs/id-unique-file2.yaml",
				uri: "file:///file2.yaml",
			},
		]);

		const result = runEngine(project, Array.from(project.docs.keys()), {
			rules: [operationIdUnique],
		});

		expect(
			hasDiagnostic(result.diagnostics, "operationid-unique", "duplicate"),
		).toBe(true);
	});

	it("should pass when operationIds are unique", async () => {
		const project = await createTestProjectFromExamples([
			{
				name: "test-multi-file-refs/id-unique-file1-unique.yaml",
				uri: "file:///file1.yaml",
			},
			{
				name: "test-multi-file-refs/id-unique-file2-unique.yaml",
				uri: "file:///file2.yaml",
			},
		]);

		const result = runEngine(project, Array.from(project.docs.keys()), {
			rules: [operationIdUnique],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operationid-unique",
		);
		expect(diagnostics.length).toBe(0);
	});
});
