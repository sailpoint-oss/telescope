import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import schemaExampleRequired from "./example-required.js";

describe("schema-example-required", () => {
	it("should error when string schema lacks example", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      properties:
        name:
          type: string
          description: User name
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaExampleRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-example-required");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics.some(d => d.message.includes("example value"))).toBe(true);
	});

	it("should pass when schema has example", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      properties:
        name:
          type: string
          description: User name
          example: John Doe
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaExampleRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-example-required");
		expect(diagnostics.length).toBe(0);
	});

	it("should skip object schemas - they don't need direct examples", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      description: A user
      properties:
        name:
          type: string
          description: User name
          example: John
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaExampleRequired],
		});

		// User object doesn't need example, name has example
		const diagnostics = findDiagnostics(result.diagnostics, "schema-example-required");
		expect(diagnostics.length).toBe(0);
	});

	it("should skip array schemas", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Names:
      type: array
      description: List of names
      items:
        type: string
        description: A name
        example: John
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaExampleRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-example-required");
		expect(diagnostics.length).toBe(0);
	});

	it("should skip $ref schemas", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    UserRef:
      $ref: '#/components/schemas/User'
    User:
      type: string
      description: User name
      example: John
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaExampleRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-example-required");
		expect(diagnostics.length).toBe(0);
	});

	it("should error for integer without example", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Data:
      type: object
      properties:
        count:
          type: integer
          format: int32
          description: Count of items
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaExampleRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-example-required");
		expect(diagnostics.length).toBe(1);
	});
});


