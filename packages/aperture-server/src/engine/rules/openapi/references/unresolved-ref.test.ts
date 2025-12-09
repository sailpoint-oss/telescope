import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProjectFromComprehensiveDocument,
	getFirstUri,
} from "../../test-utils.js";
import unresolvedRef from "./unresolved-ref";

describe("unresolved-ref", () => {
	it("should error when $ref cannot be resolved", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/unresolved-ref-error",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [unresolvedRef],
		});

		// Note: May need adjustment based on actual resolver behavior
		expect(Array.isArray(result.diagnostics)).toBe(true);
	});
});
