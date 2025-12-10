import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import schemaArrayItems from "./array-items.js";

describe("schema-array-items", () => {
	it("should warn when array schema lacks items", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Names:
      type: array
      description: A list of names
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaArrayItems],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-array-items");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("items");
	});

	it("should pass when array schema has items", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Names:
      type: array
      description: A list of names
      items:
        type: string
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaArrayItems],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-array-items");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when array items is a $ref", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Users:
      type: array
      description: A list of users
      items:
        $ref: '#/components/schemas/User'
    User:
      type: object
      description: A user
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaArrayItems],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-array-items");
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
    NamesRef:
      $ref: '#/components/schemas/Names'
    Names:
      type: array
      description: A list
      items:
        type: string
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [schemaArrayItems],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-array-items");
		expect(diagnostics.length).toBe(0);
	});

	it("should not check non-array schemas", async () => {
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
			rules: [schemaArrayItems],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "schema-array-items");
		expect(diagnostics.length).toBe(0);
	});
});


