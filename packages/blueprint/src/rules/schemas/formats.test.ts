import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
	createTestProjectFromExample,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../test-utils";
import schemaFormats from "./formats";

describe("schema-formats", () => {
	it("should error when integer property lacks format", async () => {
		const project = await createTestProjectFromExample("test-errors.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaFormats],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"schema-formats",
				"format int32 or int64",
			),
		).toBe(true);
	});

	it("should error when number property lacks format", async () => {
		const project = await createTestProjectFromExample("test-errors.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaFormats],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"schema-formats",
				"format float or double",
			),
		).toBe(true);
	});

	it("should pass when integer has valid format", async () => {
		const project = await createTestProjectFromExample("test-valid.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaFormats],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-formats");
		expect(diagnostics.length).toBe(0);
	});
});
