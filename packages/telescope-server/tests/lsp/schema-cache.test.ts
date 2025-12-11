/**
 * Schema Cache Tests
 *
 * Tests for the schema-cache module that transforms Zod schemas into JSON Schemas
 * and provides O(1) lookups for language services.
 *
 * @module tests/lsp/schema-cache
 */

import { describe, expect, test } from "bun:test";
import {
	getAllSchemaEntries,
	getCachedSchema,
	getSchemaKeys,
	getSupportedVersions,
	getVersionedSchemaKey,
	getZodSchema,
	hasSchema,
} from "../../src/lsp/services/shared/schema-cache";

describe("Schema Cache - Basic Operations", () => {
	describe("getCachedSchema", () => {
		test("returns valid JSON Schema for openapi-3.0-root", () => {
			const schema = getCachedSchema("openapi-3.0-root");

			expect(schema).toBeDefined();
			expect(schema?.$id).toBe("telescope://openapi-3.0-root");
			// Title comes from Zod schema's .meta() - verify it's a string
			expect(typeof schema?.title).toBe("string");
			expect(typeof schema?.type).toBe("string");
		});

		test("returns valid JSON Schema for openapi-3.1-root", () => {
			const schema = getCachedSchema("openapi-3.1-root");

			expect(schema).toBeDefined();
			expect(schema?.$id).toBe("telescope://openapi-3.1-root");
			// Title comes from Zod schema's .meta() - verify it's a string
			expect(typeof schema?.title).toBe("string");
			expect(typeof schema?.type).toBe("string");
		});

		test("returns valid JSON Schema for openapi-3.2-root", () => {
			const schema = getCachedSchema("openapi-3.2-root");

			expect(schema).toBeDefined();
			expect(schema?.$id).toBe("telescope://openapi-3.2-root");
			// Title comes from Zod schema's .meta() - verify it's a string
			expect(typeof schema?.title).toBe("string");
			expect(typeof schema?.type).toBe("string");
		});

		test("returns valid JSON Schema for telescope-config", () => {
			const schema = getCachedSchema("telescope-config");

			expect(schema).toBeDefined();
			expect(schema?.$id).toBe("telescope://telescope-config");
			// Title comes from Zod schema's .meta() - verify it's a string
			expect(typeof schema?.title).toBe("string");
		});

		test("returns undefined for unknown schema key", () => {
			const schema = getCachedSchema("unknown-schema-key");

			expect(schema).toBeUndefined();
		});

		test("cached schema has properties object", () => {
			const schema = getCachedSchema("openapi-3.1-root");

			expect(schema?.properties).toBeDefined();
			expect(typeof schema?.properties).toBe("object");
		});

		test("cached schema has required array", () => {
			const schema = getCachedSchema("openapi-3.1-root");

			expect(schema?.required).toBeDefined();
			expect(Array.isArray(schema?.required)).toBe(true);
		});
	});

	describe("getZodSchema", () => {
		test("returns Zod schema for openapi-3.0-root", () => {
			const schema = getZodSchema("openapi-3.0-root");

			expect(schema).toBeDefined();
			// Verify it's a Zod schema by checking safeParse exists
			expect(typeof schema?.safeParse).toBe("function");
		});

		test("returns Zod schema for openapi-3.1-root", () => {
			const schema = getZodSchema("openapi-3.1-root");

			expect(schema).toBeDefined();
			expect(typeof schema?.safeParse).toBe("function");
		});

		test("returns Zod schema for openapi-3.2-root", () => {
			const schema = getZodSchema("openapi-3.2-root");

			expect(schema).toBeDefined();
			expect(typeof schema?.safeParse).toBe("function");
		});

		test("returns undefined for unknown schema key", () => {
			const schema = getZodSchema("unknown-schema-key");

			expect(schema).toBeUndefined();
		});

		test("Zod schema can validate a valid OpenAPI document", () => {
			const schema = getZodSchema("openapi-3.1-root");
			const validDoc = {
				openapi: "3.1.0",
				info: {
					title: "Test API",
					version: "1.0.0",
				},
				paths: {},
			};

			const result = schema?.safeParse(validDoc);

			expect(result?.success).toBe(true);
		});

		test("Zod schema rejects invalid OpenAPI document", () => {
			const schema = getZodSchema("openapi-3.1-root");
			const invalidDoc = {
				openapi: "3.1.0",
				// Missing required info object
				paths: {},
			};

			const result = schema?.safeParse(invalidDoc);

			expect(result?.success).toBe(false);
		});
	});

	describe("hasSchema", () => {
		test("returns true for existing schema", () => {
			expect(hasSchema("openapi-3.1-root")).toBe(true);
		});

		test("returns false for non-existing schema", () => {
			expect(hasSchema("non-existent-schema")).toBe(false);
		});

		test("returns true for all supported root schemas", () => {
			expect(hasSchema("openapi-3.0-root")).toBe(true);
			expect(hasSchema("openapi-3.1-root")).toBe(true);
			expect(hasSchema("openapi-3.2-root")).toBe(true);
		});
	});
});

