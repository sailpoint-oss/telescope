import { describe, expect, it } from "bun:test";
import { runEngine } from "lens";
import {
	createTestProjectFromExample,
	findDiagnostics,
	getFirstUri,
} from "../test-utils";
import documentAscii from "./ascii";

describe("document-ascii", () => {
	it("should error when non-ASCII characters are present", async () => {
		const project = await createTestProjectFromExample(
			"test-document-errors.yaml",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [documentAscii],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "document-ascii");
		expect(diagnostics.length).toBeGreaterThan(0);
	});

	it("should pass when only ASCII characters are present", async () => {
		const project = await createTestProjectFromExample(
			"test-document-valid.yaml",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [documentAscii],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "document-ascii");
		expect(diagnostics.length).toBe(0);
	});
});
