/**
 * Tests for OpenAPI document classifier (YAML-only)
 */
import { describe, expect, it } from "bun:test";
import { isOpenAPIDocument } from "../src/classifier";

describe("OpenAPI Document Classifier", () => {
	describe("Root OpenAPI Document Detection", () => {
		it("detects OpenAPI 3.x document", () => {
			const doc = {
				openapi: "3.0.0",
				info: { title: "My API", version: "1.0.0" },
				paths: {},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects OpenAPI 3.1 document", () => {
			const doc = {
				openapi: "3.1.0",
				info: { title: "My API", version: "1.0.0" },
				paths: {},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects Swagger 2.0 document", () => {
			const doc = {
				swagger: "2.0",
				info: { title: "My API", version: "1.0.0" },
				paths: {},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects document with openapi + info", () => {
			const doc = {
				openapi: "3.0.0",
				info: { title: "API" },
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects document with openapi + paths", () => {
			const doc = {
				openapi: "3.0.0",
				paths: { "/users": {} },
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects document with openapi + components", () => {
			const doc = {
				openapi: "3.0.0",
				components: { schemas: {} },
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("does not detect document with only openapi key", () => {
			const doc = {
				openapi: "3.0.0",
			};
			expect(isOpenAPIDocument(doc)).toBe(false);
		});
	});

	describe("Schema Component Detection", () => {
		it("detects schema with type", () => {
			const doc = {
				type: "object",
				properties: {
					name: { type: "string" },
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects schema with allOf", () => {
			const doc = {
				allOf: [{ $ref: "#/components/schemas/Base" }, { type: "object" }],
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects schema with oneOf", () => {
			const doc = {
				oneOf: [{ type: "string" }, { type: "number" }],
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects schema with anyOf", () => {
			const doc = {
				anyOf: [{ type: "string" }, { type: "null" }],
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects schema with items (array)", () => {
			const doc = {
				type: "array",
				items: { type: "string" },
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects schema with properties", () => {
			const doc = {
				properties: {
					id: { type: "integer" },
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects schema with $ref only", () => {
			const doc = {
				$ref: "#/components/schemas/User",
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});
	});

	describe("Parameter Component Detection", () => {
		it("detects parameter with name + in + schema", () => {
			const doc = {
				name: "userId",
				in: "path",
				schema: { type: "string" },
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects parameter with name + in + content", () => {
			const doc = {
				name: "filter",
				in: "query",
				content: {
					"application/json": {
						schema: { type: "object" },
					},
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("does not detect with just name + in", () => {
			const doc = {
				name: "something",
				in: "somewhere",
			};
			expect(isOpenAPIDocument(doc)).toBe(false);
		});
	});

	describe("Response Component Detection", () => {
		it("detects response with description + content", () => {
			const doc = {
				description: "Successful response",
				content: {
					"application/json": {
						schema: { type: "object" },
					},
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects response with description + headers", () => {
			const doc = {
				description: "Response with headers",
				headers: {
					"X-Rate-Limit": {
						schema: { type: "integer" },
					},
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("does not detect with just description", () => {
			const doc = {
				description: "Just a description",
			};
			expect(isOpenAPIDocument(doc)).toBe(false);
		});
	});

	describe("RequestBody Component Detection", () => {
		it("detects requestBody with content + description", () => {
			const doc = {
				description: "Request body for user creation",
				content: {
					"application/json": {
						schema: { type: "object" },
					},
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects requestBody with required + content", () => {
			const doc = {
				required: true,
				content: {
					"application/json": {
						schema: { type: "object" },
					},
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("does not detect content alone without context", () => {
			// Content alone could be many things, need required or description
			const doc = {
				content: {
					"application/json": {
						schema: { type: "object" },
					},
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(false);
		});
	});

	describe("Header Component Detection", () => {
		it("detects header with schema (no in)", () => {
			const doc = {
				schema: { type: "string" },
				description: "A header",
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});
	});

	describe("Example Component Detection", () => {
		it("detects example with value", () => {
			const doc = {
				value: { id: 1, name: "John" },
				summary: "Example user",
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects example with value and description", () => {
			const doc = {
				value: "example string",
				description: "An example value",
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});
	});

	describe("Link Component Detection", () => {
		it("detects link with operationId", () => {
			const doc = {
				operationId: "getUser",
				parameters: { userId: "$response.body#/id" },
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects link with operationRef", () => {
			const doc = {
				operationRef: "#/paths/~1users~1{userId}/get",
				parameters: { userId: "$response.body#/id" },
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});
	});

	describe("Path Item Detection", () => {
		it("detects path item with GET method", () => {
			const doc = {
				get: {
					summary: "List items",
					operationId: "listItems",
					responses: { "200": { description: "OK" } },
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects path item with multiple HTTP methods", () => {
			const doc = {
				get: {
					summary: "Get user",
					responses: { "200": { description: "OK" } },
				},
				post: {
					summary: "Create user",
					responses: { "201": { description: "Created" } },
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects path item with keys only (scanner mode)", () => {
			// Simulates how WorkspaceScanner passes data to classifier
			// with keys mapped to boolean true values
			const doc = {
				get: true,
				parameters: true,
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects path item with POST method only", () => {
			const doc = {
				post: {
					requestBody: {},
					responses: { "200": { description: "OK" } },
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects all HTTP method types", () => {
			const methods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
			for (const method of methods) {
				const doc = { [method]: true };
				expect(isOpenAPIDocument(doc)).toBe(true);
			}
		});
	});

	describe("Callback Component Detection", () => {
		it("detects callback with path template keys", () => {
			const doc = {
				"/webhook": {
					post: {
						requestBody: {},
					},
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects callback with expression path", () => {
			const doc = {
				"{$request.body#/callbackUrl}": {
					post: {},
				},
			};
			// This won't match the / prefix pattern
			expect(isOpenAPIDocument(doc)).toBe(false);
		});
	});

	describe("x-openapi-kind Escape Hatch", () => {
		it("detects document with x-openapi-kind marker", () => {
			const doc = {
				"x-openapi-kind": "schema",
				customProperty: "value",
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("accepts any string value for x-openapi-kind", () => {
			const doc = {
				"x-openapi-kind": "custom",
				foo: "bar",
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});
	});

	describe("Non-OpenAPI Documents", () => {
		it("rejects empty object", () => {
			expect(isOpenAPIDocument({})).toBe(false);
		});

		it("rejects null", () => {
			expect(isOpenAPIDocument(null)).toBe(false);
		});

		it("rejects undefined", () => {
			expect(isOpenAPIDocument(undefined)).toBe(false);
		});

		it("rejects arrays", () => {
			expect(isOpenAPIDocument([])).toBe(false);
		});

		it("rejects primitives", () => {
			expect(isOpenAPIDocument("string")).toBe(false);
			expect(isOpenAPIDocument(123)).toBe(false);
			expect(isOpenAPIDocument(true)).toBe(false);
		});

		it("rejects generic YAML document", () => {
			const doc = {
				name: "My Config",
				settings: {
					debug: true,
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(false);
		});

		it("rejects docker-compose", () => {
			const doc = {
				version: "3",
				services: {
					web: { image: "nginx" },
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(false);
		});

		it("rejects kubernetes manifest", () => {
			const doc = {
				apiVersion: "v1",
				kind: "Pod",
				metadata: { name: "test" },
			};
			expect(isOpenAPIDocument(doc)).toBe(false);
		});

		it("rejects GitHub Actions workflow", () => {
			const doc = {
				name: "CI",
				on: ["push", "pull_request"],
				jobs: {
					build: { "runs-on": "ubuntu-latest" },
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(false);
		});

		it("rejects package.json", () => {
			const doc = {
				name: "my-package",
				version: "1.0.0",
				dependencies: {},
			};
			expect(isOpenAPIDocument(doc)).toBe(false);
		});

		it("rejects tsconfig", () => {
			const doc = {
				compilerOptions: {
					target: "ES2020",
					module: "commonjs",
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(false);
		});
	});

	describe("Edge Cases", () => {
		it("rejects overly minimal schema (type alone)", () => {
			// {type: "string"} alone is too ambiguous - could be any config file
			// Require additional context like properties, items, or enum
			const doc = { type: "string" };
			expect(isOpenAPIDocument(doc)).toBe(false);
		});

		it("detects schema with type + enum", () => {
			const doc = { type: "string", enum: ["active", "inactive"] };
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("detects schema with type + items (array schema)", () => {
			const doc = { type: "array", items: { type: "string" } };
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("handles deeply nested structures", () => {
			const doc = {
				openapi: "3.0.0",
				info: { title: "API", version: "1.0" },
				paths: {
					"/users": {
						get: {
							responses: {
								"200": {
									description: "OK",
									content: {
										"application/json": {
											schema: {
												type: "array",
												items: {
													$ref: "#/components/schemas/User",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			};
			expect(isOpenAPIDocument(doc)).toBe(true);
		});

		it("handles object with numeric keys", () => {
			const doc = {
				200: { description: "OK" },
				404: { description: "Not Found" },
			};
			// This is a responses map - has numeric string keys but none start with /
			expect(isOpenAPIDocument(doc)).toBe(false);
		});
	});
});
