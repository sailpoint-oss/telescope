import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import operationRequestBodyContent from "./request-body-content.js";

describe("operation-request-body-content", () => {
	it("should error when request body has no content", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    post:
      summary: Create user
      requestBody:
        description: User to create
        required: true
      responses:
        '201':
          description: Created
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationRequestBodyContent],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-request-body-content");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("content");
	});

	it("should pass when request body has content", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    post:
      summary: Create user
      requestBody:
        description: User to create
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
      responses:
        '201':
          description: Created
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationRequestBodyContent],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-request-body-content");
		expect(diagnostics.length).toBe(0);
	});

	it("should error when content object is empty", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    post:
      summary: Create user
      requestBody:
        description: User to create
        required: true
        content: {}
      responses:
        '201':
          description: Created
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [operationRequestBodyContent],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-request-body-content");
		expect(diagnostics.length).toBeGreaterThan(0);
	});
});

