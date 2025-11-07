import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromExample,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import schemaDescription from "./description";

describe("schema-description", () => {
	it("should error when schema property lacks description", async () => {
		const project = await createTestProjectFromExample(
			"test-errors.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [schemaDescription],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"schema-description",
				"descriptive text",
			),
		).toBe(true);
	});

	it("should pass when schema properties have descriptions", async () => {
		const project = await createTestProjectFromExample(
			"test-valid.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [schemaDescription],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"schema-description",
		);
		expect(diagnostics.length).toBe(0);
	});
});
