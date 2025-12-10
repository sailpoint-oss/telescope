/**
 * Tests for Ref Enrichment Module
 *
 * Verifies that all enrichment functions correctly add typed accessor
 * methods to refs and that caching works properly.
 */

import { describe, expect, it } from "bun:test";
import {
	enrichCallbackRef,
	enrichComponentRef,
	enrichRootRef,
	enrichExampleRef,
	enrichHeaderRef,
	enrichLinkRef,
	enrichMediaTypeRef,
	enrichOAuthFlowRef,
	enrichOperationRef,
	enrichParameterRef,
	enrichPathItemRef,
	enrichRequestBodyRef,
	enrichResponseRef,
	enrichSchemaRef,
	enrichSecuritySchemeRef,
	enrichTagRef,
} from "./ref-enrichment.js";
import type { OAuthFlowType } from "./types.js";

describe("enrichRootRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichRootRef({
			uri: "file:///test.yaml",
			pointer: "#",
			node: {
				openapi: "3.1.0",
				info: { title: "Test API", version: "1.0.0" },
				servers: [{ url: "https://api.example.com" }],
				paths: { "/users": {} },
				components: { schemas: { User: { type: "object" } } },
				tags: [{ name: "Users", description: "User operations" }],
			},
		});

		expect(ref.openapi()).toBe("3.1.0");
		expect(ref.info()?.title).toBe("Test API");
		expect(ref.servers()).toHaveLength(1);
		expect(ref.hasPaths()).toBe(true);
		expect(ref.hasComponents()).toBe(true);
		expect(ref.tags()).toHaveLength(1);
	});

	it("should handle missing fields gracefully", () => {
		const ref = enrichRootRef({
			uri: "file:///test.yaml",
			pointer: "#",
			node: {},
		});

		expect(ref.openapi()).toBeUndefined();
		expect(ref.info()).toBeUndefined();
		expect(ref.servers()).toEqual([]);
		expect(ref.hasPaths()).toBe(false);
		expect(ref.hasComponents()).toBe(false);
	});
});

describe("enrichPathItemRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichPathItemRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users",
			definitionUri: "file:///test.yaml",
			definitionPointer: "#/paths/~1users",
			node: {
				get: { operationId: "getUsers" },
				post: { operationId: "createUser" },
				summary: "User operations",
				description: "Operations on users",
				parameters: [{ name: "limit", in: "query" }],
			},
			path: () => undefined,
			paths: () => [],
			hasOperation: () => false,
			getOperation: () => undefined,
			operations: () => [],
			summary: () => undefined,
			description: () => undefined,
			parameters: () => [],
			query: () => undefined,
			hasQuery: () => false,
			additionalOperations: () => undefined,
			hasAdditionalOperations: () => false,
		}, ["/users"]);

		expect(ref.path()).toBe("/users");
		expect(ref.paths()).toEqual(["/users"]);
		expect(ref.hasOperation("get")).toBe(true);
		expect(ref.hasOperation("delete")).toBe(false);
		expect(ref.operations()).toHaveLength(2);
		expect(ref.summary()).toBe("User operations");
		expect(ref.description()).toBe("Operations on users");
		expect(ref.parameters()).toHaveLength(1);
	});
});

describe("enrichOperationRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichOperationRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/get",
			definitionUri: "file:///test.yaml",
			definitionPointer: "#/paths/~1users/get",
			method: "get",
			node: {
				summary: "List users",
				description: "Returns all users",
				operationId: "getUsers",
				deprecated: true,
				tags: ["Users", "Admin"],
				parameters: [{ name: "limit", in: "query" }],
				responses: {
					"200": { description: "Success" },
					"404": { description: "Not found" },
				},
				requestBody: { content: {} },
			},
			summary: () => undefined,
			description: () => undefined,
			operationId: () => undefined,
			deprecated: () => false,
			tags: () => [],
			externalDocs: () => undefined,
			eachTag: () => {},
			eachParameter: () => {},
			eachResponse: () => {},
			eachServer: () => {},
			eachSecurityRequirement: () => {},
			eachCallback: () => {},
			responses: () => undefined,
			hasResponses: () => false,
			hasResponse: () => false,
			hasSuccessResponse: () => false,
			hasErrorResponse: () => false,
			requestBody: () => undefined,
			hasRequestBody: () => false,
			parameters: () => [],
			hasParameters: () => false,
		});

		expect(ref.summary()).toBe("List users");
		expect(ref.description()).toBe("Returns all users");
		expect(ref.operationId()).toBe("getUsers");
		expect(ref.deprecated()).toBe(true);
		expect(ref.tags()).toEqual(["Users", "Admin"]);
		expect(ref.hasResponses()).toBe(true);
		expect(ref.hasResponse("200")).toBe(true);
		expect(ref.hasResponse("500")).toBe(false);
		expect(ref.hasSuccessResponse()).toBe(true);
		expect(ref.hasErrorResponse()).toBe(true);
		expect(ref.hasRequestBody()).toBe(true);
		expect(ref.hasParameters()).toBe(true);
	});

	it("should support iteration methods", () => {
		const ref = enrichOperationRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/get",
			definitionUri: "file:///test.yaml",
			definitionPointer: "#/paths/~1users/get",
			method: "get",
			node: {
				tags: ["Users", "Admin"],
				parameters: [
					{ name: "limit", in: "query" },
					{ name: "offset", in: "query" },
				],
				responses: {
					"200": { description: "Success" },
				},
			},
			summary: () => undefined,
			description: () => undefined,
			operationId: () => undefined,
			deprecated: () => false,
			tags: () => [],
			externalDocs: () => undefined,
			eachTag: () => {},
			eachParameter: () => {},
			eachResponse: () => {},
			eachServer: () => {},
			eachSecurityRequirement: () => {},
			eachCallback: () => {},
			responses: () => undefined,
			hasResponses: () => false,
			hasResponse: () => false,
			hasSuccessResponse: () => false,
			hasErrorResponse: () => false,
			requestBody: () => undefined,
			hasRequestBody: () => false,
			parameters: () => [],
			hasParameters: () => false,
		});

		const tags: string[] = [];
		ref.eachTag((tag) => tags.push(tag));
		expect(tags).toEqual(["Users", "Admin"]);

		const params: string[] = [];
		ref.eachParameter((_, paramRef) => params.push(paramRef.getName() ?? ""));
		expect(params).toEqual(["limit", "offset"]);

		const responses: string[] = [];
		ref.eachResponse((code) => responses.push(code));
		expect(responses).toEqual(["200"]);
	});
});

