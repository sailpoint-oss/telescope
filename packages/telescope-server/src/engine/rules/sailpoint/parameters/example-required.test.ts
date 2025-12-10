import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import parameterExampleRequired from "./example-required.js";

describe("parameter-example-required", () => {
	it("should error when parameter lacks example", async () => {
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
          description: The ID
          schema:
            type: string
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterExampleRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-example-required");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("example");
	});

	it("should pass when parameter has direct example", async () => {
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
          description: The ID
          example: "abc123"
          schema:
            type: string
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterExampleRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-example-required");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when parameter has examples object", async () => {
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
          description: The ID
          examples:
            example1:
              value: "abc123"
          schema:
            type: string
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterExampleRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-example-required");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when schema has example", async () => {
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
          description: The ID
          schema:
            type: string
            example: "abc123"
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterExampleRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-example-required");
		expect(diagnostics.length).toBe(0);
	});

	it("should error when schema is $ref without example", async () => {
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
          description: The ID
          schema:
            $ref: '#/components/schemas/Id'
      responses:
        '200':
          description: OK
components:
  schemas:
    Id:
      type: string
      description: An ID
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterExampleRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-example-required");
		expect(diagnostics.length).toBe(1);
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
      description: The unique identifier
      example: "abc123"
      schema:
        type: string
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterExampleRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-example-required");
		expect(diagnostics.length).toBe(0);
	});
});


