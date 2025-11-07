import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import parameterExample from "./example";

describe("parameter-example", () => {
	it("should error when parameter lacks example", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/parameter-example-missing",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterExample],
		});

		expect(
			hasDiagnostic(result.diagnostics, "parameter-example", "example"),
		).toBe(true);
	});

	it("should pass when parameter has example", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/parameter-example-valid",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [parameterExample],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"parameter-example",
		);
		expect(diagnostics.length).toBe(0);
	});
});
