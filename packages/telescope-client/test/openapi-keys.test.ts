/**
 * Tests for OpenAPI key highlighting in YAML
 */
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import type { IGrammar } from "vscode-textmate";
import {
	assertTokenScope,
	findToken,
	getOpenAPIGrammar,
	hasScope,
	tokenizeLine,
	tokenizeLines,
} from "./setup";

describe("OpenAPI Key Highlighting", () => {
	let grammar: IGrammar;

	beforeAll(async () => {
		grammar = await getOpenAPIGrammar();
	});

	describe("Version Keys", () => {
		it("highlights openapi key", () => {
			const { tokens } = tokenizeLine(grammar, 'openapi: "3.0.0"');
			const token = findToken(tokens, "openapi");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "support.type.property-name.openapi.version-key.yaml"),
			).toBe(true);
		});

		it("highlights swagger key", () => {
			const { tokens } = tokenizeLine(grammar, 'swagger: "2.0"');
			const token = findToken(tokens, "swagger");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "support.type.property-name.openapi.version-key.yaml"),
			).toBe(true);
		});
	});

	describe("Top-Level Keys", () => {
		const topLevelKeys = [
			"info",
			"paths",
			"components",
			"servers",
			"tags",
			"security",
			"webhooks",
			"externalDocs",
		];

		topLevelKeys.forEach((key) => {
			it(`highlights ${key} key`, () => {
				const { tokens } = tokenizeLine(grammar, `${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				expect(
					hasScope(token!, "support.type.property-name.openapi.top-level.yaml"),
				).toBe(true);
			});
		});
	});

	describe("HTTP Method Keys", () => {
		const httpMethods = [
			"get",
			"put",
			"post",
			"delete",
			"options",
			"head",
			"patch",
			"trace",
		];

		httpMethods.forEach((method) => {
			it(`highlights ${method} method`, () => {
				const { tokens } = tokenizeLine(grammar, `  ${method}:`);
				const token = findToken(tokens, method);
				expect(token).toBeDefined();
				expect(
					hasScope(
						token!,
						"support.type.property-name.openapi.http-method.yaml",
					),
				).toBe(true);
			});
		});
	});

	describe("Operation Keys", () => {
		// Keys that are unique to operations (not shared with other patterns)
		const uniqueOperationKeys = ["operationId", "requestBody"];

		uniqueOperationKeys.forEach((key) => {
			it(`highlights ${key} key as operation`, () => {
				const { tokens } = tokenizeLine(grammar, `    ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				expect(
					hasScope(token!, "support.type.property-name.openapi.operation.yaml"),
				).toBe(true);
			});
		});

		// Keys that may match multiple patterns depending on context
		const sharedOperationKeys = [
			"responses",
			"parameters",
			"callbacks",
			"deprecated",
			"security",
			"servers",
			"tags",
		];

		sharedOperationKeys.forEach((key) => {
			it(`highlights ${key} key with openapi scope`, () => {
				const { tokens } = tokenizeLine(grammar, `    ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				// Accept any openapi-related scope
				expect(hasScope(token!, "support.type.property-name.openapi")).toBe(
					true,
				);
			});
		});
	});

	describe("Component Section Keys", () => {
		// Keys unique to component sections
		const uniqueComponentKeys = [
			"schemas",
			"requestBodies",
			"headers",
			"links",
			"securitySchemes",
			"pathItems",
		];

		uniqueComponentKeys.forEach((key) => {
			it(`highlights ${key} key as component-section`, () => {
				const { tokens } = tokenizeLine(grammar, `  ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				expect(
					hasScope(
						token!,
						"support.type.property-name.openapi.component-section.yaml",
					),
				).toBe(true);
			});
		});

		// Keys shared with other patterns
		const sharedComponentKeys = [
			"parameters",
			"responses",
			"examples",
			"callbacks",
		];

		sharedComponentKeys.forEach((key) => {
			it(`highlights ${key} key with openapi scope`, () => {
				const { tokens } = tokenizeLine(grammar, `  ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				expect(hasScope(token!, "support.type.property-name.openapi")).toBe(
					true,
				);
			});
		});
	});

	describe("Schema Keys", () => {
		// Keys unique to schemas
		const uniqueSchemaKeys = [
			"type",
			"format",
			"items",
			"properties",
			"additionalProperties",
			"enum",
			"default",
			"nullable",
			"readOnly",
			"writeOnly",
			"xml",
		];

		uniqueSchemaKeys.forEach((key) => {
			it(`highlights ${key} key as schema`, () => {
				const { tokens } = tokenizeLine(grammar, `      ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				expect(
					hasScope(token!, "support.type.property-name.openapi.schema.yaml"),
				).toBe(true);
			});
		});

		// Keys that overlap with other patterns
		const sharedSchemaKeys = [
			"required",
			"externalDocs",
			"example",
			"deprecated",
		];

		sharedSchemaKeys.forEach((key) => {
			it(`highlights ${key} key with openapi scope`, () => {
				const { tokens } = tokenizeLine(grammar, `      ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				expect(hasScope(token!, "support.type.property-name.openapi")).toBe(
					true,
				);
			});
		});
	});

	describe("Schema Composition Keys", () => {
		const compositionKeys = ["allOf", "oneOf", "anyOf", "not", "discriminator"];

		compositionKeys.forEach((key) => {
			it(`highlights ${key} key`, () => {
				const { tokens } = tokenizeLine(grammar, `      ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				expect(
					hasScope(
						token!,
						"support.type.property-name.openapi.schema-composition.yaml",
					),
				).toBe(true);
			});
		});
	});

	describe("Schema Validation Keys", () => {
		const validationKeys = [
			"minimum",
			"maximum",
			"exclusiveMinimum",
			"exclusiveMaximum",
			"minLength",
			"maxLength",
			"pattern",
			"minItems",
			"maxItems",
			"uniqueItems",
			"minProperties",
			"maxProperties",
			"multipleOf",
		];

		validationKeys.forEach((key) => {
			it(`highlights ${key} key`, () => {
				const { tokens } = tokenizeLine(grammar, `        ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				expect(
					hasScope(
						token!,
						"support.type.property-name.openapi.schema-validation.yaml",
					),
				).toBe(true);
			});
		});
	});

	describe("Parameter Keys", () => {
		// Keys unique to parameters
		const uniqueParameterKeys = [
			"name",
			"in",
			"style",
			"explode",
			"allowReserved",
			"allowEmptyValue",
		];

		uniqueParameterKeys.forEach((key) => {
			it(`highlights ${key} key as parameter`, () => {
				const { tokens } = tokenizeLine(grammar, `      ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				if (!token) return;
				expect(
					hasScope(token, "support.type.property-name.openapi.parameter.yaml"),
				).toBe(true);
			});
		});

		// Keys that overlap with schema/other patterns
		const sharedParameterKeys = ["required", "schema"];

		sharedParameterKeys.forEach((key) => {
			it(`highlights ${key} key with openapi scope`, () => {
				const { tokens } = tokenizeLine(grammar, `      ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				if (!token) return;
				expect(hasScope(token, "support.type.property-name.openapi")).toBe(
					true,
				);
			});
		});
	});

	describe("Media Type Keys", () => {
		// Keys unique to media type objects
		const uniqueMediaTypeKeys = ["content", "encoding"];

		uniqueMediaTypeKeys.forEach((key) => {
			it(`highlights ${key} key as media-type`, () => {
				const { tokens } = tokenizeLine(grammar, `        ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				if (!token) return;
				expect(
					hasScope(token, "support.type.property-name.openapi.media-type.yaml"),
				).toBe(true);
			});
		});

		// Keys that overlap with other patterns
		const sharedMediaTypeKeys = ["schema", "example", "examples"];

		sharedMediaTypeKeys.forEach((key) => {
			it(`highlights ${key} key with openapi scope`, () => {
				const { tokens } = tokenizeLine(grammar, `        ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				if (!token) return;
				expect(hasScope(token, "support.type.property-name.openapi")).toBe(
					true,
				);
			});
		});
	});

	describe("Content Type Values", () => {
		const contentTypes = [
			"application/json",
			"application/xml",
			"application/x-www-form-urlencoded",
			"multipart/form-data",
			"text/plain",
			"text/html",
		];

		contentTypes.forEach((contentType) => {
			it(`highlights ${contentType} content type`, () => {
				const { tokens } = tokenizeLine(grammar, `          ${contentType}:`);
				const token = findToken(tokens, contentType);
				expect(token).toBeDefined();
				if (!token) return;
				expect(hasScope(token, "string.other.openapi.content-type.yaml")).toBe(
					true,
				);
			});
		});

		it("highlights wildcard content type", () => {
			const { tokens } = tokenizeLine(grammar, "          */*:");
			const token = findToken(tokens, "*/*");
			expect(token).toBeDefined();
			if (!token) return;
			expect(hasScope(token, "string.other.openapi.content-type.yaml")).toBe(
				true,
			);
		});
	});

	describe("Reference Key", () => {
		it("highlights $ref key", () => {
			const { tokens } = tokenizeLine(grammar, "      $ref:");
			const token = findToken(tokens, "$ref");
			expect(token).toBeDefined();
			if (!token) return;
			expect(hasScope(token, "keyword.other.openapi.reference.yaml")).toBe(
				true,
			);
		});

		it("highlights $ref with double-quoted value", () => {
			const { tokens } = tokenizeLine(
				grammar,
				'      $ref: "#/components/schemas/Pet"',
			);
			const token = findToken(tokens, "$ref");
			expect(token).toBeDefined();
			if (!token) return;
			expect(hasScope(token, "keyword.other.openapi.reference.yaml")).toBe(
				true,
			);
		});

		it("highlights $ref value with dedicated scope", () => {
			const { tokens } = tokenizeLine(
				grammar,
				'      $ref: "#/components/schemas/Pet"',
			);
			const valueToken = findToken(tokens, "#/components/schemas/Pet");
			expect(valueToken).toBeDefined();
			if (!valueToken) return;
			expect(
				hasScope(valueToken, "string.other.openapi.reference-value.yaml"),
			).toBe(true);
		});

		it("highlights $ref with single-quoted value", () => {
			const { tokens } = tokenizeLine(
				grammar,
				"      $ref: '#/components/schemas/Pet'",
			);
			const token = findToken(tokens, "$ref");
			expect(token).toBeDefined();
			if (!token) return;
			expect(hasScope(token, "keyword.other.openapi.reference.yaml")).toBe(
				true,
			);
			const valueToken = findToken(tokens, "#/components/schemas/Pet");
			expect(valueToken).toBeDefined();
			if (!valueToken) return;
			expect(
				hasScope(valueToken, "string.other.openapi.reference-value.yaml"),
			).toBe(true);
		});

		it("highlights $ref with unquoted value", () => {
			const { tokens } = tokenizeLine(
				grammar,
				"      $ref: ./common/schemas.yaml#/Pet",
			);
			const token = findToken(tokens, "$ref");
			expect(token).toBeDefined();
			if (!token) return;
			expect(hasScope(token, "keyword.other.openapi.reference.yaml")).toBe(
				true,
			);
			const valueToken = findToken(tokens, "./common/schemas.yaml#/Pet");
			expect(valueToken).toBeDefined();
			if (!valueToken) return;
			expect(
				hasScope(valueToken, "string.other.openapi.reference-value.yaml"),
			).toBe(true);
		});

		it("highlights array-entry $ref with double-quoted value", () => {
			const { tokens } = tokenizeLine(
				grammar,
				'    - $ref: "#/components/parameters/id"',
			);
			const token = findToken(tokens, "$ref");
			expect(token).toBeDefined();
			if (!token) return;
			expect(hasScope(token, "keyword.other.openapi.reference.yaml")).toBe(
				true,
			);
			const valueToken = findToken(tokens, "#/components/parameters/id");
			expect(valueToken).toBeDefined();
			if (!valueToken) return;
			expect(
				hasScope(valueToken, "string.other.openapi.reference-value.yaml"),
			).toBe(true);
		});

		it("highlights array-entry $ref with single-quoted value", () => {
			const { tokens } = tokenizeLine(
				grammar,
				"    - $ref: '#/components/parameters/id'",
			);
			const token = findToken(tokens, "$ref");
			expect(token).toBeDefined();
			if (!token) return;
			expect(hasScope(token, "keyword.other.openapi.reference.yaml")).toBe(
				true,
			);
		});

		it("highlights array-entry $ref with unquoted value", () => {
			const { tokens } = tokenizeLine(grammar, "    - $ref: ./params.yaml#/id");
			const token = findToken(tokens, "$ref");
			expect(token).toBeDefined();
			if (!token) return;
			expect(hasScope(token, "keyword.other.openapi.reference.yaml")).toBe(
				true,
			);
			const valueToken = findToken(tokens, "./params.yaml#/id");
			expect(valueToken).toBeDefined();
			if (!valueToken) return;
			expect(
				hasScope(valueToken, "string.other.openapi.reference-value.yaml"),
			).toBe(true);
		});

		it("highlights dash as sequence item in array-entry $ref", () => {
			const { tokens } = tokenizeLine(
				grammar,
				'    - $ref: "#/components/parameters/id"',
			);
			const dashToken = findToken(tokens, "-");
			expect(dashToken).toBeDefined();
			if (!dashToken) return;
			expect(
				hasScope(dashToken, "punctuation.definition.block.sequence.item.yaml"),
			).toBe(true);
		});
	});

	describe("Schema Type Values", () => {
		const typeValues = [
			"string",
			"integer",
			"number",
			"boolean",
			"array",
			"object",
			"null",
		];

		typeValues.forEach((typeValue) => {
			it(`highlights type: ${typeValue} value`, () => {
				const { tokens } = tokenizeLine(grammar, `      type: ${typeValue}`);
				const valueToken = findToken(tokens, typeValue);
				expect(valueToken).toBeDefined();
				if (!valueToken) return;
				expect(
					hasScope(valueToken, "constant.language.openapi.type.yaml"),
				).toBe(true);
			});
		});

		it("highlights type key when followed by type value", () => {
			const { tokens } = tokenizeLine(grammar, "      type: string");
			const keyToken = findToken(tokens, "type");
			expect(keyToken).toBeDefined();
			if (!keyToken) return;
			expect(
				hasScope(keyToken, "support.type.property-name.openapi.schema.yaml"),
			).toBe(true);
		});
	});

	describe("Parameter Location Values", () => {
		const locationValues = ["query", "header", "path", "cookie"];

		locationValues.forEach((location) => {
			it(`highlights in: ${location} value`, () => {
				const { tokens } = tokenizeLine(grammar, `      in: ${location}`);
				const valueToken = findToken(tokens, location);
				expect(valueToken).toBeDefined();
				if (!valueToken) return;
				expect(
					hasScope(
						valueToken,
						"constant.language.openapi.parameter-location.yaml",
					),
				).toBe(true);
			});
		});

		it("highlights in key when followed by location value", () => {
			const { tokens } = tokenizeLine(grammar, "      in: query");
			const keyToken = findToken(tokens, "in");
			expect(keyToken).toBeDefined();
			if (!keyToken) return;
			expect(
				hasScope(keyToken, "support.type.property-name.openapi.parameter.yaml"),
			).toBe(true);
		});
	});

	describe("HTTP Status Code Keys", () => {
		const statusCodes = ["200", "201", "400", "404", "500"];

		statusCodes.forEach((code) => {
			it(`highlights ${code} status code key (quoted)`, () => {
				const { tokens } = tokenizeLine(grammar, `        "${code}":`);
				const codeToken = findToken(tokens, code);
				expect(codeToken).toBeDefined();
				if (!codeToken) return;
				expect(
					hasScope(codeToken, "constant.numeric.openapi.status-code.yaml"),
				).toBe(true);
			});

			it(`highlights ${code} status code key (unquoted)`, () => {
				const { tokens } = tokenizeLine(grammar, `        ${code}:`);
				const codeToken = findToken(tokens, code);
				expect(codeToken).toBeDefined();
				if (!codeToken) return;
				expect(
					hasScope(codeToken, "constant.numeric.openapi.status-code.yaml"),
				).toBe(true);
			});
		});

		it("highlights default status code key with openapi scope", () => {
			// Note: 'default' appears as both a schema property and a response status code.
			// Without semantic context, the grammar can't distinguish between these uses,
			// so we accept any openapi-related scope.
			const { tokens } = tokenizeLine(grammar, "        default:");
			const defaultToken = findToken(tokens, "default");
			expect(defaultToken).toBeDefined();
			if (!defaultToken) return;
			expect(hasScope(defaultToken, "support.type.property-name.openapi")).toBe(
				true,
			);
		});

		const wildcardCodes = ["1XX", "2XX", "3XX", "4XX", "5XX"];
		wildcardCodes.forEach((code) => {
			it(`highlights ${code} wildcard status code key`, () => {
				const { tokens } = tokenizeLine(grammar, `        ${code}:`);
				const codeToken = findToken(tokens, code);
				expect(codeToken).toBeDefined();
				if (!codeToken) return;
				expect(
					hasScope(codeToken, "constant.numeric.openapi.status-code.yaml"),
				).toBe(true);
			});
		});
	});

	describe("Extension Keys", () => {
		const extensionKeys = [
			"x-custom",
			"x-internal",
			"x-api-key",
			"x-rate-limit",
		];

		extensionKeys.forEach((key) => {
			it(`highlights ${key} extension key`, () => {
				const { tokens } = tokenizeLine(grammar, `  ${key}:`);
				const keyToken = findToken(tokens, key);
				expect(keyToken).toBeDefined();
				if (!keyToken) return;
				expect(
					hasScope(
						keyToken,
						"support.type.property-name.openapi.extension.yaml",
					),
				).toBe(true);
			});
		});

		it("highlights x-openapi-kind extension key", () => {
			const { tokens } = tokenizeLine(grammar, "x-openapi-kind:");
			const keyToken = findToken(tokens, "x-openapi-kind");
			expect(keyToken).toBeDefined();
			if (!keyToken) return;
			expect(
				hasScope(keyToken, "support.type.property-name.openapi.extension.yaml"),
			).toBe(true);
		});
	});

	describe("Markdown Field Keys", () => {
		const markdownFields = ["description", "summary", "title"];

		markdownFields.forEach((key) => {
			it(`highlights ${key} key with block scalar`, () => {
				const lines = [`${key}: |`, "  Some markdown content"];
				const allTokens = tokenizeLines(grammar, lines);
				const token = findToken(allTokens[0], key);
				expect(token).toBeDefined();
				if (!token) return;
				expect(
					hasScope(
						token,
						"support.type.property-name.openapi.markdown-field.yaml",
					),
				).toBe(true);
			});

			it(`highlights ${key} key with inline value`, () => {
				const { tokens } = tokenizeLine(grammar, `${key}: Some inline content`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				if (!token) return;
				expect(
					hasScope(
						token,
						"support.type.property-name.openapi.markdown-field.yaml",
					),
				).toBe(true);
			});
		});
	});

	describe("Full Document Structure", () => {
		it("correctly tokenizes a complete OpenAPI document header", () => {
			const lines = [
				'openapi: "3.0.0"',
				"info:",
				"  title: My API",
				'  version: "1.0.0"',
				"paths:",
				"  /users:",
				"    get:",
				"      summary: Get users",
				"      responses:",
				'        "200":',
				"          description: Success",
			];

			const allTokens = tokenizeLines(grammar, lines);

			// Check openapi key
			assertTokenScope(allTokens[0], "openapi", "version-key");

			// Check info key
			assertTokenScope(allTokens[1], "info", "top-level");

			// Check title key
			assertTokenScope(allTokens[2], "title", "markdown-field");

			// Check paths key
			assertTokenScope(allTokens[4], "paths", "top-level");

			// Check get method
			assertTokenScope(allTokens[6], "get", "http-method");

			// Check summary key
			assertTokenScope(allTokens[7], "summary", "markdown-field");

			// Check responses key - accept any openapi scope
			const responsesToken = findToken(allTokens[8], "responses");
			expect(responsesToken).toBeDefined();
			if (!responsesToken) return;
			expect(
				hasScope(responsesToken, "support.type.property-name.openapi"),
			).toBe(true);
		});
	});
});
