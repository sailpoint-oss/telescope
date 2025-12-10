import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import parameterRequiredExplicit from "./required-explicit.js";

describe("parameter-required-explicit", () => {
	it("should error when parameter lacks required field", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      parameters:
        - name: id
          in: query
          schema:
            type: string
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterRequiredExplicit],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-required-explicit");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("explicitly declare");
	});

	it("should pass when required: true", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      parameters:
        - name: id
          in: query
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterRequiredExplicit],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-required-explicit");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when required: false", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      parameters:
        - name: id
          in: query
          required: false
          schema:
            type: string
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterRequiredExplicit],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-required-explicit");
		expect(diagnostics.length).toBe(0);
	});

	it("should skip $ref parameters", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      parameters:
        - $ref: '#/components/parameters/IdParam'
      responses:
        '200':
          description: OK
components:
  parameters:
    IdParam:
      name: id
      in: query
      required: true
      schema:
        type: string
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterRequiredExplicit],
		});

		// Only the $ref should be skipped, the actual param definition should pass
		const diagnostics = findDiagnostics(result.diagnostics, "parameter-required-explicit");
		expect(diagnostics.length).toBe(0);
	});
});


