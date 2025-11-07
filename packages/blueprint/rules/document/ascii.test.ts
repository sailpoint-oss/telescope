import { describe, it, expect } from "bun:test";
import { runEngine } from "engine";
import { createTestProjectFromExample, findDiagnostics } from "../test-utils";
import documentAscii from "./ascii";

describe("document-ascii", () => {
	it("should error when non-ASCII characters are present", async () => {
		const project = await createTestProjectFromExample(
			"test-document-errors.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [documentAscii],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "document-ascii");
		expect(diagnostics.length).toBeGreaterThan(0);
	});

	it("should pass when only ASCII characters are present", async () => {
		const project = await createTestProjectFromExample(
			"test-document-valid.yaml",
		);

		const result = runEngine(project, [project.docs.keys().next().value], {
			rules: [documentAscii],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "document-ascii");
		expect(diagnostics.length).toBe(0);
	});
});
