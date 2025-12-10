import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import tagsRequired from "./tags-required.js";

describe("tags-required", () => {
	it("should error when operation lacks tags", async () => {
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
			rules: [tagsRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "tags-required");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("at least one tag");
	});

	it("should error when tags array is empty", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      tags: []
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [tagsRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "tags-required");
		expect(diagnostics.length).toBe(1);
	});

	it("should pass when operation has tags", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      tags:
        - Users
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [tagsRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "tags-required");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when operation has multiple tags", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      tags:
        - Users
        - Admin
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [tagsRequired],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "tags-required");
		expect(diagnostics.length).toBe(0);
	});
});


