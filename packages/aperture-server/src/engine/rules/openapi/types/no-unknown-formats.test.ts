import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import noUnknownFormats from "./no-unknown-formats.js";

describe("no-unknown-formats", () => {
	it("should suggest using standard formats for unknown format", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      properties:
        customField:
          type: string
          format: my-custom-format
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [noUnknownFormats],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "no-unknown-formats");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("my-custom-format");
	});

	it("should pass for standard formats", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      properties:
        email:
          type: string
          format: email
        id:
          type: string
          format: uuid
        age:
          type: integer
          format: int32
        createdAt:
          type: string
          format: date-time
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [noUnknownFormats],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "no-unknown-formats");
		expect(diagnostics.length).toBe(0);
	});
});

