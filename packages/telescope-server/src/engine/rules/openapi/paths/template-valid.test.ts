import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import pathTemplateValid from "./template-valid.js";

describe("path-template-valid", () => {
	it("should pass for valid path templates (including embedded expressions and root '/')", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /:
    get:
      responses:
        "200":
          description: OK
  /users/{id}/posts:
    get:
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: OK
  /foo{bar}baz:
    get:
      parameters:
        - name: bar
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: OK
  x-internal:
    get:
      responses:
        "200":
          description: OK
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathTemplateValid],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-template-valid");
		expect(diagnostics.length).toBe(0);
	});

	it("should error for empty segments (//)", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users//{id}:
    get:
      responses:
        "200":
          description: OK
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathTemplateValid],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-template-valid");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("empty segments");
	});

	it("should error for duplicate template expressions", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users/{id}/{id}:
    get:
      responses:
        "200":
          description: OK
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathTemplateValid],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-template-valid");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("must not appear more than once");
	});

	it("should error for invalid percent-encoding", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /%ZZ:
    get:
      responses:
        "200":
          description: OK
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathTemplateValid],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "path-template-valid");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("percent-encoding");
	});
});


