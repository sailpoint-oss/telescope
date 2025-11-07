import { describe, expect, it } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromExample,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import rootInfo from "./info";

describe("root-info", () => {
	it("should error when info section is missing", async () => {
		const project = await createTestProjectFromExample(
			"test-root-errors.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [rootInfo],
		});

		expect(
			hasDiagnostic(
				result.diagnostics,
				"root-info",
				"must include an info section",
			),
		).toBe(true);
	});

	it("should pass when info section is present", async () => {
		const project = await createTestProjectFromExample(
			"test-root-valid.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [rootInfo],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "root-info");
		expect(diagnostics.length).toBe(0);
	});
});
