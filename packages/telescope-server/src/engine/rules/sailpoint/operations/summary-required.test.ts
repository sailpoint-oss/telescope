import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import operationSummaryRequired from "./summary-required.js";

describe("operation-summary-required", () => {
	it("should error when operation lacks summary", async () => {
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
			rules: [operationSummaryRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-summary-required");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("must include a short summary");
	});

	it("should error when summary is empty", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      summary: ""
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationSummaryRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-summary-required");
		expect(diagnostics.length).toBe(1);
	});

	it("should error when summary is whitespace only", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      summary: "   "
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationSummaryRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-summary-required");
		expect(diagnostics.length).toBe(1);
	});

	it("should pass when summary is concise", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      summary: Get user
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationSummaryRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-summary-required");
		expect(diagnostics.length).toBe(0);
	});

	it("should warn when summary exceeds 5 words", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      summary: Get the user profile data now
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationSummaryRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-summary-required");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.severity).toBe(2); // Warning
	});
});


