import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import parameterDescriptionRequired from "./description-required.js";

describe("parameter-description-required", () => {
	it("should error when parameter lacks description", async () => {
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
			rules: [parameterDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-description-required");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("descriptive explanation");
	});

	it("should error when description is too short", async () => {
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
          description: "ID"
          schema:
            type: string
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-description-required");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("at least 8 characters");
	});

	it("should pass when description is adequate", async () => {
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
          description: "The unique identifier for the resource"
          schema:
            type: string
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-description-required");
		expect(diagnostics.length).toBe(0);
	});

	it("should error when description is empty", async () => {
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
          description: ""
          schema:
            type: string
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-description-required");
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
      description: The unique identifier for the resource
      schema:
        type: string
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [parameterDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "parameter-description-required");
		expect(diagnostics.length).toBe(0);
	});
});


