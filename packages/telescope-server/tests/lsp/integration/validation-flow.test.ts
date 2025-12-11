/**
 * Validation Flow Integration Tests
 *
 * End-to-end tests that validate the complete diagnostic flow from
 * OpenAPI document to LSP diagnostics using Zod schemas.
 *
 * @module tests/lsp/integration/validation-flow
 */

import { describe, expect, test } from "bun:test";
import type { IScriptSnapshot } from "typescript";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import { DataVirtualCode } from "../../../src/lsp/languages/virtualCodes/data-virtual-code";
import {
	getCachedSchema,
	getVersionedSchemaKey,
	getZodSchema,
} from "../../../src/lsp/services/shared/schema-cache";
import { zodErrorsToDiagnostics } from "../../../src/lsp/services/shared/zod-to-diag";

/**
 * Create a DataVirtualCode from YAML text
 */
function createYAMLVirtualCode(yaml: string): DataVirtualCode {
	const snapshot: IScriptSnapshot = {
		getText: (start, end) => yaml.slice(start, end),
		getLength: () => yaml.length,
		getChangeRange: () => undefined,
	};
	return new DataVirtualCode(snapshot, "yaml");
}

/**
 * Create a DataVirtualCode from JSON text
 */
function createJSONVirtualCode(json: string): DataVirtualCode {
	const snapshot: IScriptSnapshot = {
		getText: (start, end) => json.slice(start, end),
		getLength: () => json.length,
		getChangeRange: () => undefined,
	};
	return new DataVirtualCode(snapshot, "json");
}

/**
 * Detect OpenAPI version from parsed document
 */
function detectOpenAPIVersion(parsed: unknown): string | null {
	if (typeof parsed !== "object" || parsed === null) return null;
	const doc = parsed as Record<string, unknown>;
	if (typeof doc.openapi === "string") {
		const version = doc.openapi;
		if (version.startsWith("3.0")) return "3.0";
		if (version.startsWith("3.1")) return "3.1";
		if (version.startsWith("3.2")) return "3.2";
	}
	return null;
}

// ============================================================================
// OpenAPI 3.0 Validation Flow Tests
// ============================================================================

describe("OpenAPI 3.0 Validation Flow", () => {
	test("valid document produces no diagnostics", () => {
		const yaml = `openapi: "3.0.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);

		expect(version).toBe("3.0");

		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		expect(schema).toBeDefined();

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		expect(diagnostics.length).toBe(0);
	});

	test("missing required fields produce diagnostics", () => {
		const yaml = `openapi: "3.0.0"
info:
  version: "1.0.0"`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		// Should have errors for missing title and paths
		expect(diagnostics.length).toBeGreaterThanOrEqual(2);

		// All diagnostics should have valid severity
		for (const diag of diagnostics) {
			expect(diag.severity).toBe(DiagnosticSeverity.Error);
		}
	});

	test("invalid types produce diagnostics with correct ranges", () => {
		const yaml = `openapi: "3.0.0"
info:
  title: Test API
  version: 123
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		expect(diagnostics.length).toBeGreaterThanOrEqual(1);

		// Diagnostic should have valid range
		const diag = diagnostics[0]!;
		expect(diag.range.start.line).toBeGreaterThanOrEqual(0);
		expect(diag.range.start.character).toBeGreaterThanOrEqual(0);
	});

	test("complete valid document with operations passes", () => {
		const yaml = `openapi: "3.0.0"
info:
  title: Pet Store API
  version: "1.0.0"
  description: A sample pet store API
servers:
  - url: https://api.example.com
paths:
  /pets:
    get:
      summary: List all pets
      operationId: listPets
      responses:
        "200":
          description: A list of pets
    post:
      summary: Create a pet
      operationId: createPet
      requestBody:
        content:
          application/json:
            schema:
              type: object
      responses:
        "201":
          description: Pet created`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		expect(diagnostics.length).toBe(0);
	});
});

// ============================================================================
// OpenAPI 3.1 Validation Flow Tests
// ============================================================================