describe("enrichSchemaRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichSchemaRef({
			uri: "file:///test.yaml",
			pointer: "#/components/schemas/User",
			node: {
				type: "object",
				format: "custom",
				description: "A user object",
				title: "User",
				deprecated: true,
				required: ["id", "name"],
				properties: {
					id: { type: "string" },
					name: { type: "string" },
				},
				additionalProperties: false,
			},
			type: () => undefined,
			format: () => undefined,
			description: () => undefined,
			title: () => undefined,
			deprecated: () => false,
			required: () => [],
			enum: () => undefined,
			default: () => undefined,
			example: () => undefined,
			isRef: () => false,
			isComposition: () => false,
			hasType: () => false,
			hasAllOf: () => false,
			hasOneOf: () => false,
			hasAnyOf: () => false,
			isArray: () => false,
			isObject: () => false,
			isString: () => false,
			isNumber: () => false,
			isBoolean: () => false,
			hasExample: () => false,
			hasDefault: () => false,
			items: () => undefined,
			hasItems: () => false,
			properties: () => undefined,
			hasProperties: () => false,
			eachProperty: () => {},
			eachAllOf: () => {},
			eachOneOf: () => {},
			eachAnyOf: () => {},
			eachEnum: () => {},
			eachRequired: () => {},
			eachPatternProperty: () => {},
			nullable: () => undefined,
			typeArray: () => undefined,
			additionalProperties: () => undefined,
			hasAdditionalProperties: () => false,
			patternProperties: () => undefined,
			hasPatternProperties: () => false,
		});

		expect(ref.type()).toBe("object");
		expect(ref.format()).toBe("custom");
		expect(ref.description()).toBe("A user object");
		expect(ref.title()).toBe("User");
		expect(ref.deprecated()).toBe(true);
		expect(ref.required()).toEqual(["id", "name"]);
		expect(ref.isObject()).toBe(true);
		expect(ref.isArray()).toBe(false);
		expect(ref.hasProperties()).toBe(true);
		expect(ref.hasAdditionalProperties()).toBe(true);
		expect(ref.additionalProperties()).toBe(false);
	});

	it("should detect composition schemas", () => {
		const allOfRef = enrichSchemaRef({
			uri: "file:///test.yaml",
			pointer: "#/components/schemas/Extended",
			node: {
				allOf: [{ $ref: "#/components/schemas/Base" }],
			},
			type: () => undefined,
			format: () => undefined,
			description: () => undefined,
			title: () => undefined,
			deprecated: () => false,
			required: () => [],
			enum: () => undefined,
			default: () => undefined,
			example: () => undefined,
			isRef: () => false,
			isComposition: () => false,
			hasType: () => false,
			hasAllOf: () => false,
			hasOneOf: () => false,
			hasAnyOf: () => false,
			isArray: () => false,
			isObject: () => false,
			isString: () => false,
			isNumber: () => false,
			isBoolean: () => false,
			hasExample: () => false,
			hasDefault: () => false,
			items: () => undefined,
			hasItems: () => false,
			properties: () => undefined,
			hasProperties: () => false,
			eachProperty: () => {},
			eachAllOf: () => {},
			eachOneOf: () => {},
			eachAnyOf: () => {},
			eachEnum: () => {},
			eachRequired: () => {},
			eachPatternProperty: () => {},
			nullable: () => undefined,
			typeArray: () => undefined,
			additionalProperties: () => undefined,
			hasAdditionalProperties: () => false,
			patternProperties: () => undefined,
			hasPatternProperties: () => false,
		});

		expect(allOfRef.isComposition()).toBe(true);
		expect(allOfRef.hasAllOf()).toBe(true);
	});

	it("should support property iteration", () => {
		const ref = enrichSchemaRef({
			uri: "file:///test.yaml",
			pointer: "#/components/schemas/User",
			node: {
				type: "object",
				required: ["id"],
				properties: {
					id: { type: "string" },
					name: { type: "string" },
				},
			},
			type: () => undefined,
			format: () => undefined,
			description: () => undefined,
			title: () => undefined,
			deprecated: () => false,
			required: () => [],
			enum: () => undefined,
			default: () => undefined,
			example: () => undefined,
			isRef: () => false,
			isComposition: () => false,
			hasType: () => false,
			hasAllOf: () => false,
			hasOneOf: () => false,
			hasAnyOf: () => false,
			isArray: () => false,
			isObject: () => false,
			isString: () => false,
			isNumber: () => false,
			isBoolean: () => false,
			hasExample: () => false,
			hasDefault: () => false,
			items: () => undefined,
			hasItems: () => false,
			properties: () => undefined,
			hasProperties: () => false,
			eachProperty: () => {},
			eachAllOf: () => {},
			eachOneOf: () => {},
			eachAnyOf: () => {},
			eachEnum: () => {},
			eachRequired: () => {},
			eachPatternProperty: () => {},
			nullable: () => undefined,
			typeArray: () => undefined,
			additionalProperties: () => undefined,
			hasAdditionalProperties: () => false,
			patternProperties: () => undefined,
			hasPatternProperties: () => false,
		});

		const props: Array<{ name: string; required: boolean }> = [];
		ref.eachProperty((name, _, propRef) => {
			props.push({ name, required: propRef.isRequired ?? false });
		});
		expect(props).toEqual([
			{ name: "id", required: true },
			{ name: "name", required: false },
		]);
	});
});

describe("enrichParameterRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichParameterRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/get/parameters/0",
			node: {
				name: "limit",
				in: "query",
				description: "Max results",
				required: true,
				deprecated: false,
				schema: { type: "integer" },
				example: 100,
			},
			name: "limit",
			in: "query",
			getName: () => undefined,
			getIn: () => undefined,
			description: () => undefined,
			required: () => false,
			deprecated: () => false,
			schema: () => undefined,
			example: () => undefined,
			examples: () => undefined,
			hasSchema: () => false,
			schemaType: () => undefined,
			hasExample: () => false,
			isRef: () => false,
			isQuery: () => false,
			isPath: () => false,
			isHeader: () => false,
			isCookie: () => false,
		});

		expect(ref.getName()).toBe("limit");
		expect(ref.getIn()).toBe("query");
		expect(ref.description()).toBe("Max results");
		expect(ref.required()).toBe(true);
		expect(ref.deprecated()).toBe(false);
		expect(ref.isQuery()).toBe(true);
		expect(ref.isPath()).toBe(false);
		expect(ref.hasSchema()).toBe(true);
		expect(ref.schemaType()).toBe("integer");
		expect(ref.hasExample()).toBe(true);
	});
});

describe("enrichResponseRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichResponseRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/get/responses/200",
			node: {
				description: "Success response",
				content: {
					"application/json": { schema: { type: "array" } },
				},
				headers: {
					"X-Rate-Limit": { schema: { type: "integer" } },
				},
				links: {
					GetUserById: { operationId: "getUserById" },
				},
			},
			statusCode: "200",
			description: () => undefined,
			isRef: () => false,
			isSuccess: () => false,
			isError: () => false,
			content: () => undefined,
			headers: () => undefined,
			links: () => undefined,
			hasContent: () => false,
			hasHeaders: () => false,
			hasLinks: () => false,
			eachHeader: () => {},
			eachMediaType: () => {},
			eachLink: () => {},
		});

		expect(ref.description()).toBe("Success response");
		expect(ref.isSuccess()).toBe(true);
		expect(ref.isError()).toBe(false);
		expect(ref.hasContent()).toBe(true);
		expect(ref.hasHeaders()).toBe(true);
		expect(ref.hasLinks()).toBe(true);
	});

	it("should support iteration methods", () => {
		const ref = enrichResponseRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/get/responses/200",
			node: {
				description: "Success",
				content: {
					"application/json": {},
					"application/xml": {},
				},
				headers: {
					"X-Rate-Limit": {},
				},
			},
			statusCode: "200",
			description: () => undefined,
			isRef: () => false,
			isSuccess: () => false,
			isError: () => false,
			content: () => undefined,
			headers: () => undefined,
			links: () => undefined,
			hasContent: () => false,
			hasHeaders: () => false,
			hasLinks: () => false,
			eachHeader: () => {},
			eachMediaType: () => {},
			eachLink: () => {},
		});

		const mediaTypes: string[] = [];
		ref.eachMediaType((type) => mediaTypes.push(type));
		expect(mediaTypes).toEqual(["application/json", "application/xml"]);

		const headers: string[] = [];
		ref.eachHeader((name) => headers.push(name));
		expect(headers).toEqual(["X-Rate-Limit"]);
	});
});

