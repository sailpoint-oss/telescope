import { describe, expect, test } from "bun:test";
import { buildGenericContext, buildRuleContext } from "./context";
import { runGenericRule, runOpenAPIRule } from "./engine";
import type { RunRulesRequest } from "./types";

function makeRequest(overrides: Partial<RunRulesRequest> = {}): RunRulesRequest {
	return {
		documentURI: "file:///workspace/spec.yaml",
		ruleIDs: ["test-rule"],
		document: {
			uri: "file:///workspace/spec.yaml",
			ast: {
				openapi: "3.1.0",
				info: { title: "Spec", version: "1.0.0" },
				tags: [{ name: "Users" }],
				paths: {
					"/users": {
						parameters: [{ name: "tenantId", in: "path" }],
						get: {
							operationId: "listUsers",
							parameters: [{ name: "id", in: "query" }],
							requestBody: { required: true },
							responses: {
								"200": { description: "ok" },
							},
						},
					},
				},
				components: {
					schemas: { User: { type: "object" } },
					examples: { UserExample: { value: { id: "1" } } },
					headers: { RequestId: { schema: { type: "string" } } },
					securitySchemes: { Bearer: { type: "http", scheme: "bearer" } },
					parameters: { Limit: { name: "limit", in: "query" } },
					responses: { Default: { description: "default" } },
					requestBodies: { CreateUser: { required: true } },
				},
			},
			rawText:
				"openapi: 3.1.0\npaths:\n  /users:\n    get:\n      summary: List users\n",
			format: "yaml",
			version: "3.1.0",
			pointers: {
				"/paths/~1users": [2, 2, 3, 7],
				"/paths/~1users/get": [3, 4, 4, 25],
				"/paths/~1users/get/summary": [4, 6, 4, 24],
			},
		},
		project: {
			operationIds: { listUsers: ["file:///workspace/spec.yaml"] },
			componentRefs: { "#/components/schemas/User": ["file:///workspace/spec.yaml"] },
			tags: { Users: ["file:///workspace/spec.yaml"] },
		},
		...overrides,
	};
}

describe("buildRuleContext", () => {
	test("reportAt uses pointer locations and default codes", () => {
		const req = makeRequest();
		const ctx = buildRuleContext(req);
		ctx._defaultCode = "custom-operation-summary";
		ctx.reportAt(
			{ uri: req.document.uri, pointer: "/paths/~1users/get" } as never,
			"summary",
			{ message: "summary required", severity: "error" },
		);

		expect(ctx._diagnostics).toEqual([
			{
				startLine: 4,
				startChar: 6,
				endLine: 4,
				endChar: 24,
				severity: 1,
				code: "custom-operation-summary",
				message: "summary required",
				source: "telescope-custom",
			},
		]);
	});

	test("offsetToRange tracks line and column offsets", () => {
		const ctx = buildRuleContext(makeRequest());
		expect(ctx.offsetToRange(0, 7)).toEqual({
			start: { line: 0, character: 0 },
			end: { line: 0, character: 7 },
		});
		expect(ctx.offsetToRange(18, 23)).toEqual({
			start: { line: 1, character: 3 },
			end: { line: 2, character: 1 },
		});
	});
});

