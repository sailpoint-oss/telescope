import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import operationDeprecatedDescription from "./deprecated-description.js";

describe("operation-deprecated-description", () => {
	it("should suggest description for deprecated operation without description", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    get:
      summary: List users
      deprecated: true
      responses:
        '200':
          description: Success
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationDeprecatedDescription],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-deprecated-description");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("description");
	});

	it("should suggest mentioning deprecation in description", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    get:
      summary: List users
      description: Returns all users in the system.
      deprecated: true
      responses:
        '200':
          description: Success
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationDeprecatedDescription],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-deprecated-description");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("deprecation reason");
	});

	it("should pass when deprecated operation has proper deprecation info", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    get:
      summary: List users
      description: |
        This endpoint is deprecated and will be removed in v2.0.
        Please migrate to /api/v2/users instead.
      deprecated: true
      responses:
        '200':
          description: Success
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationDeprecatedDescription],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-deprecated-description");
		expect(diagnostics.length).toBe(0);
	});

	it("should not check non-deprecated operations", async () => {
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
			rules: [operationDeprecatedDescription],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-deprecated-description");
		expect(diagnostics.length).toBe(0);
	});
});