describe("enrichRequestBodyRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichRequestBodyRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/post/requestBody",
			node: {
				description: "User to create",
				required: true,
				content: {
					"application/json": { schema: { type: "object" } },
				},
			},
			description: () => undefined,
			required: () => false,
			content: () => undefined,
			isRef: () => false,
			hasContent: () => false,
			eachMediaType: () => {},
		});

		expect(ref.description()).toBe("User to create");
		expect(ref.required()).toBe(true);
		expect(ref.hasContent()).toBe(true);
	});
});

describe("enrichHeaderRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichHeaderRef({
			uri: "file:///test.yaml",
			pointer: "#/components/headers/X-Rate-Limit",
			node: {
				description: "Rate limit header",
				required: true,
				deprecated: false,
				schema: { type: "integer" },
				example: 100,
			},
			name: "X-Rate-Limit",
			getName: () => undefined,
			description: () => undefined,
			required: () => false,
			deprecated: () => false,
			schema: () => undefined,
			example: () => undefined,
			examples: () => undefined,
			isRef: () => false,
			hasSchema: () => false,
			hasExample: () => false,
			eachExample: () => {},
		});

		expect(ref.getName()).toBe("X-Rate-Limit");
		expect(ref.description()).toBe("Rate limit header");
		expect(ref.required()).toBe(true);
		expect(ref.deprecated()).toBe(false);
		expect(ref.hasSchema()).toBe(true);
		expect(ref.hasExample()).toBe(true);
	});
});

describe("enrichExampleRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichExampleRef({
			uri: "file:///test.yaml",
			pointer: "#/components/examples/UserExample",
			node: {
				summary: "A sample user",
				description: "Example user object",
				value: { id: "1", name: "John" },
			},
			name: "UserExample",
			summary: () => undefined,
			description: () => undefined,
			value: () => undefined,
			externalValue: () => undefined,
			isRef: () => false,
			isExternal: () => false,
		});

		expect(ref.summary()).toBe("A sample user");
		expect(ref.description()).toBe("Example user object");
		expect(ref.value()).toEqual({ id: "1", name: "John" });
		expect(ref.isExternal()).toBe(false);
	});

	it("should detect external examples", () => {
		const ref = enrichExampleRef({
			uri: "file:///test.yaml",
			pointer: "#/components/examples/ExternalExample",
			node: {
				summary: "External example",
				externalValue: "https://example.com/example.json",
			},
			name: "ExternalExample",
			summary: () => undefined,
			description: () => undefined,
			value: () => undefined,
			externalValue: () => undefined,
			isRef: () => false,
			isExternal: () => false,
		});

		expect(ref.isExternal()).toBe(true);
		expect(ref.externalValue()).toBe("https://example.com/example.json");
	});
});

describe("enrichLinkRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichLinkRef({
			uri: "file:///test.yaml",
			pointer: "#/components/links/GetUserById",
			node: {
				operationId: "getUserById",
				parameters: { id: "$response.body#/id" },
				description: "Get user by ID",
			},
			name: "GetUserById",
			operationRef: () => undefined,
			operationId: () => undefined,
			parameters: () => undefined,
			requestBody: () => undefined,
			description: () => undefined,
			server: () => undefined,
			isRef: () => false,
			hasOperationRef: () => false,
			hasOperationId: () => false,
		});

		expect(ref.operationId()).toBe("getUserById");
		expect(ref.hasOperationId()).toBe(true);
		expect(ref.hasOperationRef()).toBe(false);
		expect(ref.parameters()).toEqual({ id: "$response.body#/id" });
		expect(ref.description()).toBe("Get user by ID");
	});
});

describe("enrichCallbackRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichCallbackRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1subscribe/post/callbacks/onEvent",
			node: {
				"{$request.body#/callbackUrl}": {
					post: { operationId: "eventCallback" },
				},
			},
			name: "onEvent",
			isRef: () => false,
			expressions: () => [],
			eachPathItem: () => {},
		});

		expect(ref.expressions()).toEqual(["{$request.body#/callbackUrl}"]);
	});
});

describe("enrichComponentRef", () => {
	it("should enrich with typed accessors", () => {
		const schemaRef = enrichComponentRef({
			uri: "file:///test.yaml",
			pointer: "#/components/schemas/User",
			node: { type: "object" },
			componentType: () => "unknown",
			componentName: () => "",
			isRef: () => false,
			isSchema: () => false,
			isParameter: () => false,
			isResponse: () => false,
			isRequestBody: () => false,
			isHeader: () => false,
			isSecurityScheme: () => false,
			isExample: () => false,
			isLink: () => false,
			isCallback: () => false,
		});

		expect(schemaRef.componentType()).toBe("schemas");
		expect(schemaRef.componentName()).toBe("User");
		expect(schemaRef.isSchema()).toBe(true);
		expect(schemaRef.isParameter()).toBe(false);
	});
});

describe("enrichMediaTypeRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichMediaTypeRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/get/responses/200/content/application~1json",
			node: {
				schema: { type: "array" },
				example: [{ id: "1" }],
				encoding: { field: { contentType: "text/plain" } },
			},
			mediaType: "application/json",
			schema: () => undefined,
			hasSchema: () => false,
			example: () => undefined,
			examples: () => undefined,
			encoding: () => undefined,
			itemSchema: () => undefined,
			hasItemSchema: () => false,
			itemEncoding: () => undefined,
			hasItemEncoding: () => false,
		});

		expect(ref.hasSchema()).toBe(true);
		expect(ref.example()).toEqual([{ id: "1" }]);
		expect(ref.encoding()).toBeDefined();
	});
});

describe("enrichTagRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichTagRef(
			"file:///test.yaml",
			"#/tags/0",
			{
				name: "Users",
				description: "User operations",
				externalDocs: { url: "https://docs.example.com" },
			},
			0,
		);

		expect(ref.name()).toBe("Users");
		expect(ref.description()).toBe("User operations");
		expect(ref.externalDocs()?.url).toBe("https://docs.example.com");
	});

	it("should support OpenAPI 3.2+ fields", () => {
		const ref = enrichTagRef(
			"file:///test.yaml",
			"#/tags/0",
			{
				name: "Admin",
				summary: "Admin operations",
				parent: "Users",
				kind: "nav",
			},
			0,
		);

		expect(ref.summary()).toBe("Admin operations");
		expect(ref.parent()).toBe("Users");
		expect(ref.kind()).toBe("nav");
	});
});

