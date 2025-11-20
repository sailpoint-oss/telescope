import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
	createTestProjectFromExample,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../test-utils";
import schemaExample from "./example";

describe("schema-example", () => {
	it("should error when schema property lacks example", async () => {
		const project = await createTestProjectFromExample("test-errors.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaExample],
		});

		// Should find errors for SchemaExamplePropertyMissing schema
		const diagnostics = findDiagnostics(result.diagnostics, "schema-example");
		expect(diagnostics.length).toBeGreaterThan(0);
	});

	it("should pass when schema properties have examples", async () => {
		const project = await createTestProjectFromExample("test-valid.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaExample],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-example");
		expect(diagnostics.length).toBe(0);
	});
});
