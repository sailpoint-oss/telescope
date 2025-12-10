import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import securitySchemesDefined from "./security-schemes-defined.js";

describe("security-schemes-defined", () => {
	it("should warn when no security schemes are defined", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    get:
      summary: List users
      responses:
        '200':
          description: Success
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [securitySchemesDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "security-schemes-defined");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("security schemes");
	});

	it("should pass when security schemes are defined", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
paths:
  /users:
    get:
      summary: List users
      responses:
        '200':
          description: Success
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [securitySchemesDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "security-schemes-defined");
		expect(diagnostics.length).toBe(0);
	});
});

