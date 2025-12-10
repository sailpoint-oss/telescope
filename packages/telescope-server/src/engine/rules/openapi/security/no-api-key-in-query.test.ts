import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import noApiKeyInQuery from "./no-api-key-in-query.js";

describe("no-api-key-in-query", () => {
	it("should warn when API key is in query parameter", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: query
      name: api_key
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [noApiKeyInQuery],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "no-api-key-in-query");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("query");
	});

	it("should pass when API key is in header", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [noApiKeyInQuery],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "no-api-key-in-query");
		expect(diagnostics.length).toBe(0);
	});
});

