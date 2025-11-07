import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import pathParamsMatch from "./params-match";

describe("path-params-match", () => {
	it("should error when path template parameter is not declared", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/path-params-match-template-not-declared/{id}",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [pathParamsMatch],
		});

		expect(
			hasDiagnostic(result.diagnostics, "path-params-match", "is not declared"),
		).toBe(true);
	});

	it("should error when parameter is not in path", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/path-params-match-parameter-not-in-path/{id}",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [pathParamsMatch],
		});

		// The rule reports when a path template param exists but is not declared as "in: path"
		// In this case, {id} is in the path but parameter is declared as "in: query"
		expect(
			hasDiagnostic(result.diagnostics, "path-params-match", "is not declared"),
		).toBe(true);
	});

	it("should pass when path parameters are correctly declared", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/path-params-match-valid",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [pathParamsMatch],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"path-params-match",
		);
		expect(diagnostics.length).toBe(0);
	});
});
