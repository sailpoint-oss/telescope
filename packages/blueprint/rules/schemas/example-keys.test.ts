import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromExample,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import schemaExampleKeys from "./example-keys";

describe("schema-example-keys", () => {
	it("should error when example key is too short", async () => {
		const project = await createTestProjectFromExample(
			"test-errors.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
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
		const project = await createTestProjectFromExample(
			"test-errors.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
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
		const project = await createTestProjectFromExample(
			"test-valid.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [schemaExampleKeys],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"schema-example-keys",
		);
		expect(diagnostics.length).toBe(0);
	});
});
