import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../test-utils";
import operationResponses from "./responses";

describe("operation-responses", () => {
	it("should error when responses are missing", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-responses-missing",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationResponses],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-responses",
				"must document responses",
			),
		).toBe(true);
	});

	it("should error when no 2xx success response is present", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-responses-no-success",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationResponses],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-responses",
				"2xx success response",
			),
		).toBe(true);
	});

	it("should error when required error codes are missing", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-responses-missing-errors",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationResponses],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-responses",
				"error responses",
			),
		).toBe(true);
	});

	it("should pass when all required responses are present", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/operation-responses-valid",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationResponses],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-responses",
		);
		expect(diagnostics.length).toBe(0);
	});
});
