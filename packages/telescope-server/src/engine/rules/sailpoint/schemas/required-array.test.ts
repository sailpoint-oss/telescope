import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import schemaRequiredArray from "./required-array.js";

describe("schema-required-array", () => {
	it("should error when object schema lacks required array", async () => {
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
			rules: [schemaRequiredArray],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-required-array");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("required array");
	});

	it("should pass when object schema has required array", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      required:
        - name
      properties:
        name:
          type: string
          description: User name
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaRequiredArray],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-required-array");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when object schema has empty required array", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      required: []
      properties:
        name:
          type: string
          description: User name
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaRequiredArray],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-required-array");
		expect(diagnostics.length).toBe(0);
	});

	it("should error when required property not in properties", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      required:
        - name
        - email
      properties:
        name:
          type: string
          description: User name
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaRequiredArray],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-required-array");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("email");
		expect(diagnostics[0]?.message).toContain("not defined in properties");
	});

	it("should not error for non-object schemas", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Name:
      type: string
      description: A name
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaRequiredArray],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-required-array");
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
      required:
        - name
      properties:
        name:
          type: string
          description: User name
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaRequiredArray],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-required-array");
		expect(diagnostics.length).toBe(0);
	});
});


