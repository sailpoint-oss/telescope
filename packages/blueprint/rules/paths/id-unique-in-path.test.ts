import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import operationIdUniqueInPath from "./id-unique-in-path";

describe("operation-id-unique-in-path", () => {
	it("should error when duplicate operationIds exist in same path", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-id-unique-in-path-error",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [operationIdUniqueInPath],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-id-unique-in-path",
				"Duplicate operationId",
			),
		).toBe(true);
	});

	it("should pass when operationIds are unique in path", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/operation-id-unique-in-path-valid",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [operationIdUniqueInPath],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-id-unique-in-path",
		);
		expect(diagnostics.length).toBe(0);
	});
});
