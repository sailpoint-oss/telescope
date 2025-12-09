import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProjectFromExample,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../../test-utils.js";
import schemaExampleKeys from "./example-keys.js";

describe("schema-example-keys", () => {
	it("should error when example key is too short", async () => {
		const project = await createTestProjectFromExample("test-errors.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaExampleKeys],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"schema-example-keys",
				"at least 6 characters long",
			),
		).toBe(true);
	});

	it("should error when example key is too long", async () => {
		const project = await createTestProjectFromExample("test-errors.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaExampleKeys],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"schema-example-keys",
				"no more than 20 characters long",
			),
		).toBe(true);
	});

	it("should pass when example keys are valid", async () => {
		const project = await createTestProjectFromExample("test-valid.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaExampleKeys],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"schema-example-keys",
		);
		expect(diagnostics.length).toBe(0);
	});
});