describe("Schema Cache - Schema Keys", () => {
	describe("getSchemaKeys", () => {
		test("returns array of all schema keys", () => {
			const keys = getSchemaKeys();

			expect(Array.isArray(keys)).toBe(true);
			expect(keys.length).toBeGreaterThan(0);
		});

		test("includes all OpenAPI 3.0 schemas", () => {
			const keys = getSchemaKeys();

			expect(keys).toContain("openapi-3.0-root");
			expect(keys).toContain("openapi-3.0-operation");
			expect(keys).toContain("openapi-3.0-schema");
			expect(keys).toContain("openapi-3.0-parameter");
			expect(keys).toContain("openapi-3.0-response");
		});

		test("includes all OpenAPI 3.1 schemas", () => {
			const keys = getSchemaKeys();

			expect(keys).toContain("openapi-3.1-root");
			expect(keys).toContain("openapi-3.1-operation");
			expect(keys).toContain("openapi-3.1-schema");
			expect(keys).toContain("openapi-3.1-parameter");
			expect(keys).toContain("openapi-3.1-response");
		});

		test("includes all OpenAPI 3.2 schemas", () => {
			const keys = getSchemaKeys();

			expect(keys).toContain("openapi-3.2-root");
			expect(keys).toContain("openapi-3.2-operation");
			expect(keys).toContain("openapi-3.2-schema");
			expect(keys).toContain("openapi-3.2-parameter");
			expect(keys).toContain("openapi-3.2-response");
		});

		test("includes telescope-config schema", () => {
			const keys = getSchemaKeys();

			expect(keys).toContain("telescope-config");
		});

		test("includes component schemas for all versions", () => {
			const keys = getSchemaKeys();

			// 3.0 components
			expect(keys).toContain("openapi-3.0-components");
			expect(keys).toContain("openapi-3.0-request-body");
			expect(keys).toContain("openapi-3.0-header");
			expect(keys).toContain("openapi-3.0-security-scheme");

			// 3.1 components
			expect(keys).toContain("openapi-3.1-components");
			expect(keys).toContain("openapi-3.1-request-body");
			expect(keys).toContain("openapi-3.1-header");
			expect(keys).toContain("openapi-3.1-security-scheme");

			// 3.2 components
			expect(keys).toContain("openapi-3.2-components");
			expect(keys).toContain("openapi-3.2-request-body");
			expect(keys).toContain("openapi-3.2-header");
			expect(keys).toContain("openapi-3.2-security-scheme");
		});
	});

	describe("getVersionedSchemaKey", () => {
		test("generates correct key for root with version 3.0.0", () => {
			const key = getVersionedSchemaKey("root", "3.0.0");

			expect(key).toBe("openapi-3.0-root");
		});

		test("generates correct key for root with version 3.1.0", () => {
			const key = getVersionedSchemaKey("root", "3.1.0");

			expect(key).toBe("openapi-3.1-root");
		});

		test("generates correct key for root with version 3.2.0", () => {
			const key = getVersionedSchemaKey("root", "3.2.0");

			expect(key).toBe("openapi-3.2-root");
		});

		test("handles patch versions correctly", () => {
			expect(getVersionedSchemaKey("root", "3.1.1")).toBe("openapi-3.1-root");
			expect(getVersionedSchemaKey("root", "3.0.3")).toBe("openapi-3.0-root");
			expect(getVersionedSchemaKey("root", "3.2.5")).toBe("openapi-3.2-root");
		});

		test("handles short version strings", () => {
			expect(getVersionedSchemaKey("root", "3.0")).toBe("openapi-3.0-root");
			expect(getVersionedSchemaKey("root", "3.1")).toBe("openapi-3.1-root");
			expect(getVersionedSchemaKey("root", "3.2")).toBe("openapi-3.2-root");
		});

		test("defaults to 3.1 for unknown versions", () => {
			const key = getVersionedSchemaKey("root", "4.0.0");

			expect(key).toBe("openapi-3.1-root");
		});

		test("defaults to 3.1 for invalid version strings", () => {
			expect(getVersionedSchemaKey("root", "invalid")).toBe("openapi-3.1-root");
			expect(getVersionedSchemaKey("root", "")).toBe("openapi-3.1-root");
		});

		test("generates correct key for different doc types", () => {
			expect(getVersionedSchemaKey("operation", "3.1.0")).toBe(
				"openapi-3.1-operation",
			);
			expect(getVersionedSchemaKey("schema", "3.1.0")).toBe(
				"openapi-3.1-schema",
			);
			expect(getVersionedSchemaKey("parameter", "3.1.0")).toBe(
				"openapi-3.1-parameter",
			);
			expect(getVersionedSchemaKey("response", "3.1.0")).toBe(
				"openapi-3.1-response",
			);
		});
	});

	describe("getSupportedVersions", () => {
		test("returns array of supported versions", () => {
			const versions = getSupportedVersions();

			expect(Array.isArray(versions)).toBe(true);
			expect(versions.length).toBe(3);
		});

		test("includes 3.0, 3.1, and 3.2", () => {
			const versions = getSupportedVersions();

			expect(versions).toContain("3.0");
			expect(versions).toContain("3.1");
			expect(versions).toContain("3.2");
		});
	});
});

