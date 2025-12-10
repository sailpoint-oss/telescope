import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import enumDescription from "./enum-description.js";

describe("enum-description", () => {
	it("should suggest description for enum without one", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Status:
      type: string
      enum:
        - active
        - inactive
        - pending
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [enumDescription],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "enum-description");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("should include a description");
	});

	it("should pass when enum has description", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Status:
      type: string
      description: The status of the resource
      enum:
        - active
        - inactive
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [enumDescription],
		});

		// Should pass or only hint (not main error)
		const diagnostics = findDiagnostics(result.diagnostics, "enum-description");
		const errors = diagnostics.filter(d => d.message.includes("should include a description"));
		expect(errors.length).toBe(0);
	});

	it("should hint when description doesn't mention enum values", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Status:
      type: string
      description: The status field
      enum:
        - active
        - inactive
        - pending
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [enumDescription],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "enum-description");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Consider documenting");
		expect(diagnostics[0]?.severity).toBe(4); // Hint
	});

	it("should pass when description mentions enum values", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Status:
      type: string
      description: "Resource status: active means running, inactive means stopped, pending means waiting"
      enum:
        - active
        - inactive
        - pending
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [enumDescription],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "enum-description");
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
    StatusRef:
      $ref: '#/components/schemas/Status'
    Status:
      type: string
      description: The status
      enum:
        - active
        - inactive
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [enumDescription],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "enum-description");
		expect(diagnostics.length).toBe(0);
	});

	it("should not check schemas without enum", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    Name:
      type: string
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [enumDescription],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "enum-description");
		expect(diagnostics.length).toBe(0);
	});
});