describe("OpenAPI 3.1 Validation Flow", () => {
	test("valid document produces no diagnostics", () => {
		const yaml = `openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);

		expect(version).toBe("3.1");

		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		expect(diagnostics.length).toBe(0);
	});

	test("document with webhooks only is valid", () => {
		const yaml = `openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
webhooks:
  newPet:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
      responses:
        "200":
          description: Success`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		expect(diagnostics.length).toBe(0);
	});

	test("document with jsonSchemaDialect is valid", () => {
		const yaml = `openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema"
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		expect(diagnostics.length).toBe(0);
	});

	test("missing info produces diagnostic", () => {
		const yaml = `openapi: "3.1.0"
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		expect(diagnostics.length).toBeGreaterThanOrEqual(1);
	});
});

// ============================================================================
// OpenAPI 3.2 Validation Flow Tests
// ============================================================================

describe("OpenAPI 3.2 Validation Flow", () => {
	test("valid document produces no diagnostics", () => {
		const yaml = `openapi: "3.2.0"
info:
  title: Test API
  version: "1.0.0"
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);

		expect(version).toBe("3.2");

		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		expect(diagnostics.length).toBe(0);
	});

	test("missing required fields produce diagnostics", () => {
		const yaml = `openapi: "3.2.0"
info: {}
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		// Should have errors for missing title and version in info
		expect(diagnostics.length).toBeGreaterThanOrEqual(2);
	});
});

// ============================================================================
// JSON Format Validation Flow Tests
// ============================================================================

describe("JSON Format Validation Flow", () => {
	test("valid JSON OpenAPI document produces no diagnostics", () => {
		const json = `{
  "openapi": "3.1.0",
  "info": {
    "title": "Test API",
    "version": "1.0.0"
  },
  "paths": {}
}`;
		const virtualCode = createJSONVirtualCode(json);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		expect(diagnostics.length).toBe(0);
	});

	test("invalid JSON OpenAPI document produces diagnostics", () => {
		const json = `{
  "openapi": "3.1.0",
  "info": {
    "version": "1.0.0"
  },
  "paths": {}
}`;
		const virtualCode = createJSONVirtualCode(json);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		// Should have error for missing title
		expect(diagnostics.length).toBeGreaterThanOrEqual(1);
	});

	test("JSON diagnostics have valid ranges", () => {
		const json = `{"openapi": "3.1.0", "info": {"version": "1.0.0"}, "paths": {}}`;
		const virtualCode = createJSONVirtualCode(json);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		expect(diagnostics.length).toBeGreaterThanOrEqual(1);

		// All ranges should be valid
		for (const diag of diagnostics) {
			expect(diag.range.start.line).toBeGreaterThanOrEqual(0);
			expect(diag.range.start.character).toBeGreaterThanOrEqual(0);
			expect(diag.range.end.line).toBeGreaterThanOrEqual(diag.range.start.line);
		}
	});
});

// ============================================================================
// Version Detection and Schema Resolution Tests
// ============================================================================

describe("Version Detection and Schema Resolution", () => {
	test("correctly detects OpenAPI 3.0 version", () => {
		const yaml = `openapi: "3.0.3"
info:
  title: Test
  version: "1.0"
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);

		expect(version).toBe("3.0");
	});

	test("correctly detects OpenAPI 3.1 version", () => {
		const yaml = `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);

		expect(version).toBe("3.1");
	});

	test("correctly detects OpenAPI 3.2 version", () => {
		const yaml = `openapi: "3.2.0"
info:
  title: Test
  version: "1.0"
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);

		expect(version).toBe("3.2");
	});

	test("returns null for non-OpenAPI documents", () => {
		const yaml = `name: not-openapi
version: 1.0.0`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);

		expect(version).toBeNull();
	});

	test("schema resolution uses correct version", () => {
		const versions = ["3.0", "3.1", "3.2"];

		for (const version of versions) {
			const schemaKey = getVersionedSchemaKey("root", version);
			const schema = getZodSchema(schemaKey);
			const cachedSchema = getCachedSchema(schemaKey);

			expect(schema).toBeDefined();
			expect(cachedSchema).toBeDefined();
			expect(schemaKey).toBe(`openapi-${version}-root`);
		}
	});
});

// ============================================================================
// Diagnostic Metadata Tests
// ============================================================================

describe("Diagnostic Metadata", () => {
	test("diagnostics include correct source", () => {
		const yaml = `openapi: "3.1.0"
info:
  version: "1.0.0"
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"my-source",
		);

		for (const diag of diagnostics) {
			expect(diag.source).toBe("my-source");
		}
	});

	test("diagnostics include error codes", () => {
		const yaml = `openapi: "3.1.0"
info:
  version: "1.0.0"
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		for (const diag of diagnostics) {
			expect(diag.code).toBeDefined();
		}
	});

	test("diagnostics have error severity", () => {
		const yaml = `openapi: "3.1.0"
info:
  version: "1.0.0"
paths: {}`;
		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		for (const diag of diagnostics) {
			expect(diag.severity).toBe(DiagnosticSeverity.Error);
		}
	});
});

// ============================================================================
// Complex Document Validation Tests
// ============================================================================

describe("Complex Document Validation", () => {
	test("complete API document passes validation", () => {
		const yaml = `openapi: "3.1.0"
info:
  title: Pet Store API
  version: "1.0.0"
  description: A sample API for managing pets
  contact:
    name: API Support
    email: support@example.com
  license:
    name: Apache 2.0
    identifier: Apache-2.0
servers:
  - url: https://api.example.com/v1
    description: Production server
tags:
  - name: pets
    description: Pet operations
paths:
  /pets:
    get:
      tags:
        - pets
      summary: List all pets
      operationId: listPets
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        "200":
          description: A list of pets
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/Pet"
components:
  schemas:
    Pet:
      type: object
      required:
        - name
      properties:
        id:
          type: integer
          format: int64
        name:
          type: string
        tag:
          type: string
  securitySchemes:
    api_key:
      type: apiKey
      name: X-API-Key
      in: header
security:
  - api_key: []`;

		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		expect(diagnostics.length).toBe(0);
	});

	test("document with multiple errors reports all", () => {
		const yaml = `openapi: "3.1.0"
info:
  title: 123
  version: true
paths:
  /users:
    get:
      operationId: 456
      responses: []`;

		const virtualCode = createYAMLVirtualCode(yaml);
		const version = detectOpenAPIVersion(virtualCode.parsedObject);
		const schemaKey = getVersionedSchemaKey("root", version!);
		const schema = getZodSchema(schemaKey);

		const diagnostics = zodErrorsToDiagnostics(
			schema!,
			virtualCode.parsedObject,
			virtualCode,
			"telescope",
		);

		// Should have multiple errors
		expect(diagnostics.length).toBeGreaterThanOrEqual(2);
	});
});

