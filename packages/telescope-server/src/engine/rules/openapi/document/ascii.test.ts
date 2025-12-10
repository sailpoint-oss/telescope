import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProjectFromExample,
	findDiagnostics,
	getFirstUri,
} from "../../test-utils.js";
import documentAscii from "./ascii.js";

describe("document-ascii", () => {
	it("should error when non-ASCII characters are present", async () => {
		const project = await createTestProjectFromExample(
			"test-ascii-errors.yaml",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [documentAscii],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "document-ascii");
		expect(diagnostics.length).toBeGreaterThan(0);
	});
});
