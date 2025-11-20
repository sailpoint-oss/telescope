import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../test-utils";
import parameterExampleKeys from "./example-keys";

describe("parameter-example-keys", () => {
	it("should error when example key is too short", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-example-keys-too-short",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [parameterExampleKeys],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"parameter-example-keys",
				"at least 6 characters long",
			),
		).toBe(true);
	});

	it("should error when example key is too long", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-example-keys-too-long",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [parameterExampleKeys],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"parameter-example-keys",
				"no more than 20 characters long",
			),
		).toBe(true);
	});

	it("should pass when example keys are valid length", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/parameter-example-keys-valid-length",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [parameterExampleKeys],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"parameter-example-keys",
		);
		expect(diagnostics.length).toBe(0);
	});
});
