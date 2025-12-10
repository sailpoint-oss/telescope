import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import securityGlobalOrOperation from "./security-global-or-operation.js";

describe("security-global-or-operation", () => {
	it("should warn when operations lack security but schemes exist", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
paths:
  /test:
    get:
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [securityGlobalOrOperation],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "security-global-or-operation");
		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics[0]?.message).toContain("no security requirements");
	});

	it("should pass when global security is defined", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
paths:
  /test:
    get:
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [securityGlobalOrOperation],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "security-global-or-operation");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when operation has security", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
paths:
  /test:
    get:
      security:
        - bearerAuth: []
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [securityGlobalOrOperation],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "security-global-or-operation");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when operation explicitly opts out with empty array", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
paths:
  /public:
    get:
      security: []
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [securityGlobalOrOperation],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "security-global-or-operation");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when no security schemes defined", async () => {
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
			rules: [securityGlobalOrOperation],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "security-global-or-operation");
		expect(diagnostics.length).toBe(0);
	});
});