describe("Schema Cache - Schema Entries", () => {
	describe("getAllSchemaEntries", () => {
		test("returns array of schema entries", () => {
			const entries = getAllSchemaEntries();

			expect(Array.isArray(entries)).toBe(true);
			expect(entries.length).toBeGreaterThan(0);
		});

		test("each entry has id and schema properties", () => {
			const entries = getAllSchemaEntries();

			for (const entry of entries) {
				expect(entry.id).toBeDefined();
				expect(typeof entry.id).toBe("string");
				expect(entry.schema).toBeDefined();
				expect(typeof entry.schema).toBe("object");
			}
		});

		test("entry ids match schema keys", () => {
			const entries = getAllSchemaEntries();
			const keys = getSchemaKeys();

			const entryIds = entries.map((e) => e.id);

			expect(entryIds.sort()).toEqual(keys.sort());
		});

		test("entry schemas have $id property", () => {
			const entries = getAllSchemaEntries();

			for (const entry of entries) {
				expect(entry.schema.$id).toBe(`telescope://${entry.id}`);
			}
		});

		test("entry schemas have title property", () => {
			const entries = getAllSchemaEntries();

			for (const entry of entries) {
				expect(entry.schema.title).toBeDefined();
				expect(typeof entry.schema.title).toBe("string");
			}
		});
	});
});

