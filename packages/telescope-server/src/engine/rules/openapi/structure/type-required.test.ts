import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import schemaTypeRequired from "./type-required.js";

describe("schema-type-required", () => {
	it("should warn when schema has no type", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    User:
      properties:
        name:
          description: User name
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaTypeRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-type-required");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("type");
	});

	it("should pass when schema has type", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      properties:
        name:
          type: string
          description: User name
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaTypeRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-type-required");
		expect(diagnostics.length).toBe(0);
	});

	it("should skip schemas with composition keywords", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  schemas:
    Combined:
      allOf:
        - $ref: '#/components/schemas/Base'
        - type: object
          properties:
            extra:
              type: string
    Base:
      type: object
      properties:
        id:
          type: string
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [schemaTypeRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-type-required");
		// Only the Combined schema uses allOf, should not warn
		expect(diagnostics.every(d => !d.message.includes("Combined"))).toBe(true);
	});
});

