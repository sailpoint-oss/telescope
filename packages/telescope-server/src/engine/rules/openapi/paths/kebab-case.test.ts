import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import pathKebabCase from "./kebab-case.js";

describe("path-kebab-case", () => {
	it("should suggest kebab-case for camelCase path", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /userProfiles:
    get:
      summary: List user profiles
      responses:
        '200':
          description: Success
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathKebabCase],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-kebab-case");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("kebab-case");
	});

	it("should pass for kebab-case path", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /user-profiles:
    get:
      summary: List user profiles
      responses:
        '200':
          description: Success
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathKebabCase],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-kebab-case");
		expect(diagnostics.length).toBe(0);
	});

	it("should skip path parameters", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users/{userId}:
    get:
      summary: Get user
      parameters:
        - name: userId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Success
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathKebabCase],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-kebab-case");
		expect(diagnostics.length).toBe(0);
	});
});

