import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import operationErrorResponses from "./error-responses.js";

describe("operation-error-responses", () => {
	it("should error when missing success response", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        '400':
          description: Bad Request
        '401':
          description: Unauthorized
        '403':
          description: Forbidden
        '429':
          description: Too Many Requests
        '500':
          description: Internal Server Error
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationErrorResponses],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-error-responses");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("2xx success response");
	});

	it("should error when missing error responses", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationErrorResponses],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-error-responses");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("400");
		expect(diagnostics[0]?.message).toContain("401");
		expect(diagnostics[0]?.message).toContain("403");
		expect(diagnostics[0]?.message).toContain("429");
		expect(diagnostics[0]?.message).toContain("500");
	});

	it("should error when missing some error responses", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        '200':
          description: OK
        '400':
          description: Bad Request
        '401':
          description: Unauthorized
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationErrorResponses],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-error-responses");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("403");
		expect(diagnostics[0]?.message).toContain("429");
		expect(diagnostics[0]?.message).toContain("500");
	});

	it("should pass when all required responses defined", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        '200':
          description: OK
        '400':
          description: Bad Request
        '401':
          description: Unauthorized
        '403':
          description: Forbidden
        '429':
          description: Too Many Requests
        '500':
          description: Internal Server Error
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationErrorResponses],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-error-responses");
		expect(diagnostics.length).toBe(0);
	});

	it("should accept 201 as success response", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    post:
      responses:
        '201':
          description: Created
        '400':
          description: Bad Request
        '401':
          description: Unauthorized
        '403':
          description: Forbidden
        '429':
          description: Too Many Requests
        '500':
          description: Internal Server Error
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationErrorResponses],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-error-responses");
		expect(diagnostics.length).toBe(0);
	});
});