describe("enrichSecuritySchemeRef", () => {
	it("should enrich API key scheme", () => {
		const ref = enrichSecuritySchemeRef(
			"file:///test.yaml",
			"#/components/securitySchemes/apiKey",
			{
				type: "apiKey",
				name: "X-API-Key",
				in: "header",
				description: "API key authentication",
			},
			"apiKey",
		);

		expect(ref.type()).toBe("apiKey");
		expect(ref.apiKeyName()).toBe("X-API-Key");
		expect(ref.apiKeyIn()).toBe("header");
		expect(ref.description()).toBe("API key authentication");
	});

	it("should enrich OAuth2 scheme", () => {
		const ref = enrichSecuritySchemeRef(
			"file:///test.yaml",
			"#/components/securitySchemes/oauth2",
			{
				type: "oauth2",
				flows: {
					authorizationCode: {
						authorizationUrl: "https://auth.example.com/authorize",
						tokenUrl: "https://auth.example.com/token",
						scopes: { read: "Read access" },
					},
				},
			},
			"oauth2",
		);

		expect(ref.type()).toBe("oauth2");
		expect(ref.flows()).toBeDefined();
		expect(ref.authorizationCodeFlow()?.authorizationUrl).toBe(
			"https://auth.example.com/authorize",
		);
	});
});

describe("SchemaRef validation constraints", () => {
	it("should provide string validation accessors", () => {
		const ref = enrichSchemaRef({
			uri: "file:///test.yaml",
			pointer: "#/components/schemas/StringWithConstraints",
			node: {
				type: "string",
				minLength: 1,
				maxLength: 100,
				pattern: "^[a-z]+$",
			},
			type: () => undefined,
			format: () => undefined,
			description: () => undefined,
			title: () => undefined,
			deprecated: () => false,
			required: () => [],
			enum: () => undefined,
			default: () => undefined,
			example: () => undefined,
			isRef: () => false,
			isComposition: () => false,
			hasType: () => false,
			hasAllOf: () => false,
			hasOneOf: () => false,
			hasAnyOf: () => false,
			isArray: () => false,
			isObject: () => false,
			isString: () => false,
			isNumber: () => false,
			isBoolean: () => false,
			hasExample: () => false,
			hasDefault: () => false,
			items: () => undefined,
			hasItems: () => false,
			properties: () => undefined,
			hasProperties: () => false,
			eachProperty: () => {},
			eachAllOf: () => {},
			eachOneOf: () => {},
			eachAnyOf: () => {},
			eachEnum: () => {},
			eachRequired: () => {},
			eachPatternProperty: () => {},
			nullable: () => undefined,
			typeArray: () => undefined,
			additionalProperties: () => undefined,
			hasAdditionalProperties: () => false,
			patternProperties: () => undefined,
			hasPatternProperties: () => false,
			minLength: () => undefined,
			maxLength: () => undefined,
			pattern: () => undefined,
			minimum: () => undefined,
			maximum: () => undefined,
			exclusiveMinimum: () => undefined,
			exclusiveMaximum: () => undefined,
			multipleOf: () => undefined,
			minItems: () => undefined,
			maxItems: () => undefined,
			uniqueItems: () => false,
			minProperties: () => undefined,
			maxProperties: () => undefined,
			readOnly: () => false,
			writeOnly: () => false,
			discriminator: () => undefined,
			hasDiscriminator: () => false,
			constValue: () => undefined,
			hasConst: () => false,
			not: () => undefined,
			hasNot: () => false,
			xml: () => undefined,
			$id: () => undefined,
			externalDocs: () => undefined,
		});

		expect(ref.minLength()).toBe(1);
		expect(ref.maxLength()).toBe(100);
		expect(ref.pattern()).toBe("^[a-z]+$");
	});

	it("should provide numeric validation accessors", () => {
		const ref = enrichSchemaRef({
			uri: "file:///test.yaml",
			pointer: "#/components/schemas/NumberWithConstraints",
			node: {
				type: "number",
				minimum: 0,
				maximum: 100,
				exclusiveMinimum: 0, // OpenAPI 3.1+ uses number
				exclusiveMaximum: 100,
				multipleOf: 0.5,
			},
			type: () => undefined,
			format: () => undefined,
			description: () => undefined,
			title: () => undefined,
			deprecated: () => false,
			required: () => [],
			enum: () => undefined,
			default: () => undefined,
			example: () => undefined,
			isRef: () => false,
			isComposition: () => false,
			hasType: () => false,
			hasAllOf: () => false,
			hasOneOf: () => false,
			hasAnyOf: () => false,
			isArray: () => false,
			isObject: () => false,
			isString: () => false,
			isNumber: () => false,
			isBoolean: () => false,
			hasExample: () => false,
			hasDefault: () => false,
			items: () => undefined,
			hasItems: () => false,
			properties: () => undefined,
			hasProperties: () => false,
			eachProperty: () => {},
			eachAllOf: () => {},
			eachOneOf: () => {},
			eachAnyOf: () => {},
			eachEnum: () => {},
			eachRequired: () => {},
			eachPatternProperty: () => {},
			nullable: () => undefined,
			typeArray: () => undefined,
			additionalProperties: () => undefined,
			hasAdditionalProperties: () => false,
			patternProperties: () => undefined,
			hasPatternProperties: () => false,
			minLength: () => undefined,
			maxLength: () => undefined,
			pattern: () => undefined,
			minimum: () => undefined,
			maximum: () => undefined,
			exclusiveMinimum: () => undefined,
			exclusiveMaximum: () => undefined,
			multipleOf: () => undefined,
			minItems: () => undefined,
			maxItems: () => undefined,
			uniqueItems: () => false,
			minProperties: () => undefined,
			maxProperties: () => undefined,
			readOnly: () => false,
			writeOnly: () => false,
			discriminator: () => undefined,
			hasDiscriminator: () => false,
			constValue: () => undefined,
			hasConst: () => false,
			not: () => undefined,
			hasNot: () => false,
			xml: () => undefined,
			$id: () => undefined,
			externalDocs: () => undefined,
		});

		expect(ref.minimum()).toBe(0);
		expect(ref.maximum()).toBe(100);
		expect(ref.exclusiveMinimum()).toBe(0);
		expect(ref.exclusiveMaximum()).toBe(100);
		expect(ref.multipleOf()).toBe(0.5);
	});

	it("should provide array validation accessors", () => {
		const ref = enrichSchemaRef({
			uri: "file:///test.yaml",
			pointer: "#/components/schemas/ArrayWithConstraints",
			node: {
				type: "array",
				items: { type: "string" },
				minItems: 1,
				maxItems: 10,
				uniqueItems: true,
			},
			type: () => undefined,
			format: () => undefined,
			description: () => undefined,
			title: () => undefined,
			deprecated: () => false,
			required: () => [],
			enum: () => undefined,
			default: () => undefined,
			example: () => undefined,
			isRef: () => false,
			isComposition: () => false,
			hasType: () => false,
			hasAllOf: () => false,
			hasOneOf: () => false,
			hasAnyOf: () => false,
			isArray: () => false,
			isObject: () => false,
			isString: () => false,
			isNumber: () => false,
			isBoolean: () => false,
			hasExample: () => false,
			hasDefault: () => false,
			items: () => undefined,
			hasItems: () => false,
			properties: () => undefined,
			hasProperties: () => false,
			eachProperty: () => {},
			eachAllOf: () => {},
			eachOneOf: () => {},
			eachAnyOf: () => {},
			eachEnum: () => {},
			eachRequired: () => {},
			eachPatternProperty: () => {},
			nullable: () => undefined,
			typeArray: () => undefined,
			additionalProperties: () => undefined,
			hasAdditionalProperties: () => false,
			patternProperties: () => undefined,
			hasPatternProperties: () => false,
			minLength: () => undefined,
			maxLength: () => undefined,
			pattern: () => undefined,
			minimum: () => undefined,
			maximum: () => undefined,
			exclusiveMinimum: () => undefined,
			exclusiveMaximum: () => undefined,
			multipleOf: () => undefined,
			minItems: () => undefined,
			maxItems: () => undefined,
			uniqueItems: () => false,
			minProperties: () => undefined,
			maxProperties: () => undefined,
			readOnly: () => false,
			writeOnly: () => false,
			discriminator: () => undefined,
			hasDiscriminator: () => false,
			constValue: () => undefined,
			hasConst: () => false,
			not: () => undefined,
			hasNot: () => false,
			xml: () => undefined,
			$id: () => undefined,
			externalDocs: () => undefined,
		});

		expect(ref.minItems()).toBe(1);
		expect(ref.maxItems()).toBe(10);
		expect(ref.uniqueItems()).toBe(true);
	});

	it("should provide object validation accessors", () => {
		const ref = enrichSchemaRef({
			uri: "file:///test.yaml",
			pointer: "#/components/schemas/ObjectWithConstraints",
			node: {
				type: "object",
				minProperties: 1,
				maxProperties: 5,
			},
			type: () => undefined,
			format: () => undefined,
			description: () => undefined,
			title: () => undefined,
			deprecated: () => false,
			required: () => [],
			enum: () => undefined,
			default: () => undefined,
			example: () => undefined,
			isRef: () => false,
			isComposition: () => false,
			hasType: () => false,
			hasAllOf: () => false,
			hasOneOf: () => false,
			hasAnyOf: () => false,
			isArray: () => false,
			isObject: () => false,
			isString: () => false,
			isNumber: () => false,
			isBoolean: () => false,
			hasExample: () => false,
			hasDefault: () => false,
			items: () => undefined,
			hasItems: () => false,
			properties: () => undefined,
			hasProperties: () => false,
			eachProperty: () => {},
			eachAllOf: () => {},
			eachOneOf: () => {},
			eachAnyOf: () => {},
			eachEnum: () => {},
			eachRequired: () => {},
			eachPatternProperty: () => {},
			nullable: () => undefined,
			typeArray: () => undefined,
			additionalProperties: () => undefined,
			hasAdditionalProperties: () => false,
			patternProperties: () => undefined,
			hasPatternProperties: () => false,
			minLength: () => undefined,
			maxLength: () => undefined,
			pattern: () => undefined,
			minimum: () => undefined,
			maximum: () => undefined,
			exclusiveMinimum: () => undefined,
			exclusiveMaximum: () => undefined,
			multipleOf: () => undefined,
			minItems: () => undefined,
			maxItems: () => undefined,
			uniqueItems: () => false,
			minProperties: () => undefined,
			maxProperties: () => undefined,
			readOnly: () => false,
			writeOnly: () => false,
			discriminator: () => undefined,
			hasDiscriminator: () => false,
			constValue: () => undefined,
			hasConst: () => false,
			not: () => undefined,
			hasNot: () => false,
			xml: () => undefined,
			$id: () => undefined,
			externalDocs: () => undefined,
		});

		expect(ref.minProperties()).toBe(1);
		expect(ref.maxProperties()).toBe(5);
	});
});

