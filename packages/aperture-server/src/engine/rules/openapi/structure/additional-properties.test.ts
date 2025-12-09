import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import additionalPropertiesDefined from "./additional-properties.js";

describe("additional-properties-defined", () => {
	it("should suggest additionalProperties when not defined", async () => {
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
      description: A user
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [additionalPropertiesDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "additional-properties-defined");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("additionalProperties");
	});

	it("should pass when additionalProperties is true", async () => {
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
      additionalProperties: true
      description: A user
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [additionalPropertiesDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "additional-properties-defined");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when additionalProperties is false", async () => {
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
      additionalProperties: false
      description: A user
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [additionalPropertiesDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "additional-properties-defined");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when additionalProperties is a schema", async () => {
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
      additionalProperties:
        type: string
      description: A user
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [additionalPropertiesDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "additional-properties-defined");
		expect(diagnostics.length).toBe(0);
	});

	it("should skip object without properties (free-form)", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    FreeForm:
      type: object
      description: A free-form object
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [additionalPropertiesDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "additional-properties-defined");
		expect(diagnostics.length).toBe(0);
	});

	it("should skip allOf schemas", async () => {
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
      properties:
        extra:
          type: string
          description: Extra
      description: A combined schema
    Base:
      type: object
      description: Base
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [additionalPropertiesDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "additional-properties-defined");
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
      properties:
        name:
          type: string
          description: Name
      additionalProperties: false
      description: A user
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [additionalPropertiesDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "additional-properties-defined");
		expect(diagnostics.length).toBe(0);
	});

	it("should skip non-object schemas", async () => {
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
			rules: [additionalPropertiesDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "additional-properties-defined");
		expect(diagnostics.length).toBe(0);
	});
});