describe("runOpenAPIRule", () => {
	test("PathItem visitors can locate and report against the path pointer", () => {
		const req = makeRequest();
		const ctx = buildRuleContext(req);
		ctx._defaultCode = "custom-trailing-slash";

		runOpenAPIRule(
			{
				check: () => ({
					PathItem: (ref) => {
						const range = ctx.locate(ref.uri, ref.pointer);
						expect(range).toEqual({
							start: { line: 2, character: 2 },
							end: { line: 3, character: 7 },
						});
						expect(ref.path).toBe("/users");
						if (range) {
							ctx.report({
								uri: ref.uri,
								range,
								message: "Path '/users' should end with a trailing slash",
								severity: "warning",
							});
						}
					},
				}),
			},
			ctx,
			req.document,
			req.project,
		);

		expect(ctx._diagnostics).toContainEqual({
			startLine: 2,
			startChar: 2,
			endLine: 3,
			endChar: 7,
			severity: 2,
			code: "custom-trailing-slash",
			message: "Path '/users' should end with a trailing slash",
			source: "telescope-custom",
		});
	});

	test("visits representative OpenAPI nodes", () => {
		const req = makeRequest();
		const ctx = buildRuleContext(req);
		const seen = {
			root: 0,
			info: 0,
			tags: [] as string[],
			pathItems: [] as string[],
			operations: [] as string[],
			parameters: [] as string[],
			responses: [] as string[],
			requestBodies: [] as string[],
			schemas: [] as string[],
			components: [] as string[],
			examples: [] as string[],
			headers: [] as string[],
			securitySchemes: [] as string[],
		};

		runOpenAPIRule(
			{
				check: () => ({
					Root: () => {
						seen.root += 1;
					},
					Info: () => {
						seen.info += 1;
					},
					Tag: (ref) => seen.tags.push(ref.pointer),
					PathItem: (ref) => seen.pathItems.push(ref.pointer),
					Operation: (ref) => seen.operations.push(ref.pointer),
					Parameter: (ref) => seen.parameters.push(ref.pointer),
					Response: (ref) => seen.responses.push(ref.pointer),
					RequestBody: (ref) => seen.requestBodies.push(ref.pointer),
					Schema: (ref) => seen.schemas.push(ref.pointer),
					Component: (ref) => seen.components.push(ref.pointer),
					Example: (ref) => seen.examples.push(ref.pointer),
					Header: (ref) => seen.headers.push(ref.pointer),
					SecurityScheme: (ref) => seen.securitySchemes.push(ref.pointer),
				}),
			},
			ctx,
			req.document,
			req.project,
		);

		expect(seen.root).toBe(1);
		expect(seen.info).toBe(1);
		expect(seen.tags).toEqual(["/tags/0"]);
		expect(seen.pathItems).toEqual(["/paths/~1users"]);
		expect(seen.operations).toEqual(["/paths/~1users/get"]);
		expect(seen.parameters).toEqual([
			"/paths/~1users/get/parameters/0",
			"/paths/~1users/parameters/0",
			"/components/parameters/Limit",
		]);
		expect(seen.responses).toEqual([
			"/paths/~1users/get/responses/200",
			"/components/responses/Default",
		]);
		expect(seen.requestBodies).toEqual([
			"/paths/~1users/get/requestBody",
			"/components/requestBodies/CreateUser",
		]);
		expect(seen.schemas).toEqual(["/components/schemas/User"]);
		expect(seen.components).toContain("/components/securitySchemes/Bearer");
		expect(seen.examples).toEqual(["/components/examples/UserExample"]);
		expect(seen.headers).toEqual(["/components/headers/RequestId"]);
		expect(seen.securitySchemes).toEqual([
			"/components/securitySchemes/Bearer",
		]);
	});
});

describe("runGenericRule", () => {
	test("visits the document and records diagnostics", () => {
		const req = makeRequest();
		const ctx = buildGenericContext(req);
		ctx._defaultCode = "custom-yaml-key-order";

		runGenericRule(
			{
				create: () => ({
					Document: (ref) => {
						ctx.report({
							uri: ref.uri,
							range: ctx.offsetToRange(0, 7)!,
							message: "document-level issue",
							severity: "info",
						});
					},
				}),
			},
			ctx,
			req.document,
		);

		expect(ctx._diagnostics).toEqual([
			{
				startLine: 0,
				startChar: 0,
				endLine: 0,
				endChar: 7,
				severity: 3,
				code: "custom-yaml-key-order",
				message: "document-level issue",
				source: "telescope-custom",
			},
		]);
	});
});
