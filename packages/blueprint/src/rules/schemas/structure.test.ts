import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
	createTestProjectFromExample,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../test-utils";
import schemaStructure from "./structure";

describe("schema-structure", () => {
	it("should error when allOf is used with type at same level", async () => {
		const project = await createTestProjectFromExample("test-errors.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaStructure],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"schema-structure",
				"allOf cannot be used with 'type'",
			),
		).toBe(true);
	});

	it("should error when array schema lacks items", async () => {
		const project = await createTestProjectFromExample("test-errors.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaStructure],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"schema-structure",
				"must define 'items'",
			),
		).toBe(true);
	});

	it("should pass when schema structure is valid", async () => {
		const project = await createTestProjectFromExample("test-valid.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaStructure],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-structure");
		expect(diagnostics.length).toBe(0);
	});
});
