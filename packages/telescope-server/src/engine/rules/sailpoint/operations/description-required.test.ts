import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import operationDescriptionRequired from "./description-required.js";

describe("operation-description-required", () => {
	it("should error when operation lacks description", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-description-required");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("descriptive explanation");
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
      description: ""
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-description-required");
		expect(diagnostics.length).toBe(1);
	});

	it("should error when description contains placeholder text", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      description: "TODO: Add description here"
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-description-required");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("placeholder");
	});

	it("should warn when description is too short", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      description: "Gets data"
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-description-required");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.severity).toBe(2); // Warning
	});

	it("should pass when description is detailed", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      description: "Retrieves the user profile information including name, email, and preferences"
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [operationDescriptionRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "operation-description-required");
		expect(diagnostics.length).toBe(0);
	});
});


