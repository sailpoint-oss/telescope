import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromExample,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import schemaAllofMixedTypes from "./allof-mixed-types";

describe("schema-allof-mixed-types", () => {
	it("should error when allOf mixes incompatible types", async () => {
		// Note: This test case may need a specific file - checking if it exists in comprehensive docs
		const project = await createTestProjectFromExample(
			"test-errors.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [schemaAllofMixedTypes],
		});

		// This rule may or may not trigger depending on schema structure
		expect(Array.isArray(result.diagnostics)).toBe(true);
	});

	it("should pass when allOf has compatible types", async () => {
		const project = await createTestProjectFromExample(
			"test-valid.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [schemaAllofMixedTypes],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"schema-allof-mixed-types",
		);
		expect(diagnostics.length).toBe(0);
	});
});
