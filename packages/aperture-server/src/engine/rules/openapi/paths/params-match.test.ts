import { describe, expect, it } from "bun:test";
import { runEngine } from "../../api.js";
import {
	createTestProject,
	createTestProjectFromComprehensiveDocument,
	createTestProjectFromFiles,
	findDiagnostics,
	getFirstUri,
	hasDiagnostic,
} from "../../test-utils.js";
import pathParamsMatch from "./params-match.js";

describe("path-params-match", () => {
	it("should error when path template parameter is not declared", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/path-params-match-template-not-declared/{id}",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathParamsMatch],
		});

		expect(
			hasDiagnostic(result.diagnostics, "path-params-match", "is not declared"),
		).toBe(true);
	});

	it("should error when parameter is not in path", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-errors.yaml",
			"/test/path-params-match-parameter-not-in-path/{id}",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathParamsMatch],
		});

		// The rule reports when a path template param exists but is not declared as "in: path"
		// In this case, {id} is in the path but parameter is declared as "in: query"
		expect(
			hasDiagnostic(result.diagnostics, "path-params-match", "is not declared"),
		).toBe(true);
	});

	it("should pass when path parameters are correctly declared", async () => {
		const project = await createTestProjectFromComprehensiveDocument(
			"test-valid.yaml",
			"/test/path-params-match-valid",
		);

		const result = runEngine(project, [getFirstUri(project)], {
			rules: [pathParamsMatch],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"path-params-match",
		);
		expect(diagnostics.length).toBe(0);
	});

	it("should pass when path parameter is declared via $ref in a referenced path item file", async () => {
		// This tests the fix for the bug where path parameters in referenced
		// path item files weren't being recognized due to incorrect pointer construction
		const project = await createTestProjectFromFiles([
			{
				uri: "file:///api.yaml",
				content: `
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /items/{id}:
    $ref: './paths/item-by-id.yaml'
`,
			},
			{
				uri: "file:///paths/item-by-id.yaml",
				content: `
get:
  summary: Get item by ID
  operationId: getItemById
  description: Get a specific item
  tags:
    - items
  parameters:
    - $ref: '../parameters/path-id.yaml'
  responses:
    "200":
      description: Success
`,
			},
			{
				uri: "file:///parameters/path-id.yaml",
				content: `
name: id
in: path
required: true
description: The unique identifier
schema:
  type: string
`,
			},
		]);

		const result = runEngine(project, ["file:///api.yaml"], {
			rules: [pathParamsMatch],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"path-params-match",
		);
		expect(diagnostics.length).toBe(0);
	});

	it("should highlight the specific {param} placeholder in diagnostic range", async () => {
		const project = await createTestProject(
			`openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users/{userId}/posts/{postId}:
    get:
      summary: Get post
      operationId: getPost
      responses:
        "200":
          description: OK`,
			"file:///test.yaml",
		);

		const result = runEngine(project, ["file:///test.yaml"], {
			rules: [pathParamsMatch],
		});

		const diagnostics = findDiagnostics(
			result.diagnostics,
			"path-params-match",
		);

		// Should have diagnostics for both missing parameters
		expect(diagnostics.length).toBe(2);

		// Check that the diagnostic ranges are precise (just the {param} not the whole path)
		const userIdDiag = diagnostics.find((d) =>
			d.message.includes("{userId}"),
		);
		const postIdDiag = diagnostics.find((d) =>
			d.message.includes("{postId}"),
		);

		expect(userIdDiag).toBeDefined();
		expect(postIdDiag).toBeDefined();

		// Verify the ranges are different (each points to its own {param})
		if (userIdDiag && postIdDiag) {
			expect(userIdDiag.range.start.character).not.toBe(
				postIdDiag.range.start.character,
			);
		}
	});
});
