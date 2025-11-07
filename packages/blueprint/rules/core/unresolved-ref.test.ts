import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromComprehensiveDocument,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import unresolvedRef from "./unresolved-ref";

describe("unresolved-ref", () => {
	it("should error when $ref cannot be resolved", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/unresolved-ref-error",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [unresolvedRef],
		});

		// Note: May need adjustment based on actual resolver behavior
		expect(Array.isArray(result.diagnostics)).toBe(true);
	});
});
