import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import stringMaxLength from "./string-max-length.js";

describe("string-max-length", () => {
	it("should hint when string schema lacks maxLength", async () => {
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
        name:
          type: string
          description: User name
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [stringMaxLength],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "string-max-length");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("maxLength");
	});

	it("should pass when string schema has maxLength", async () => {
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
        name:
          type: string
          maxLength: 255
          description: User name
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [stringMaxLength],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "string-max-length");
		expect(diagnostics.length).toBe(0);
	});

	it("should skip enums", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    Status:
      type: string
      enum:
        - active
        - inactive
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [stringMaxLength],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "string-max-length");
		expect(diagnostics.length).toBe(0);
	});

	it("should skip bounded formats like uuid", async () => {
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
        id:
          type: string
          format: uuid
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [stringMaxLength],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "string-max-length");
		expect(diagnostics.length).toBe(0);
	});
});