describe("SchemaRef metadata accessors", () => {
	it("should provide readOnly and writeOnly accessors", () => {
		const ref = enrichSchemaRef({
			uri: "file:///test.yaml",
			pointer: "#/components/schemas/ReadOnlyField",
			node: {
				type: "string",
				readOnly: true,
				writeOnly: false,
			},
			type: () => undefined,
			format: () => undefined,
			description: () => undefined,
			title: () => undefined,
			deprecated: () => false,
			required: () => [],
			enum: () => undefined,
			default: () => undefined,
			example: () => undefined,
			isRef: () => false,
			isComposition: () => false,
			hasType: () => false,
			hasAllOf: () => false,
			hasOneOf: () => false,
			hasAnyOf: () => false,
			isArray: () => false,
			isObject: () => false,
			isString: () => false,
			isNumber: () => false,
			isBoolean: () => false,
			hasExample: () => false,
			hasDefault: () => false,
			items: () => undefined,
			hasItems: () => false,
			properties: () => undefined,
			hasProperties: () => false,
			eachProperty: () => {},
			eachAllOf: () => {},
			eachOneOf: () => {},
			eachAnyOf: () => {},
			eachEnum: () => {},
			eachRequired: () => {},
			eachPatternProperty: () => {},
			nullable: () => undefined,
			typeArray: () => undefined,
			additionalProperties: () => undefined,
			hasAdditionalProperties: () => false,
			patternProperties: () => undefined,
			hasPatternProperties: () => false,
			minLength: () => undefined,
			maxLength: () => undefined,
			pattern: () => undefined,
			minimum: () => undefined,
			maximum: () => undefined,
			exclusiveMinimum: () => undefined,
			exclusiveMaximum: () => undefined,
			multipleOf: () => undefined,
			minItems: () => undefined,
			maxItems: () => undefined,
			uniqueItems: () => false,
			minProperties: () => undefined,
			maxProperties: () => undefined,
			readOnly: () => false,
			writeOnly: () => false,
			discriminator: () => undefined,
			hasDiscriminator: () => false,
			constValue: () => undefined,
			hasConst: () => false,
			not: () => undefined,
			hasNot: () => false,
			xml: () => undefined,
			$id: () => undefined,
			externalDocs: () => undefined,
		});

		expect(ref.readOnly()).toBe(true);
		expect(ref.writeOnly()).toBe(false);
	});

	it("should provide discriminator accessor", () => {
		const ref = enrichSchemaRef({
			uri: "file:///test.yaml",
			pointer: "#/components/schemas/Pet",
			node: {
				oneOf: [
					{ $ref: "#/components/schemas/Cat" },
					{ $ref: "#/components/schemas/Dog" },
				],
				discriminator: {
					propertyName: "petType",
					mapping: {
						cat: "#/components/schemas/Cat",
						dog: "#/components/schemas/Dog",
					},
				},
			},
			type: () => undefined,
			format: () => undefined,
			description: () => undefined,
			title: () => undefined,
			deprecated: () => false,
			required: () => [],
			enum: () => undefined,
			default: () => undefined,
			example: () => undefined,
			isRef: () => false,
			isComposition: () => false,
			hasType: () => false,
			hasAllOf: () => false,
			hasOneOf: () => false,
			hasAnyOf: () => false,
			isArray: () => false,
			isObject: () => false,
			isString: () => false,
			isNumber: () => false,
			isBoolean: () => false,
			hasExample: () => false,
			hasDefault: () => false,
			items: () => undefined,
			hasItems: () => false,
			properties: () => undefined,
			hasProperties: () => false,
			eachProperty: () => {},
			eachAllOf: () => {},
			eachOneOf: () => {},
			eachAnyOf: () => {},
			eachEnum: () => {},
			eachRequired: () => {},
			eachPatternProperty: () => {},
			nullable: () => undefined,
			typeArray: () => undefined,
			additionalProperties: () => undefined,
			hasAdditionalProperties: () => false,
			patternProperties: () => undefined,
			hasPatternProperties: () => false,
			minLength: () => undefined,
			maxLength: () => undefined,
			pattern: () => undefined,
			minimum: () => undefined,
			maximum: () => undefined,
			exclusiveMinimum: () => undefined,
			exclusiveMaximum: () => undefined,
			multipleOf: () => undefined,
			minItems: () => undefined,
			maxItems: () => undefined,
			uniqueItems: () => false,
			minProperties: () => undefined,
			maxProperties: () => undefined,
			readOnly: () => false,
			writeOnly: () => false,
			discriminator: () => undefined,
			hasDiscriminator: () => false,
			constValue: () => undefined,
			hasConst: () => false,
			not: () => undefined,
			hasNot: () => false,
			xml: () => undefined,
			$id: () => undefined,
			externalDocs: () => undefined,
		});

		expect(ref.hasDiscriminator()).toBe(true);
		expect(ref.discriminator()?.propertyName).toBe("petType");
	});

	it("should provide const and not accessors", () => {
		const ref = enrichSchemaRef({
			uri: "file:///test.yaml",
			pointer: "#/components/schemas/Constant",
			node: {
				const: "fixed_value",
				not: { type: "null" },
			},
			type: () => undefined,
			format: () => undefined,
			description: () => undefined,
			title: () => undefined,
			deprecated: () => false,
			required: () => [],
			enum: () => undefined,
			default: () => undefined,
			example: () => undefined,
			isRef: () => false,
			isComposition: () => false,
			hasType: () => false,
			hasAllOf: () => false,
			hasOneOf: () => false,
			hasAnyOf: () => false,
			isArray: () => false,
			isObject: () => false,
			isString: () => false,
			isNumber: () => false,
			isBoolean: () => false,
			hasExample: () => false,
			hasDefault: () => false,
			items: () => undefined,
			hasItems: () => false,
			properties: () => undefined,
			hasProperties: () => false,
			eachProperty: () => {},
			eachAllOf: () => {},
			eachOneOf: () => {},
			eachAnyOf: () => {},
			eachEnum: () => {},
			eachRequired: () => {},
			eachPatternProperty: () => {},
			nullable: () => undefined,
			typeArray: () => undefined,
			additionalProperties: () => undefined,
			hasAdditionalProperties: () => false,
			patternProperties: () => undefined,
			hasPatternProperties: () => false,
			minLength: () => undefined,
			maxLength: () => undefined,
			pattern: () => undefined,
			minimum: () => undefined,
			maximum: () => undefined,
			exclusiveMinimum: () => undefined,
			exclusiveMaximum: () => undefined,
			multipleOf: () => undefined,
			minItems: () => undefined,
			maxItems: () => undefined,
			uniqueItems: () => false,
			minProperties: () => undefined,
			maxProperties: () => undefined,
			readOnly: () => false,
			writeOnly: () => false,
			discriminator: () => undefined,
			hasDiscriminator: () => false,
			constValue: () => undefined,
			hasConst: () => false,
			not: () => undefined,
			hasNot: () => false,
			xml: () => undefined,
			$id: () => undefined,
			externalDocs: () => undefined,
		});

		expect(ref.hasConst()).toBe(true);
		expect(ref.constValue()).toBe("fixed_value");
		expect(ref.hasNot()).toBe(true);
		expect((ref.not() as Record<string, unknown>)?.type).toBe("null");
	});

	it("should provide xml and $id accessors", () => {
		const ref = enrichSchemaRef({
			uri: "file:///test.yaml",
			pointer: "#/components/schemas/XmlSchema",
			node: {
				type: "object",
				$id: "https://example.com/schemas/user",
				xml: {
					name: "User",
					namespace: "https://example.com/ns",
				},
			},
			type: () => undefined,
			format: () => undefined,
			description: () => undefined,
			title: () => undefined,
			deprecated: () => false,
			required: () => [],
			enum: () => undefined,
			default: () => undefined,
			example: () => undefined,
			isRef: () => false,
			isComposition: () => false,
			hasType: () => false,
			hasAllOf: () => false,
			hasOneOf: () => false,
			hasAnyOf: () => false,
			isArray: () => false,
			isObject: () => false,
			isString: () => false,
			isNumber: () => false,
			isBoolean: () => false,
			hasExample: () => false,
			hasDefault: () => false,
			items: () => undefined,
			hasItems: () => false,
			properties: () => undefined,
			hasProperties: () => false,
			eachProperty: () => {},
			eachAllOf: () => {},
			eachOneOf: () => {},
			eachAnyOf: () => {},
			eachEnum: () => {},
			eachRequired: () => {},
			eachPatternProperty: () => {},
			nullable: () => undefined,
			typeArray: () => undefined,
			additionalProperties: () => undefined,
			hasAdditionalProperties: () => false,
			patternProperties: () => undefined,
			hasPatternProperties: () => false,
			minLength: () => undefined,
			maxLength: () => undefined,
			pattern: () => undefined,
			minimum: () => undefined,
			maximum: () => undefined,
			exclusiveMinimum: () => undefined,
			exclusiveMaximum: () => undefined,
			multipleOf: () => undefined,
			minItems: () => undefined,
			maxItems: () => undefined,
			uniqueItems: () => false,
			minProperties: () => undefined,
			maxProperties: () => undefined,
			readOnly: () => false,
			writeOnly: () => false,
			discriminator: () => undefined,
			hasDiscriminator: () => false,
			constValue: () => undefined,
			hasConst: () => false,
			not: () => undefined,
			hasNot: () => false,
			xml: () => undefined,
			$id: () => undefined,
			externalDocs: () => undefined,
		});

		expect(ref.$id()).toBe("https://example.com/schemas/user");
		expect(ref.xml()?.name).toBe("User");
	});
});

