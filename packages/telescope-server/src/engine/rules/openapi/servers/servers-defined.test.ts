import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import serversDefined from "./servers-defined.js";

describe("servers-defined", () => {
	it("should warn when no servers are defined", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [serversDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "servers-defined");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("server");
	});

	it("should pass when servers are defined", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
servers:
  - url: https://api.example.com
    description: Production server
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [serversDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "servers-defined");
		expect(diagnostics.length).toBe(0);
	});

	it("should warn when servers array is empty", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
servers: []
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [serversDefined],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "servers-defined");
		expect(diagnostics.length).toBeGreaterThan(0);
	});
});

