import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import discriminatorMappingComplete from "./discriminator-mapping.js";

describe("discriminator-mapping-complete", () => {
	it("should error when discriminator lacks propertyName", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Pet:
      oneOf:
        - $ref: '#/components/schemas/Cat'
        - $ref: '#/components/schemas/Dog'
      discriminator: {}
      description: A pet
    Cat:
      type: object
      description: Cat
    Dog:
      type: object
      description: Dog
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [discriminatorMappingComplete],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "discriminator-mapping-complete");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("propertyName");
	});

	it("should warn when mapping is incomplete", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Pet:
      oneOf:
        - $ref: '#/components/schemas/Cat'
        - $ref: '#/components/schemas/Dog'
      discriminator:
        propertyName: petType
        mapping:
          cat: '#/components/schemas/Cat'
      description: A pet
    Cat:
      type: object
      properties:
        petType:
          type: string
      description: Cat
    Dog:
      type: object
      properties:
        petType:
          type: string
      description: Dog
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [discriminatorMappingComplete],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "discriminator-mapping-complete");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Dog");
	});

	it("should pass when mapping is complete", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Pet:
      oneOf:
        - $ref: '#/components/schemas/Cat'
        - $ref: '#/components/schemas/Dog'
      discriminator:
        propertyName: petType
        mapping:
          cat: '#/components/schemas/Cat'
          dog: '#/components/schemas/Dog'
      description: A pet
    Cat:
      type: object
      description: Cat
    Dog:
      type: object
      description: Dog
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [discriminatorMappingComplete],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "discriminator-mapping-complete");
		expect(diagnostics.length).toBe(0);
	});

	it("should warn when inline schema lacks discriminator property", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Pet:
      oneOf:
        - type: object
          properties:
            name:
              type: string
          description: Cat
      discriminator:
        propertyName: petType
      description: A pet
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [discriminatorMappingComplete],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "discriminator-mapping-complete");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("petType");
	});

	it("should skip schemas without discriminator", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Pet:
      oneOf:
        - $ref: '#/components/schemas/Cat'
        - $ref: '#/components/schemas/Dog'
      description: A pet
    Cat:
      type: object
      description: Cat
    Dog:
      type: object
      description: Dog
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [discriminatorMappingComplete],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "discriminator-mapping-complete");
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
    PetRef:
      $ref: '#/components/schemas/Pet'
    Pet:
      oneOf:
        - $ref: '#/components/schemas/Cat'
      discriminator:
        propertyName: petType
      description: A pet
    Cat:
      type: object
      properties:
        petType:
          type: string
      description: Cat
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [discriminatorMappingComplete],
		});

		// Should only check the actual Pet schema, not the ref
		const diagnostics = findDiagnostics(result.diagnostics, "discriminator-mapping-complete");
		expect(diagnostics.length).toBe(0);
	});
});


