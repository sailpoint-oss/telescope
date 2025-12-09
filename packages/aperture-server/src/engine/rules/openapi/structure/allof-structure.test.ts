import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import schemaAllofStructure from "./allof-structure.js";

describe("schema-allof-structure", () => {
	it("should warn when allOf is used with type", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Combined:
      type: object
      allOf:
        - $ref: '#/components/schemas/Base'
      description: A combined schema
    Base:
      type: object
      description: Base schema
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaAllofStructure],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-allof-structure");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("type");
	});

	it("should warn when allOf is used with nullable", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Combined:
      nullable: true
      allOf:
        - $ref: '#/components/schemas/Base'
      description: A combined schema
    Base:
      type: object
      description: Base schema
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaAllofStructure],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-allof-structure");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("nullable");
	});

	it("should warn when allOf is used with properties", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Combined:
      allOf:
        - $ref: '#/components/schemas/Base'
      properties:
        extra:
          type: string
          description: Extra property
      description: A combined schema
    Base:
      type: object
      description: Base schema
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaAllofStructure],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-allof-structure");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("properties");
	});

	it("should pass when allOf is used correctly", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Combined:
      allOf:
        - $ref: '#/components/schemas/Base'
        - $ref: '#/components/schemas/Extension'
      description: A combined schema
    Base:
      type: object
      description: Base schema
    Extension:
      type: object
      description: Extension schema
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaAllofStructure],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-allof-structure");
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
    Ref:
      $ref: '#/components/schemas/Combined'
    Combined:
      allOf:
        - $ref: '#/components/schemas/Base'
      description: A combined schema
    Base:
      type: object
      description: Base schema
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaAllofStructure],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-allof-structure");
		expect(diagnostics.length).toBe(0);
	});

	it("should not check schemas without allOf", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Simple:
      type: object
      properties:
        name:
          type: string
          description: A name
      description: Simple schema
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaAllofStructure],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-allof-structure");
		expect(diagnostics.length).toBe(0);
	});
});


