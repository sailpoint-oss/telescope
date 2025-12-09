import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import pathNoTrailingSlash from "./no-trailing-slash.js";

describe("path-no-trailing-slash", () => {
	it("should warn when path has trailing slash", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users/:
    get:
      summary: List users
      responses:
        '200':
          description: Success
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathNoTrailingSlash],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-no-trailing-slash");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("trailing slash");
	});

	it("should pass when path has no trailing slash", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    get:
      summary: List users
      responses:
        '200':
          description: Success
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathNoTrailingSlash],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-no-trailing-slash");
		expect(diagnostics.length).toBe(0);
	});

	it("should allow root path /", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /:
    get:
      summary: Root endpoint
      responses:
        '200':
          description: Success
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathNoTrailingSlash],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-no-trailing-slash");
		expect(diagnostics.length).toBe(0);
	});
});

