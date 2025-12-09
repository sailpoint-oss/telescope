import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import pathCasingConsistency from "./casing-consistency.js";

describe("path-casing-consistency", () => {
	it("should warn when paths use mixed casing", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /user-profiles:
    get:
      responses:
        '200':
          description: OK
  /user_settings:
    get:
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [pathCasingConsistency],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-casing-consistency");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("kebab-case");
		expect(diagnostics[0]?.message).toContain("snake-case");
	});

	it("should pass when all paths use kebab-case", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /user-profiles:
    get:
      responses:
        '200':
          description: OK
  /user-settings:
    get:
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [pathCasingConsistency],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-casing-consistency");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when all paths use snake_case", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /user_profiles:
    get:
      responses:
        '200':
          description: OK
  /user_settings:
    get:
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [pathCasingConsistency],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-casing-consistency");
		expect(diagnostics.length).toBe(0);
	});

	it("should ignore path parameters when checking casing", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /user-profiles/{userId}:
    get:
      responses:
        '200':
          description: OK
  /user-settings/{settingId}:
    get:
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [pathCasingConsistency],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-casing-consistency");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass with single path", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /user-profiles:
    get:
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [pathCasingConsistency],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-casing-consistency");
		expect(diagnostics.length).toBe(0);
	});
});


