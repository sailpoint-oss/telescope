import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import oauthFlowUrls from "./oauth-flow-urls.js";

describe("oauth-flow-urls", () => {
	it("should error when OAuth2 authorizationCode flow is missing tokenUrl", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://example.com/oauth/authorize
          scopes:
            read: Read access
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [oauthFlowUrls],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "oauth-flow-urls");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("tokenUrl");
	});

	it("should error when OAuth2 implicit flow is missing authorizationUrl", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        implicit:
          scopes:
            read: Read access
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [oauthFlowUrls],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "oauth-flow-urls");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("authorizationUrl");
	});

	it("should pass when OAuth2 flows have valid URLs", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
components:
  securitySchemes:
    OAuth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://example.com/oauth/authorize
          tokenUrl: https://example.com/oauth/token
          scopes:
            read: Read access
paths: {}
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [oauthFlowUrls],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "oauth-flow-urls");
		expect(diagnostics.length).toBe(0);
	});
});

