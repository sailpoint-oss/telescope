import { describe, expect, it } from "bun:test";
import {
	normalizeBaseUri,
	mightBeOpenAPIDocument,
	isValidOpenApiFile,
} from "./document-utils.js";

describe("document-utils", () => {
	describe("normalizeBaseUri", () => {
		it("should strip fragment from URI", () => {
			expect(normalizeBaseUri("file:///api.yaml#/paths")).toBe("file:///api.yaml");
		});

		it("should strip query string from URI", () => {
			expect(normalizeBaseUri("file:///api.yaml?version=1")).toBe("file:///api.yaml");
		});

		it("should strip both fragment and query", () => {
			expect(normalizeBaseUri("file:///api.yaml#/paths?query=value")).toBe("file:///api.yaml");
		});

		it("should return URI unchanged if no fragment or query", () => {
			expect(normalizeBaseUri("file:///api.yaml")).toBe("file:///api.yaml");
		});

		it("should handle http URIs", () => {
			expect(normalizeBaseUri("https://example.com/api.yaml#/paths")).toBe("https://example.com/api.yaml");
		});
	});

	describe("mightBeOpenAPIDocument", () => {
		it("should return true for YAML files with openapi key", () => {
			const content = `
openapi: 3.1.0
info:
  title: Test
`;
			expect(mightBeOpenAPIDocument("file:///api.yaml", content)).toBe(true);
		});

		it("should return true for JSON files with openapi key", () => {
			const content = `{"openapi": "3.1.0"}`;
			expect(mightBeOpenAPIDocument("file:///api.json", content)).toBe(true);
		});

		it("should return false for known non-OpenAPI files", () => {
			const content = `{"name": "test", "version": "1.0.0"}`;
			expect(mightBeOpenAPIDocument("file:///package.json", content)).toBe(false);
		});

		it("should return false for package.json-like JSON", () => {
			const content = `{"name": "test", "dependencies": {}}`;
			expect(mightBeOpenAPIDocument("file:///manifest.json", content)).toBe(false);
		});

		it("should detect swagger key for OpenAPI 2.0", () => {
			const content = `swagger: "2.0"`;
			expect(mightBeOpenAPIDocument("file:///api.yaml", content)).toBe(true);
		});

		it("should detect $ref for fragment files", () => {
			const content = `$ref: '#/components/schemas/User'`;
			expect(mightBeOpenAPIDocument("file:///ref.yaml", content)).toBe(true);
		});
	});

	describe("isValidOpenApiFile", () => {
		it("should return true for valid OpenAPI 3.1 document", () => {
			const content = `
openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths: {}
`;
			expect(isValidOpenApiFile("file:///api.yaml", content)).toBe(true);
		});

		it("should return true for valid OpenAPI 3.0 document", () => {
			const content = `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths: {}
`;
			expect(isValidOpenApiFile("file:///api.yaml", content)).toBe(true);
		});

		it("should return true for fragment files", () => {
			const content = `
get:
  responses:
    '200':
      description: OK
`;
			expect(isValidOpenApiFile("file:///operation.yaml", content)).toBe(true);
		});

		it("should return false for invalid content", () => {
			expect(isValidOpenApiFile("file:///bad.yaml", "not: valid: yaml: content")).toBe(false);
		});

		it("should return false for non-OpenAPI YAML", () => {
			const content = `
name: package
version: 1.0.0
dependencies:
  express: ^4.18.0
`;
			expect(isValidOpenApiFile("file:///package.yaml", content)).toBe(false);
		});
	});
});

