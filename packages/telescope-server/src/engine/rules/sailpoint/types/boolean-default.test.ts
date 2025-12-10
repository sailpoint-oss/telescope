import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import { createTestProject, findDiagnostics } from "../../test-utils.js";
import booleanDefault from "./boolean-default.js";

describe("boolean-default", () => {
	it("should error when optional boolean parameter lacks default", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      parameters:
        - name: active
          in: query
          required: false
          schema:
            type: boolean
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [booleanDefault],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "boolean-default");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Optional boolean parameters");
	});

	it("should pass when optional boolean parameter has default", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      parameters:
        - name: active
          in: query
          required: false
          schema:
            type: boolean
            default: false
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [booleanDefault],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "boolean-default");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when required boolean parameter lacks default", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
paths:
  /test:
    get:
      parameters:
        - name: active
          in: query
          required: true
          schema:
            type: boolean
      responses:
        '200':
          description: OK
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [booleanDefault],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "boolean-default");
		expect(diagnostics.length).toBe(0);
	});

	it("should error when optional boolean property lacks default", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      required: []
      properties:
        isActive:
          type: boolean
          description: User active status
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [booleanDefault],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "boolean-default");
		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Optional boolean properties");
	});

	it("should pass when optional boolean property has default", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      required: []
      properties:
        isActive:
          type: boolean
          description: User active status
          default: true
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [booleanDefault],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "boolean-default");
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when boolean property is required", async () => {
		const project = await createTestProject(`
openapi: 3.1.0
info:
  title: Test
  version: 1.0.0
components:
  schemas:
    User:
      type: object
      required:
        - isActive
      properties:
        isActive:
          type: boolean
          description: User active status
`);
		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [booleanDefault],
		});

		const diagnostics = findDiagnostics(result.diagnostics, "boolean-default");
		expect(diagnostics.length).toBe(0);
	});
});


