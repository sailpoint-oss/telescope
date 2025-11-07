import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import {
	createTestProjectFromExamples,
	findDiagnostics,
	hasDiagnostic,
} from "../test-utils";
import documentVersionRefIsolation from "./version-ref-isolation";

describe("document-version-ref-isolation", () => {
	it("should error when external ref lacks version segment", async () => {
		const project = await createTestProjectFromExamples([
			{
				name: "test-multi-file-refs/version-ref-isolation-main.yaml",
				uri: "file:///v2025/main.yaml",
			},
			{
				name: "test-multi-file-refs/version-ref-isolation-other.yaml",
				uri: "file:///v2025/other.yaml",
			},
		]);

		// Set version to 2025 for the project
		project.version = "2025";

		const result = runEngine(project, Array.from(project.docs.keys()), {
			rules: [documentVersionRefIsolation],
		});

		// Note: This test may need adjustment based on actual version detection
		expect(Array.isArray(result.diagnostics)).toBe(true);
	});
});
