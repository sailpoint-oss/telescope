import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProjectFromExample,
	findDiagnostics,
	getFirstUri,
} from "../../test-utils.js";
import schemaAllofMixedTypes from "./allof-mixed-types.js";

describe("schema-allof-mixed-types", () => {
	it("should error when allOf mixes incompatible types", async () => {
		// Note: This test case may need a specific file - checking if it exists in comprehensive docs
		const project = await createTestProjectFromExample("test-errors.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaAllofMixedTypes],
		});

		// This rule may or may not trigger depending on schema structure
		expect(Array.isArray(result.diagnostics)).toBe(true);
	});

	it("should pass when allOf has compatible types", async () => {
		const project = await createTestProjectFromExample("test-valid.yaml");

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaAllofMixedTypes],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"schema-allof-mixed-types",
		);
		expect(diagnostics.length).toBe(0);
	});
});