describe("OperationRef security/server/callback accessors", () => {
	it("should provide security accessors", () => {
		const ref = enrichOperationRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/get",
			definitionUri: "file:///test.yaml",
			definitionPointer: "#/paths/~1users/get",
			method: "get",
			node: {
				security: [
					{ oauth2: ["read:users"] },
					{ apiKey: [] },
				],
			},
			summary: () => undefined,
			description: () => undefined,
			operationId: () => undefined,
			deprecated: () => false,
			tags: () => [],
			externalDocs: () => undefined,
			eachTag: () => {},
			eachParameter: () => {},
			eachResponse: () => {},
			eachServer: () => {},
			eachSecurityRequirement: () => {},
			eachCallback: () => {},
			responses: () => undefined,
			hasResponses: () => false,
			hasResponse: () => false,
			hasSuccessResponse: () => false,
			hasErrorResponse: () => false,
			requestBody: () => undefined,
			hasRequestBody: () => false,
			parameters: () => [],
			hasParameters: () => false,
			security: () => [],
			hasSecurity: () => false,
			servers: () => [],
			hasServers: () => false,
			callbacks: () => undefined,
			hasCallbacks: () => false,
		});

		expect(ref.hasSecurity()).toBe(true);
		expect(ref.security()).toHaveLength(2);
		expect(ref.security()[0]).toEqual({ oauth2: ["read:users"] });
	});

	it("should provide server accessors", () => {
		const ref = enrichOperationRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/get",
			definitionUri: "file:///test.yaml",
			definitionPointer: "#/paths/~1users/get",
			method: "get",
			node: {
				servers: [
					{ url: "https://api.example.com", description: "Production" },
				],
			},
			summary: () => undefined,
			description: () => undefined,
			operationId: () => undefined,
			deprecated: () => false,
			tags: () => [],
			externalDocs: () => undefined,
			eachTag: () => {},
			eachParameter: () => {},
			eachResponse: () => {},
			eachServer: () => {},
			eachSecurityRequirement: () => {},
			eachCallback: () => {},
			responses: () => undefined,
			hasResponses: () => false,
			hasResponse: () => false,
			hasSuccessResponse: () => false,
			hasErrorResponse: () => false,
			requestBody: () => undefined,
			hasRequestBody: () => false,
			parameters: () => [],
			hasParameters: () => false,
			security: () => [],
			hasSecurity: () => false,
			servers: () => [],
			hasServers: () => false,
			callbacks: () => undefined,
			hasCallbacks: () => false,
		});

		expect(ref.hasServers()).toBe(true);
		expect(ref.servers()).toHaveLength(1);
		expect(ref.servers()[0].url).toBe("https://api.example.com");
	});

	it("should provide callback accessors", () => {
		const ref = enrichOperationRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1subscribe/post",
			definitionUri: "file:///test.yaml",
			definitionPointer: "#/paths/~1subscribe/post",
			method: "post",
			node: {
				callbacks: {
					onEvent: {
						"{$request.body#/callbackUrl}": {
							post: {},
						},
					},
				},
			},
			summary: () => undefined,
			description: () => undefined,
			operationId: () => undefined,
			deprecated: () => false,
			tags: () => [],
			externalDocs: () => undefined,
			eachTag: () => {},
			eachParameter: () => {},
			eachResponse: () => {},
			eachServer: () => {},
			eachSecurityRequirement: () => {},
			eachCallback: () => {},
			responses: () => undefined,
			hasResponses: () => false,
			hasResponse: () => false,
			hasSuccessResponse: () => false,
			hasErrorResponse: () => false,
			requestBody: () => undefined,
			hasRequestBody: () => false,
			parameters: () => [],
			hasParameters: () => false,
			security: () => [],
			hasSecurity: () => false,
			servers: () => [],
			hasServers: () => false,
			callbacks: () => undefined,
			hasCallbacks: () => false,
		});

		expect(ref.hasCallbacks()).toBe(true);
		expect(Object.keys(ref.callbacks() ?? {})).toEqual(["onEvent"]);
	});
});

