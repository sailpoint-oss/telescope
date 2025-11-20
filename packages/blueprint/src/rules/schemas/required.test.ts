import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
	createTestProjectFromExample,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../test-utils";
import schemaRequired from "./required";

describe("schema-required", () => {
	it("should error when object schema with properties lacks required array", async () => {
		const project = await createTestProjectFromExample("test-errors.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaRequired],
		});

		expect(
			hasDiagnostic(result.diagnostics, "schema-required", "required array"),
		).toBe(true);
	});

	it("should pass when object schema has required array", async () => {
		const project = await createTestProjectFromExample("test-valid.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-required");
		expect(diagnostics.length).toBe(0);
	});
});
