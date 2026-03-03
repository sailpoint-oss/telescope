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

		// Keys that overlap with other patterns (accept any openapi scope)
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

		it("highlights default key with openapi scope", () => {
			const { tokens } = tokenizeLine(grammar, "      default:");
			const token = findToken(tokens, "default");
			expect(token).toBeDefined();
			expect(hasScope(token!, "openapi")).toBe(true);
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

		it("highlights default status code key", () => {
			const { tokens } = tokenizeLine(grammar, "        default:");
			const defaultToken = findToken(tokens, "default");
			expect(defaultToken).toBeDefined();
			if (!defaultToken) return;
			expect(
				hasScope(defaultToken, "constant.numeric.openapi.status-code.yaml"),
			).toBe(true);
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
		const markdownOnlyFields = ["description", "summary"];

		markdownOnlyFields.forEach((key) => {
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

		it("highlights title key as info key", () => {
			const { tokens } = tokenizeLine(grammar, "title: Some inline content");
			const token = findToken(tokens, "title");
			expect(token).toBeDefined();
			if (!token) return;
			expect(
				hasScope(token, "support.type.property-name.openapi.info.yaml"),
			).toBe(true);
		});
	});

	describe("Path Keys", () => {
		it("highlights unquoted path key", () => {
			const { tokens } = tokenizeLine(grammar, "  /users:");
			const token = findToken(tokens, "/users");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "entity.name.tag.openapi.path.yaml"),
			).toBe(true);
		});

		it("highlights path key with path variable", () => {
			const { tokens } = tokenizeLine(grammar, "  /users/{userId}:");
			const token = findToken(tokens, "/users/{userId}");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "entity.name.tag.openapi.path.yaml"),
			).toBe(true);
		});

		it("highlights nested path key", () => {
			const { tokens } = tokenizeLine(grammar, "  /pets/{petId}/toys:");
			const token = findToken(tokens, "/pets/{petId}/toys");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "entity.name.tag.openapi.path.yaml"),
			).toBe(true);
		});

		it("highlights single-quoted path key", () => {
			const { tokens } = tokenizeLine(grammar, "  '/users/{userId}':");
			const token = findToken(tokens, "/users/{userId}");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "entity.name.tag.openapi.path.yaml"),
			).toBe(true);
		});

		it("highlights root path key", () => {
			const { tokens } = tokenizeLine(grammar, "  /:");
			const token = findToken(tokens, "/");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "entity.name.tag.openapi.path.yaml"),
			).toBe(true);
		});
	});

	describe("OperationId Values", () => {
		it("highlights operationId value as function name", () => {
			const { tokens } = tokenizeLine(grammar, "      operationId: listPets");
			const token = findToken(tokens, "listPets");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "entity.name.function.openapi.operation-id.yaml"),
			).toBe(true);
		});

		it("highlights operationId key with value", () => {
			const { tokens } = tokenizeLine(
				grammar,
				"      operationId: getUserById",
			);
			const keyToken = findToken(tokens, "operationId");
			expect(keyToken).toBeDefined();
			expect(
				hasScope(keyToken!, "support.type.property-name.openapi.operation.yaml"),
			).toBe(true);
			const valueToken = findToken(tokens, "getUserById");
			expect(valueToken).toBeDefined();
			expect(
				hasScope(valueToken!, "entity.name.function.openapi.operation-id.yaml"),
			).toBe(true);
		});

		it("highlights operationId key without value", () => {
			const { tokens } = tokenizeLine(grammar, "      operationId:");
			const token = findToken(tokens, "operationId");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "support.type.property-name.openapi.operation.yaml"),
			).toBe(true);
		});
	});

	describe("Format Values", () => {
		const formatValues = [
			"int32",
			"int64",
			"float",
			"double",
			"date",
			"date-time",
			"byte",
			"binary",
			"password",
			"email",
			"uri",
			"uuid",
			"hostname",
			"ipv4",
			"ipv6",
		];

		formatValues.forEach((fmt) => {
			it(`highlights format: ${fmt} value`, () => {
				const { tokens } = tokenizeLine(grammar, `          format: ${fmt}`);
				const token = findToken(tokens, fmt);
				expect(token).toBeDefined();
				expect(
					hasScope(token!, "constant.language.openapi.format.yaml"),
				).toBe(true);
			});
		});

		it("highlights format key when followed by format value", () => {
			const { tokens } = tokenizeLine(grammar, "          format: int32");
			const keyToken = findToken(tokens, "format");
			expect(keyToken).toBeDefined();
			expect(
				hasScope(keyToken!, "support.type.property-name.openapi.schema.yaml"),
			).toBe(true);
		});

		it("allows trailing YAML comment on format values", () => {
			const { tokens } = tokenizeLine(
				grammar,
				"          format: uuid  # unique id",
			);
			const token = findToken(tokens, "uuid");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "constant.language.openapi.format.yaml"),
			).toBe(true);
		});
	});

	describe("Boolean Values", () => {
		const booleanKeys = [
			"required",
			"deprecated",
			"nullable",
			"readOnly",
			"writeOnly",
			"explode",
			"allowReserved",
			"allowEmptyValue",
			"uniqueItems",
		];

		booleanKeys.forEach((key) => {
			it(`highlights ${key}: true as boolean`, () => {
				const { tokens } = tokenizeLine(grammar, `          ${key}: true`);
				const token = findToken(tokens, "true");
				expect(token).toBeDefined();
				expect(
					hasScope(token!, "constant.language.openapi.boolean.yaml"),
				).toBe(true);
			});

			it(`highlights ${key}: false as boolean`, () => {
				const { tokens } = tokenizeLine(grammar, `          ${key}: false`);
				const token = findToken(tokens, "false");
				expect(token).toBeDefined();
				expect(
					hasScope(token!, "constant.language.openapi.boolean.yaml"),
				).toBe(true);
			});
		});

		it("allows trailing comment on boolean values", () => {
			const { tokens } = tokenizeLine(
				grammar,
				"          required: true  # mandatory",
			);
			const token = findToken(tokens, "true");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "constant.language.openapi.boolean.yaml"),
			).toBe(true);
		});
	});

	describe("Security Type Values", () => {
		const securityTypes = ["apiKey", "http", "oauth2", "openIdConnect"];

		securityTypes.forEach((secType) => {
			it(`highlights type: ${secType} as security type`, () => {
				const { tokens } = tokenizeLine(grammar, `      type: ${secType}`);
				const token = findToken(tokens, secType);
				expect(token).toBeDefined();
				expect(
					hasScope(token!, "constant.language.openapi.security-type.yaml"),
				).toBe(true);
			});
		});

		const schemeValues = ["bearer", "basic"];

		schemeValues.forEach((scheme) => {
			it(`highlights scheme: ${scheme} as security scheme`, () => {
				const { tokens } = tokenizeLine(grammar, `      scheme: ${scheme}`);
				const token = findToken(tokens, scheme);
				expect(token).toBeDefined();
				expect(
					hasScope(token!, "constant.language.openapi.security-scheme.yaml"),
				).toBe(true);
			});
		});

		const authFlows = [
			"implicit",
			"password",
			"clientCredentials",
			"authorizationCode",
		];

		authFlows.forEach((flow) => {
			it(`highlights ${flow} auth flow key`, () => {
				const { tokens } = tokenizeLine(grammar, `        ${flow}:`);
				const token = findToken(tokens, flow);
				expect(token).toBeDefined();
				expect(
					hasScope(token!, "constant.language.openapi.auth-flow.yaml"),
				).toBe(true);
			});
		});
	});

	describe("Info Keys", () => {
		const infoKeys = [
			"title",
			"version",
			"termsOfService",
			"contact",
			"license",
			"identifier",
		];

		infoKeys.forEach((key) => {
			it(`highlights ${key} as info key`, () => {
				const { tokens } = tokenizeLine(grammar, `  ${key}:`);
				const token = findToken(tokens, key);
				expect(token).toBeDefined();
				expect(
					hasScope(token!, "support.type.property-name.openapi.info.yaml"),
				).toBe(true);
			});
		});

		it("highlights url as general key", () => {
			const { tokens } = tokenizeLine(grammar, "    url:");
			const token = findToken(tokens, "url");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "support.type.property-name.openapi.general.yaml"),
			).toBe(true);
		});

		it("highlights email as general key", () => {
			const { tokens } = tokenizeLine(grammar, "    email:");
			const token = findToken(tokens, "email");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "support.type.property-name.openapi.general.yaml"),
			).toBe(true);
		});

		it("highlights name with openapi scope", () => {
			const { tokens } = tokenizeLine(grammar, "    name:");
			const token = findToken(tokens, "name");
			expect(token).toBeDefined();
			expect(hasScope(token!, "support.type.property-name.openapi")).toBe(true);
		});
	});

	describe("Type Values with Comments", () => {
		it("highlights type value with trailing comment", () => {
			const { tokens } = tokenizeLine(
				grammar,
				"            type: string  # a comment",
			);
			const token = findToken(tokens, "string");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "constant.language.openapi.type.yaml"),
			).toBe(true);
		});

		it("highlights parameter location with trailing comment", () => {
			const { tokens } = tokenizeLine(
				grammar,
				"          in: query  # search param",
			);
			const token = findToken(tokens, "query");
			expect(token).toBeDefined();
			expect(
				hasScope(token!, "constant.language.openapi.parameter-location.yaml"),
			).toBe(true);
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

			// Check title key (matches info-keys rule)
			assertTokenScope(allTokens[2], "title", "info");

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