describe("ParameterRef style accessors", () => {
	it("should provide serialization style accessors", () => {
		const ref = enrichParameterRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/get/parameters/0",
			node: {
				name: "ids",
				in: "query",
				style: "form",
				explode: true,
				allowReserved: true,
				allowEmptyValue: true,
				content: { "application/json": { schema: { type: "array" } } },
			},
			name: "ids",
			in: "query",
			getName: () => undefined,
			getIn: () => undefined,
			description: () => undefined,
			required: () => false,
			deprecated: () => false,
			schema: () => undefined,
			example: () => undefined,
			examples: () => undefined,
			hasSchema: () => false,
			schemaType: () => undefined,
			hasExample: () => false,
			isRef: () => false,
			isQuery: () => false,
			isPath: () => false,
			isHeader: () => false,
			isCookie: () => false,
			style: () => undefined,
			explode: () => false,
			allowReserved: () => false,
			allowEmptyValue: () => false,
			content: () => undefined,
		});

		expect(ref.style()).toBe("form");
		expect(ref.explode()).toBe(true);
		expect(ref.allowReserved()).toBe(true);
		expect(ref.allowEmptyValue()).toBe(true);
		expect(ref.content()).toBeDefined();
	});
});

describe("MediaTypeRef example helpers", () => {
	it("should provide example accessors", () => {
		const ref = enrichMediaTypeRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/get/responses/200/content/application~1json",
			node: {
				schema: { type: "array" },
				example: [{ id: "1" }],
				examples: {
					single: { value: { id: "1" } },
					multiple: { value: [{ id: "1" }, { id: "2" }] },
				},
			},
			mediaType: "application/json",
			schema: () => undefined,
			hasSchema: () => false,
			example: () => undefined,
			examples: () => undefined,
			encoding: () => undefined,
			itemSchema: () => undefined,
			hasItemSchema: () => false,
			itemEncoding: () => undefined,
			hasItemEncoding: () => false,
			hasExample: () => false,
			hasExamples: () => false,
			eachExample: () => {},
		});

		expect(ref.hasExample()).toBe(true);
		expect(ref.hasExamples()).toBe(true);

		const exampleNames: string[] = [];
		ref.eachExample((name) => exampleNames.push(name));
		expect(exampleNames).toEqual(["single", "multiple"]);
	});
});

