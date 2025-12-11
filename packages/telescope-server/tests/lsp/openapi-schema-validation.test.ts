/**
 * OpenAPI Schema Validation Tests
 *
 * Tests actual Zod schema validation for OpenAPI 3.0, 3.1, and 3.2 documents.
 * Verifies that schemas correctly validate documents and produce proper error paths.
 *
 * @module tests/lsp/openapi-schema-validation
 */

import { describe, expect, test } from "bun:test";
import { getZodSchema } from "../../src/lsp/services/shared/schema-cache";

// ============================================================================
// OpenAPI 3.0 Tests
// ============================================================================

describe("OpenAPI 3.0 Schema Validation", () => {
	const getSchema = () => getZodSchema("openapi-3.0-root")!;

	describe("Valid Documents", () => {
		test("minimal valid document passes", () => {
			const doc = {
				openapi: "3.0.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});

		test("document with servers passes", () => {
			const doc = {
				openapi: "3.0.3",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				servers: [{ url: "https://api.example.com" }],
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});

		test("document with paths and operations passes", () => {
			const doc = {
				openapi: "3.0.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {
					"/users": {
						get: {
							responses: {
								"200": {
									description: "Success",
								},
							},
						},
					},
				},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});

		test("document with x-extensions passes", () => {
			const doc = {
				openapi: "3.0.0",
				info: {
					title: "Test API",
					version: "1.0.0",
					"x-custom": "value",
				},
				paths: {},
				"x-extension": true,
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});
	});

	describe("Missing Required Fields", () => {
		test("missing openapi field fails", () => {
			const doc = {
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
			if (!result.success) {
				const error = result.error.issues.find(
					(i) => i.path.includes("openapi") || i.message.includes("openapi"),
				);
				expect(error).toBeDefined();
			}
		});

		test("missing info object fails", () => {
			const doc = {
				openapi: "3.0.0",
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
			if (!result.success) {
				const error = result.error.issues.find(
					(i) => i.path.includes("info") || i.message.includes("info"),
				);
				expect(error).toBeDefined();
			}
		});

		test("missing info.title fails", () => {
			const doc = {
				openapi: "3.0.0",
				info: {
					version: "1.0.0",
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
			if (!result.success) {
				const error = result.error.issues.find((i) => i.path.includes("title"));
				expect(error).toBeDefined();
			}
		});

		test("missing info.version fails", () => {
			const doc = {
				openapi: "3.0.0",
				info: {
					title: "Test API",
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
			if (!result.success) {
				const error = result.error.issues.find((i) =>
					i.path.includes("version"),
				);
				expect(error).toBeDefined();
			}
		});

		test("missing paths fails in 3.0", () => {
			const doc = {
				openapi: "3.0.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
			if (!result.success) {
				const error = result.error.issues.find(
					(i) => i.path.includes("paths") || i.message.includes("paths"),
				);
				expect(error).toBeDefined();
			}
		});
	});

	describe("Invalid Types", () => {
		test("openapi as number fails", () => {
			const doc = {
				openapi: 3.0,
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
		});

		test("info.version as number fails", () => {
			const doc = {
				openapi: "3.0.0",
				info: {
					title: "Test API",
					version: 1,
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
			if (!result.success) {
				const error = result.error.issues.find((i) =>
					i.path.includes("version"),
				);
				expect(error).toBeDefined();
			}
		});

		test("paths as array fails", () => {
			const doc = {
				openapi: "3.0.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: [],
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
		});
	});

	describe("3.0 Specific Features", () => {
		test("nullable property is valid in 3.0", () => {
			const doc = {
				openapi: "3.0.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {},
				components: {
					schemas: {
						User: {
							type: "object",
							properties: {
								name: {
									type: "string",
									nullable: true,
								},
							},
						},
					},
				},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});
	});
});

// ============================================================================
// OpenAPI 3.1 Tests
// ============================================================================

describe("OpenAPI 3.1 Schema Validation", () => {
	const getSchema = () => getZodSchema("openapi-3.1-root")!;

	describe("Valid Documents", () => {
		test("minimal valid document passes", () => {
			const doc = {
				openapi: "3.1.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});

		test("document with webhooks passes", () => {
			const doc = {
				openapi: "3.1.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				webhooks: {
					newUser: {
						post: {
							requestBody: {
								content: {
									"application/json": {
										schema: {
											type: "object",
										},
									},
								},
							},
							responses: {
								"200": {
									description: "Success",
								},
							},
						},
					},
				},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});

		test("document with jsonSchemaDialect passes", () => {
			const doc = {
				openapi: "3.1.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});

		test("document with info.summary passes", () => {
			const doc = {
				openapi: "3.1.0",
				info: {
					title: "Test API",
					version: "1.0.0",
					summary: "A brief summary of the API",
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});

		test("document with license.identifier passes", () => {
			const doc = {
				openapi: "3.1.0",
				info: {
					title: "Test API",
					version: "1.0.0",
					license: {
						name: "Apache 2.0",
						identifier: "Apache-2.0",
					},
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});
	});

	describe("Missing Required Fields", () => {
		test("missing openapi field fails", () => {
			const doc = {
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
		});

		test("missing info object fails", () => {
			const doc = {
				openapi: "3.1.0",
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
		});

		test("missing info.title fails", () => {
			const doc = {
				openapi: "3.1.0",
				info: {
					version: "1.0.0",
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
			if (!result.success) {
				const error = result.error.issues.find((i) => i.path.includes("title"));
				expect(error).toBeDefined();
			}
		});
	});

	describe("3.1 Specific Features", () => {
		test("webhooks field is valid in 3.1", () => {
			const doc = {
				openapi: "3.1.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				webhooks: {
					newPet: {
						post: {
							responses: {
								"200": {
									description: "Success",
								},
							},
						},
					},
				},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});

		test("type array is valid in 3.1 schemas", () => {
			const doc = {
				openapi: "3.1.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {},
				components: {
					schemas: {
						NullableString: {
							type: ["string", "null"],
						},
					},
				},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});

		test("paths is optional in 3.1 when webhooks present", () => {
			const doc = {
				openapi: "3.1.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				webhooks: {
					newPet: {
						post: {
							responses: {
								"200": {
									description: "Success",
								},
							},
						},
					},
				},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});
	});
});

// ============================================================================
// OpenAPI 3.2 Tests
// ============================================================================

describe("OpenAPI 3.2 Schema Validation", () => {
	const getSchema = () => getZodSchema("openapi-3.2-root")!;

	describe("Valid Documents", () => {
		test("minimal valid document passes", () => {
			const doc = {
				openapi: "3.2.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});

		test("document with all 3.1 features passes", () => {
			const doc = {
				openapi: "3.2.0",
				info: {
					title: "Test API",
					version: "1.0.0",
					summary: "API Summary",
				},
				webhooks: {
					newUser: {
						post: {
							responses: {
								"200": {
									description: "Success",
								},
							},
						},
					},
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(true);
		});
	});

	describe("Missing Required Fields", () => {
		test("missing openapi field fails", () => {
			const doc = {
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
		});

		test("missing info object fails", () => {
			const doc = {
				openapi: "3.2.0",
				paths: {},
			};

			const result = getSchema().safeParse(doc);

			expect(result.success).toBe(false);
		});
	});
});

// ============================================================================
// Component Schema Tests (across versions)
// ============================================================================

describe("OpenAPI Component Schema Validation", () => {
	describe("Operation Schema", () => {
		test("operation schema exists and is valid", () => {
			const schema30 = getZodSchema("openapi-3.0-operation");
			const schema31 = getZodSchema("openapi-3.1-operation");
			const schema32 = getZodSchema("openapi-3.2-operation");

			expect(schema30).toBeDefined();
			expect(schema31).toBeDefined();
			expect(schema32).toBeDefined();
		});

		test("valid operation with responses passes", () => {
			const schema = getZodSchema("openapi-3.1-operation")!;
			const op = {
				summary: "Get users",
				operationId: "getUsers",
				responses: {
					"200": {
						description: "Success",
					},
				},
			};

			const result = schema.safeParse(op);

			expect(result.success).toBe(true);
		});

		test("operation with all fields passes", () => {
			const schema = getZodSchema("openapi-3.1-operation")!;
			const op = {
				tags: ["users"],
				summary: "Get users",
				description: "Returns all users",
				operationId: "getUsers",
				parameters: [
					{
						name: "limit",
						in: "query",
						schema: { type: "integer" },
					},
				],
				responses: {
					"200": {
						description: "Success",
					},
				},
			};

			const result = schema.safeParse(op);

			expect(result.success).toBe(true);
		});
	});

	describe("Parameter Schema", () => {
		test("parameter schema exists", () => {
			const schema = getZodSchema("openapi-3.1-parameter");
			expect(schema).toBeDefined();
			expect(typeof schema?.safeParse).toBe("function");
		});

		test("valid query parameter passes", () => {
			const schema = getZodSchema("openapi-3.1-parameter")!;
			const param = {
				name: "limit",
				in: "query",
				schema: {
					type: "integer",
				},
			};

			const result = schema.safeParse(param);

			expect(result.success).toBe(true);
		});

		test("valid path parameter passes", () => {
			const schema = getZodSchema("openapi-3.1-parameter")!;
			const param = {
				name: "userId",
				in: "path",
				required: true,
				schema: {
					type: "string",
				},
			};

			const result = schema.safeParse(param);

			expect(result.success).toBe(true);
		});

		test("valid header parameter passes", () => {
			const schema = getZodSchema("openapi-3.1-parameter")!;
			const param = {
				name: "X-Request-ID",
				in: "header",
				schema: {
					type: "string",
				},
			};

			const result = schema.safeParse(param);

			expect(result.success).toBe(true);
		});

		test("valid cookie parameter passes", () => {
			const schema = getZodSchema("openapi-3.1-parameter")!;
			const param = {
				name: "session_id",
				in: "cookie",
				schema: {
					type: "string",
				},
			};

			const result = schema.safeParse(param);

			expect(result.success).toBe(true);
		});

		test("invalid in value fails", () => {
			const schema = getZodSchema("openapi-3.1-parameter")!;
			const param = {
				name: "userId",
				in: "invalid", // Must be query, header, path, or cookie
			};

			const result = schema.safeParse(param);

			expect(result.success).toBe(false);
		});
	});

	describe("Response Schema", () => {
		test("response schema exists", () => {
			const schema = getZodSchema("openapi-3.1-response");
			expect(schema).toBeDefined();
			expect(typeof schema?.safeParse).toBe("function");
		});

		test("valid response with description passes", () => {
			const schema = getZodSchema("openapi-3.1-response")!;
			const response = {
				description: "Successful response",
			};

			const result = schema.safeParse(response);

			expect(result.success).toBe(true);
		});

		test("valid response with content passes", () => {
			const schema = getZodSchema("openapi-3.1-response")!;
			const response = {
				description: "Successful response",
				content: {
					"application/json": {
						schema: {
							type: "object",
						},
					},
				},
			};

			const result = schema.safeParse(response);

			expect(result.success).toBe(true);
		});

		test("valid response with headers passes", () => {
			const schema = getZodSchema("openapi-3.1-response")!;
			const response = {
				description: "Success",
				headers: {
					"X-Rate-Limit": {
						description: "Rate limit",
						schema: {
							type: "integer",
						},
					},
				},
			};

			const result = schema.safeParse(response);

			expect(result.success).toBe(true);
		});
	});

	describe("RequestBody Schema", () => {
		test("requestBody schema exists", () => {
			const schema = getZodSchema("openapi-3.1-request-body");
			expect(schema).toBeDefined();
			expect(typeof schema?.safeParse).toBe("function");
		});

		test("valid requestBody with content passes", () => {
			const schema = getZodSchema("openapi-3.1-request-body")!;
			const body = {
				content: {
					"application/json": {
						schema: {
							type: "object",
						},
					},
				},
			};

			const result = schema.safeParse(body);

			expect(result.success).toBe(true);
		});

		test("valid requestBody with description passes", () => {
			const schema = getZodSchema("openapi-3.1-request-body")!;
			const body = {
				description: "User data",
				required: true,
				content: {
					"application/json": {
						schema: {
							type: "object",
						},
					},
				},
			};

			const result = schema.safeParse(body);

			expect(result.success).toBe(true);
		});

		test("valid requestBody with multiple media types passes", () => {
			const schema = getZodSchema("openapi-3.1-request-body")!;
			const body = {
				content: {
					"application/json": {
						schema: { type: "object" },
					},
					"application/xml": {
						schema: { type: "object" },
					},
				},
			};

			const result = schema.safeParse(body);

			expect(result.success).toBe(true);
		});
	});

	describe("SecurityScheme Schema", () => {
		test("securityScheme requires type", () => {
			const schema = getZodSchema("openapi-3.1-security-scheme")!;
			const secScheme = {
				// Missing required type
				name: "api_key",
				in: "header",
			};

			const result = schema.safeParse(secScheme);

			expect(result.success).toBe(false);
		});

		test("apiKey security scheme is valid", () => {
			const schema = getZodSchema("openapi-3.1-security-scheme")!;
			const secScheme = {
				type: "apiKey",
				name: "X-API-Key",
				in: "header",
			};

			const result = schema.safeParse(secScheme);

			expect(result.success).toBe(true);
		});

		test("http security scheme is valid", () => {
			const schema = getZodSchema("openapi-3.1-security-scheme")!;
			const secScheme = {
				type: "http",
				scheme: "bearer",
				bearerFormat: "JWT",
			};

			const result = schema.safeParse(secScheme);

			expect(result.success).toBe(true);
		});

		test("oauth2 security scheme is valid", () => {
			const schema = getZodSchema("openapi-3.1-security-scheme")!;
			const secScheme = {
				type: "oauth2",
				flows: {
					authorizationCode: {
						authorizationUrl: "https://example.com/oauth/authorize",
						tokenUrl: "https://example.com/oauth/token",
						scopes: {
							read: "Read access",
							write: "Write access",
						},
					},
				},
			};

			const result = schema.safeParse(secScheme);

			expect(result.success).toBe(true);
		});
	});
});

// ============================================================================
// Error Path Verification
// ============================================================================

describe("Validation Error Paths", () => {
	test("error path points to nested missing field", () => {
		const schema = getZodSchema("openapi-3.1-root")!;
		const doc = {
			openapi: "3.1.0",
			info: {
				// Missing title
				version: "1.0.0",
			},
			paths: {},
		};

		const result = schema.safeParse(doc);

		expect(result.success).toBe(false);
		if (!result.success) {
			const error = result.error.issues.find((i) => i.path.includes("title"));
			expect(error).toBeDefined();
			expect(error?.path).toContain("info");
			expect(error?.path).toContain("title");
		}
	});

	test("error path points to deeply nested field with wrong type", () => {
		const schema = getZodSchema("openapi-3.1-root")!;
		const doc = {
			openapi: "3.1.0",
			info: {
				title: "Test API",
				version: "1.0.0",
			},
			paths: {
				"/users": {
					get: {
						operationId: 123, // Should be string - this will fail
						responses: {
							"200": {
								description: "Success",
							},
						},
					},
				},
			},
		};

		const result = schema.safeParse(doc);

		expect(result.success).toBe(false);
		if (!result.success) {
			// Should have error with path including the deeply nested field
			expect(result.error.issues.length).toBeGreaterThan(0);
			// Verify error is in the paths somewhere
			const hasPathError = result.error.issues.some(
				(i) => i.path.includes("paths") || i.path.includes("operationId"),
			);
			expect(hasPathError).toBe(true);
		}
	});

	test("error includes expected type information", () => {
		const schema = getZodSchema("openapi-3.1-root")!;
		const doc = {
			openapi: "3.1.0",
			info: {
				title: "Test API",
				version: 123, // Should be string
			},
			paths: {},
		};

		const result = schema.safeParse(doc);

		expect(result.success).toBe(false);
		if (!result.success) {
			const error = result.error.issues.find((i) =>
				i.path.includes("version"),
			);
			expect(error).toBeDefined();
			// Check that error code indicates type mismatch
			expect(error?.code).toBe("invalid_type");
		}
	});
});

// ============================================================================
// Complex Document Validation
// ============================================================================

describe("Complex OpenAPI Document Validation", () => {
	test("complete valid 3.1 document passes", () => {
		const schema = getZodSchema("openapi-3.1-root")!;
		const doc = {
			openapi: "3.1.0",
			info: {
				title: "Pet Store API",
				version: "1.0.0",
				description: "A sample Pet Store API",
				contact: {
					name: "API Support",
					email: "support@example.com",
					url: "https://example.com/support",
				},
				license: {
					name: "Apache 2.0",
					identifier: "Apache-2.0",
				},
			},
			servers: [
				{
					url: "https://api.example.com/v1",
					description: "Production server",
				},
			],
			tags: [
				{
					name: "pets",
					description: "Pet operations",
				},
			],
			paths: {
				"/pets": {
					get: {
						tags: ["pets"],
						summary: "List all pets",
						operationId: "listPets",
						parameters: [
							{
								name: "limit",
								in: "query",
								description: "How many items to return",
								schema: {
									type: "integer",
									format: "int32",
								},
							},
						],
						responses: {
							"200": {
								description: "A list of pets",
								content: {
									"application/json": {
										schema: {
											type: "array",
											items: {
												$ref: "#/components/schemas/Pet",
											},
										},
									},
								},
							},
						},
					},
					post: {
						tags: ["pets"],
						summary: "Create a pet",
						operationId: "createPet",
						requestBody: {
							required: true,
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/Pet",
									},
								},
							},
						},
						responses: {
							"201": {
								description: "Pet created",
							},
						},
					},
				},
			},
			components: {
				schemas: {
					Pet: {
						type: "object",
						required: ["name"],
						properties: {
							id: {
								type: "integer",
								format: "int64",
							},
							name: {
								type: "string",
							},
							tag: {
								type: "string",
							},
						},
					},
				},
				securitySchemes: {
					api_key: {
						type: "apiKey",
						name: "X-API-Key",
						in: "header",
					},
				},
			},
			security: [
				{
					api_key: [],
				},
			],
		};

		const result = schema.safeParse(doc);

		expect(result.success).toBe(true);
	});

	test("document with multiple errors reports all", () => {
		const schema = getZodSchema("openapi-3.1-root")!;
		const doc = {
			openapi: "3.1.0",
			info: {
				// Missing title AND version
			},
			paths: {},
		};

		const result = schema.safeParse(doc);

		expect(result.success).toBe(false);
		if (!result.success) {
			// Should have at least 2 errors (title and version)
			expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
		}
	});
});