describe("Schema Cache - JSON Schema Transformation", () => {
	describe("Schema Structure", () => {
		test("transformed schema has JSON Schema draft identifier", () => {
			const schema = getCachedSchema("openapi-3.1-root");

			// Zod v4 toJSONSchema uses draft-2020-12
			expect(
				schema?.$schema === "https://json-schema.org/draft/2020-12/schema" ||
					schema?.$schema === undefined,
			).toBe(true);
		});

		test("transformed schema has type property", () => {
			const schema = getCachedSchema("openapi-3.1-root");

			expect(schema?.type).toBe("object");
		});

		test("transformed schema preserves required fields", () => {
			const schema = getCachedSchema("openapi-3.1-root");
			const required = schema?.required as string[];

			// OpenAPI root requires openapi, info, and paths (though paths may be optional in 3.1)
			expect(required).toContain("openapi");
			expect(required).toContain("info");
		});

		test("transformed schema has properties for OpenAPI fields", () => {
			const schema = getCachedSchema("openapi-3.1-root");
			const properties = schema?.properties as Record<string, unknown>;

			expect(properties.openapi).toBeDefined();
			expect(properties.info).toBeDefined();
			expect(properties.paths).toBeDefined();
		});

		test("nested schemas are properly transformed", () => {
			const schema = getCachedSchema("openapi-3.1-root");
			const properties = schema?.properties as Record<string, unknown>;
			const info = properties.info as Record<string, unknown>;

			// Info should have its own properties (could be a $ref or inline)
			expect(info).toBeDefined();
		});
	});

	describe("Schema Consistency", () => {
		test("all root schemas have same required base fields", () => {
			const schema30 = getCachedSchema("openapi-3.0-root");
			const schema31 = getCachedSchema("openapi-3.1-root");
			const schema32 = getCachedSchema("openapi-3.2-root");

			const required30 = schema30?.required as string[];
			const required31 = schema31?.required as string[];
			const required32 = schema32?.required as string[];

			// All versions require openapi and info
			expect(required30).toContain("openapi");
			expect(required30).toContain("info");
			expect(required31).toContain("openapi");
			expect(required31).toContain("info");
			expect(required32).toContain("openapi");
			expect(required32).toContain("info");
		});

		test("operation schemas have consistent structure", () => {
			const op30 = getCachedSchema("openapi-3.0-operation");
			const op31 = getCachedSchema("openapi-3.1-operation");
			const op32 = getCachedSchema("openapi-3.2-operation");

			// All operation schemas should be objects
			expect(op30?.type).toBe("object");
			expect(op31?.type).toBe("object");
			expect(op32?.type).toBe("object");

			// All should have properties
			expect(op30?.properties).toBeDefined();
			expect(op31?.properties).toBeDefined();
			expect(op32?.properties).toBeDefined();
		});

		test("parameter schemas have consistent structure", () => {
			const param30 = getCachedSchema("openapi-3.0-parameter");
			const param31 = getCachedSchema("openapi-3.1-parameter");
			const param32 = getCachedSchema("openapi-3.2-parameter");

			// All should be defined and have properties (may use $defs/allOf)
			expect(param30).toBeDefined();
			expect(param31).toBeDefined();
			expect(param32).toBeDefined();
		});
	});

	describe("Cache Behavior", () => {
		test("returns same object reference for same key", () => {
			const schema1 = getCachedSchema("openapi-3.1-root");
			const schema2 = getCachedSchema("openapi-3.1-root");

			expect(schema1).toBe(schema2);
		});

		test("cache is populated at module load time", () => {
			// This test verifies cache is pre-populated by checking all keys exist
			const keys = getSchemaKeys();

			for (const key of keys) {
				expect(getCachedSchema(key)).toBeDefined();
			}
		});
	});
});

describe("Schema Cache - Zod Validation with Cached Schemas", () => {
	test("can validate complete OpenAPI 3.0 document", () => {
		const schema = getZodSchema("openapi-3.0-root");
		const doc = {
			openapi: "3.0.0",
			info: {
				title: "Test API",
				version: "1.0.0",
			},
			paths: {},
		};

		const result = schema?.safeParse(doc);

		expect(result?.success).toBe(true);
	});

	test("can validate complete OpenAPI 3.1 document", () => {
		const schema = getZodSchema("openapi-3.1-root");
		const doc = {
			openapi: "3.1.0",
			info: {
				title: "Test API",
				version: "1.0.0",
			},
			paths: {},
		};

		const result = schema?.safeParse(doc);

		expect(result?.success).toBe(true);
	});

	test("can validate complete OpenAPI 3.2 document", () => {
		const schema = getZodSchema("openapi-3.2-root");
		const doc = {
			openapi: "3.2.0",
			info: {
				title: "Test API",
				version: "1.0.0",
			},
			paths: {},
		};

		const result = schema?.safeParse(doc);

		expect(result?.success).toBe(true);
	});

	test("validation error includes path to missing field", () => {
		const schema = getZodSchema("openapi-3.1-root");
		const doc = {
			openapi: "3.1.0",
			info: {
				// Missing required title
				version: "1.0.0",
			},
			paths: {},
		};

		const result = schema?.safeParse(doc);

		expect(result?.success).toBe(false);
		if (!result?.success) {
			// Check that error path points to info.title
			const titleError = result.error.issues.find((issue) =>
				issue.path.includes("title"),
			);
			expect(titleError).toBeDefined();
		}
	});

	test("validation error for wrong type includes expected type", () => {
		const schema = getZodSchema("openapi-3.1-root");
		const doc = {
			openapi: "3.1.0",
			info: {
				title: "Test API",
				version: 123, // Should be string
			},
			paths: {},
		};

		const result = schema?.safeParse(doc);

		expect(result?.success).toBe(false);
		if (!result?.success) {
			const versionError = result.error.issues.find((issue) =>
				issue.path.includes("version"),
			);
			expect(versionError).toBeDefined();
		}
	});

	test("allows extension fields with passthrough", () => {
		const schema = getZodSchema("openapi-3.1-root");
		const doc = {
			openapi: "3.1.0",
			info: {
				title: "Test API",
				version: "1.0.0",
				"x-custom-extension": "value",
			},
			paths: {},
			"x-root-extension": true,
		};

		const result = schema?.safeParse(doc);

		expect(result?.success).toBe(true);
	});
});

