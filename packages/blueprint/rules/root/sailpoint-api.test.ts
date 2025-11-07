import { describe, expect, it } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromExample,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import rootsailpointApi from "./sailpoint-api";

describe("root-sailpoint-api", () => {
	it("should error when x-sailpoint-api is missing", async () => {
		const project = await createTestProjectFromExample(
			"test-sailpoint-api-should-error-when-missing.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [rootsailpointApi],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"root-sailpoint-api",
				"x-sailpoint-api extension is required",
			),
		).toBe(true);
	});

	it("should error when version is missing", async () => {
		const project = await createTestProjectFromExample(
			"test-sailpoint-api-should-error-when-version-is-missing.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [rootsailpointApi],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"root-sailpoint-api",
				"x-sailpoint-api.version is required",
			),
		).toBe(true);
	});

	it("should error when audience is missing", async () => {
		const project = await createTestProjectFromExample(
			"test-sailpoint-api-should-error-when-audience-is-missing.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [rootsailpointApi],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"root-sailpoint-api",
				"x-sailpoint-api.audience is required",
			),
		).toBe(true);
	});

	it("should pass when both version and audience are present", async () => {
		const project = await createTestProjectFromExample(
			"test-root-valid.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [rootsailpointApi],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"root-sailpoint-api",
		);
		expect(diagnostics.length).toBe(0);
	});
});
