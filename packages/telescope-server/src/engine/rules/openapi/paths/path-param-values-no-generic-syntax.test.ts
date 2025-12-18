import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics, getFirstUri } from "../../test-utils.js";
import pathParamValuesNoGenericSyntax from "./path-param-values-no-generic-syntax.js";

describe("path-param-values-no-generic-syntax", () => {
	it("should error when path param example contains '/'", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          example: "a/b"
          schema:
            type: string
      responses:
        "200":
          description: OK
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathParamValuesNoGenericSyntax],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"path-param-values-no-generic-syntax",
		);
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("must not contain unescaped '/'");
	});

	it("should pass when path param example is percent-encoded", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          example: "a%2Fb"
          schema:
            type: string
            default: "a%23b"
            example: "a%3Fb"
      responses:
        "200":
          description: OK
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathParamValuesNoGenericSyntax],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"path-param-values-no-generic-syntax",
		);
		expect(diagnostics.length).toBe(0);
	});

	it("should error for examples[*].value and schema.default", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users/{id}:
    get:
      parameters:
        - name: id
          in: path
          required: true
          examples:
            bad:
              value: "a?b"
          schema:
            type: string
            default: "a#b"
      responses:
        "200":
          description: OK
`);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathParamValuesNoGenericSyntax],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"path-param-values-no-generic-syntax",
		);
		expect(diagnostics.length).toBe(2);
	});
});


