import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import pathNoHttpVerbs from "./no-http-verbs.js";

describe("path-no-http-verbs", () => {
	it("should warn when path contains HTTP verb", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /get-users:
    get:
      summary: List users
      responses:
        '200':
          description: Success
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathNoHttpVerbs],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-no-http-verbs");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("get");
	});

	it("should suggest avoiding action words", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /create-user:
    post:
      summary: Create user
      responses:
        '201':
          description: Created
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathNoHttpVerbs],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-no-http-verbs");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("create");
	});

	it("should pass for resource-based paths", async () => {
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
    post:
      summary: Create user
      responses:
        '201':
          description: Created
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathNoHttpVerbs],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-no-http-verbs");
		expect(diagnostics.length).toBe(0);
	});
});