describe("enrichOAuthFlowRef", () => {
	it("should enrich with typed accessors", () => {
		const ref = enrichOAuthFlowRef(
			"file:///test.yaml",
			"#/components/securitySchemes/oauth/flows/authorizationCode",
			{
				authorizationUrl: "https://auth.example.com/authorize",
				tokenUrl: "https://auth.example.com/token",
				refreshUrl: "https://auth.example.com/refresh",
				scopes: { "read:users": "Read user data", "write:users": "Write user data" },
			},
			"authorizationCode",
		);

		expect(ref.authorizationUrl()).toBe("https://auth.example.com/authorize");
		expect(ref.tokenUrl()).toBe("https://auth.example.com/token");
		expect(ref.refreshUrl()).toBe("https://auth.example.com/refresh");
		expect(ref.scopes()).toEqual({ "read:users": "Read user data", "write:users": "Write user data" });
		expect(ref.flowType).toBe("authorizationCode");
	});

	it("should provide requiresAuthorizationUrl helper for implicit flow", () => {
		const ref = enrichOAuthFlowRef(
			"file:///test.yaml",
			"#/components/securitySchemes/oauth/flows/implicit",
			{ authorizationUrl: "https://auth.example.com/authorize", scopes: {} },
			"implicit",
		);

		expect(ref.requiresAuthorizationUrl()).toBe(true);
		expect(ref.requiresTokenUrl()).toBe(false);
	});

	it("should provide requiresAuthorizationUrl helper for authorizationCode flow", () => {
		const ref = enrichOAuthFlowRef(
			"file:///test.yaml",
			"#/components/securitySchemes/oauth/flows/authorizationCode",
			{
				authorizationUrl: "https://auth.example.com/authorize",
				tokenUrl: "https://auth.example.com/token",
				scopes: {},
			},
			"authorizationCode",
		);

		expect(ref.requiresAuthorizationUrl()).toBe(true);
		expect(ref.requiresTokenUrl()).toBe(true);
	});

	it("should provide requiresTokenUrl helper for password flow", () => {
		const ref = enrichOAuthFlowRef(
			"file:///test.yaml",
			"#/components/securitySchemes/oauth/flows/password",
			{ tokenUrl: "https://auth.example.com/token", scopes: {} },
			"password",
		);

		expect(ref.requiresAuthorizationUrl()).toBe(false);
		expect(ref.requiresTokenUrl()).toBe(true);
	});

	it("should provide requiresTokenUrl helper for clientCredentials flow", () => {
		const ref = enrichOAuthFlowRef(
			"file:///test.yaml",
			"#/components/securitySchemes/oauth/flows/clientCredentials",
			{ tokenUrl: "https://auth.example.com/token", scopes: {} },
			"clientCredentials",
		);

		expect(ref.requiresAuthorizationUrl()).toBe(false);
		expect(ref.requiresTokenUrl()).toBe(true);
	});

	it("should provide helpers for device flow (OpenAPI 3.2+)", () => {
		const ref = enrichOAuthFlowRef(
			"file:///test.yaml",
			"#/components/securitySchemes/oauth/flows/device",
			{ tokenUrl: "https://auth.example.com/device", scopes: {} },
			"device",
		);

		expect(ref.flowType).toBe("device");
		// Device flow doesn't require authorizationUrl or tokenUrl by OpenAPI spec rules
		expect(ref.requiresAuthorizationUrl()).toBe(false);
		expect(ref.requiresTokenUrl()).toBe(false);
	});

	it("should handle missing optional URLs", () => {
		const ref = enrichOAuthFlowRef(
			"file:///test.yaml",
			"#/components/securitySchemes/oauth/flows/implicit",
			{ authorizationUrl: "https://auth.example.com/authorize", scopes: {} },
			"implicit",
		);

		expect(ref.tokenUrl()).toBeUndefined();
		expect(ref.refreshUrl()).toBeUndefined();
	});

	it("should return empty object for missing scopes", () => {
		const ref = enrichOAuthFlowRef(
			"file:///test.yaml",
			"#/components/securitySchemes/oauth/flows/implicit",
			{ authorizationUrl: "https://auth.example.com/authorize" },
			"implicit",
		);

		expect(ref.scopes()).toEqual({});
	});
});

describe("SecuritySchemeRef eachFlow iteration", () => {
	it("should iterate over all OAuth2 flows", () => {
		const ref = enrichSecuritySchemeRef(
			"file:///test.yaml",
			"#/components/securitySchemes/oauth",
			{
				type: "oauth2",
				flows: {
					implicit: {
						authorizationUrl: "https://auth.example.com/authorize",
						scopes: { read: "Read access" },
					},
					password: {
						tokenUrl: "https://auth.example.com/token",
						scopes: { write: "Write access" },
					},
					clientCredentials: {
						tokenUrl: "https://auth.example.com/client-token",
						scopes: {},
					},
					authorizationCode: {
						authorizationUrl: "https://auth.example.com/authorize",
						tokenUrl: "https://auth.example.com/token",
						scopes: {},
					},
				},
			},
			"oauth",
		);

		const visitedFlows: OAuthFlowType[] = [];
		ref.eachFlow((flowType, flowNode, flowRef) => {
			visitedFlows.push(flowType);
			expect(flowRef.flowType).toBe(flowType);
			expect(flowRef.uri).toBe("file:///test.yaml");
			expect(flowRef.pointer).toContain("/flows/");
		});

		expect(visitedFlows).toEqual(["implicit", "password", "clientCredentials", "authorizationCode"]);
	});

	it("should not iterate when no flows exist", () => {
		const ref = enrichSecuritySchemeRef(
			"file:///test.yaml",
			"#/components/securitySchemes/apiKey",
			{
				type: "apiKey",
				name: "X-API-Key",
				in: "header",
			},
			"apiKey",
		);

		const visitedFlows: OAuthFlowType[] = [];
		ref.eachFlow((flowType) => visitedFlows.push(flowType));

		expect(visitedFlows).toEqual([]);
	});

	it("should provide typed refs with correct pointers", () => {
		const ref = enrichSecuritySchemeRef(
			"file:///test.yaml",
			"#/components/securitySchemes/oauth",
			{
				type: "oauth2",
				flows: {
					implicit: {
						authorizationUrl: "https://auth.example.com/authorize",
						scopes: {},
					},
				},
			},
			"oauth",
		);

		ref.eachFlow((flowType, flowNode, flowRef) => {
			expect(flowRef.pointer).toBe("#/components/securitySchemes/oauth/flows/implicit");
			expect(flowRef.authorizationUrl()).toBe("https://auth.example.com/authorize");
		});
	});

	it("should iterate over device flow (OpenAPI 3.2+)", () => {
		const ref = enrichSecuritySchemeRef(
			"file:///test.yaml",
			"#/components/securitySchemes/oauth",
			{
				type: "oauth2",
				flows: {
					device: {
						tokenUrl: "https://auth.example.com/device",
						scopes: {},
					},
				},
			},
			"oauth",
		);

		const visitedFlows: OAuthFlowType[] = [];
		ref.eachFlow((flowType, flowNode, flowRef) => {
			visitedFlows.push(flowType);
			expect(flowRef.flowType).toBe("device");
		});

		expect(visitedFlows).toEqual(["device"]);
	});
});

describe("caching behavior", () => {
	it("should cache computed values", () => {
		let computeCount = 0;
		const node = {
			get summary() {
				computeCount++;
				return "Cached summary";
			},
		};

		const ref = enrichOperationRef({
			uri: "file:///test.yaml",
			pointer: "#/paths/~1users/get",
			definitionUri: "file:///test.yaml",
			definitionPointer: "#/paths/~1users/get",
			method: "get",
			node,
			summary: () => undefined,
			description: () => undefined,
			operationId: () => undefined,
			deprecated: () => false,
			tags: () => [],
			externalDocs: () => undefined,
			eachTag: () => {},
			eachParameter: () => {},
			eachResponse: () => {},
			eachServer: () => {},
			eachSecurityRequirement: () => {},
			eachCallback: () => {},
			responses: () => undefined,
			hasResponses: () => false,
			hasResponse: () => false,
			hasSuccessResponse: () => false,
			hasErrorResponse: () => false,
			requestBody: () => undefined,
			hasRequestBody: () => false,
			parameters: () => [],
			hasParameters: () => false,
			security: () => [],
			hasSecurity: () => false,
			servers: () => [],
			hasServers: () => false,
			callbacks: () => undefined,
			hasCallbacks: () => false,
		});

		// Access multiple times
		ref.summary();
		ref.summary();
		ref.summary();

		// Should only compute once due to caching
		expect(computeCount).toBe(1);
	});
});

