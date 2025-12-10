import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../../test-utils.js";
import operationSecurityRequirements from "./security-requirements.js";

describe("operation-security-requirements", () => {
	it("should error when security is missing", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-security-missing",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationSecurityRequirements],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-security-requirements",
				"security requirements",
			),
		).toBe(true);
	});

	it("should pass when security has empty object for public access", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/operation-security-valid-public",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationSecurityRequirements],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"operation-security-requirements",
		);
		expect(diagnostics.length).toBe(0);
	});

	it("should error when invalid security key is used", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/operation-security-invalid-key",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationSecurityRequirements],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"operation-security-requirements",
				"userAuth, applicationAuth",
			),
		).toBe(true);
	});
});
