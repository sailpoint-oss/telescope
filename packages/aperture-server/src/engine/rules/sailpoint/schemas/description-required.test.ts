import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import schemaDescriptionRequired from "./description-required.js";

describe("schema-description-required", () => {
	it("should error when schema lacks description", async () => {
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
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-description-required");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics.some(d => d.message.includes("descriptive text"))).toBe(true);
	});

	it("should error when description is empty", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      description: ""
      properties:
        name:
          type: string
          description: ""
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-description-required");
		expect(diagnostics.length).toBeGreaterThan(0);
	});

	it("should pass when schema has description", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      description: A user entity
      properties:
        name:
          type: string
          description: The user's full name
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-description-required");
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
      type: object
      description: A user entity
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-description-required");
		expect(diagnostics.length).toBe(0);
	});

	it("should check nested schema descriptions", async () => {
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
        address:
          type: object
          properties:
            street:
              type: string
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-description-required");
		// Both address and street should have errors
		expect(diagnostics.length).toBeGreaterThanOrEqual(2);
	});
});


