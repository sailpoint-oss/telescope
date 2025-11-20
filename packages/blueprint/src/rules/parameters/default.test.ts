import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../test-utils";
import parameterDefault from "./default";

describe("parameter-default", () => {
	it("should error when optional boolean parameter lacks default", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-default-missing",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [parameterDefault],
		});

		expect(
			hasDiagnostic(result.diagnostics, "parameter-default", "default"),
		).toBe(true);
	});

	it("should pass when optional boolean has default", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/parameter-default-valid",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [parameterDefault],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"parameter-default",
		);
		expect(diagnostics.length).toBe(0);
	});
});
