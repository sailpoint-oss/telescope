import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import serverUrlHttps from "./server-url-https.js";

describe("server-url-https", () => {
	it("should warn when production server uses HTTP", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
servers:
  - url: http://api.example.com
    description: Production server
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [serverUrlHttps],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "server-url-https");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("HTTPS");
	});

	it("should pass when server uses HTTPS", async () => {
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
			rules: [serverUrlHttps],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "server-url-https");
		expect(diagnostics.length).toBe(0);
	});

	it("should allow HTTP for localhost", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
servers:
  - url: http://localhost:3000
    description: Development server
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [serverUrlHttps],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "server-url-https");
		expect(diagnostics.length).toBe(0);
	});

	it("should allow relative URLs", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
servers:
  - url: /api/v1
    description: Relative path
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [serverUrlHttps],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "server-url-https");
		expect(diagnostics.length).toBe(0);
	});
});

