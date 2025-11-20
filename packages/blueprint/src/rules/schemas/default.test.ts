import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
	createTestProjectFromExample,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../test-utils";
import schemaDefault from "./default";

describe("schema-default", () => {
	it("should error when optional boolean property lacks default", async () => {
		const project = await createTestProjectFromExample("test-errors.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaDefault],
		});

		expect(
			hasDiagnostic(result.diagnostics, "schema-default", "default value"),
		).toBe(true);
	});

	it("should pass when optional boolean has default", async () => {
		const project = await createTestProjectFromExample("test-valid.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaDefault],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-default");
		expect(diagnostics.length).toBe(0);
	});
});
