/**
 * Schema Registry Tests
 *
 * Tests for the schema-registry module that provides schema resolution
 * and registration utilities for language services.
 *
 * @module tests/lsp/schema-registry
 */

import { describe, expect, test } from "bun:test";
import {
	getBuiltInSchemaEntries,
	TELESCOPE_SCHEMA_PREFIX,
} from "../../src/lsp/services/shared/schema-registry";
import { getSchemaKeys } from "../../src/lsp/services/shared/schema-cache";

describe("Schema Registry - Constants", () => {
	test("TELESCOPE_SCHEMA_PREFIX is correct", () => {
		expect(TELESCOPE_SCHEMA_PREFIX).toBe("telescope://");
	});
});

describe("Schema Registry - getBuiltInSchemaEntries", () => {
	test("returns array of schema entries", () => {
		const entries = getBuiltInSchemaEntries();

		expect(Array.isArray(entries)).toBe(true);
		expect(entries.length).toBeGreaterThan(0);
	});

	test("each entry has id and schema properties", () => {
		const entries = getBuiltInSchemaEntries();

		for (const entry of entries) {
			expect(entry.id).toBeDefined();
			expect(typeof entry.id).toBe("string");
			expect(entry.schema).toBeDefined();
			expect(typeof entry.schema).toBe("object");
		}
	});

	test("includes all OpenAPI 3.0 schemas", () => {
		const entries = getBuiltInSchemaEntries();
		const ids = entries.map((e) => e.id);

		expect(ids).toContain("openapi-3.0-root");
		expect(ids).toContain("openapi-3.0-operation");
		expect(ids).toContain("openapi-3.0-schema");
		expect(ids).toContain("openapi-3.0-parameter");
		expect(ids).toContain("openapi-3.0-response");
	});

	test("includes all OpenAPI 3.1 schemas", () => {
		const entries = getBuiltInSchemaEntries();
		const ids = entries.map((e) => e.id);

		expect(ids).toContain("openapi-3.1-root");
		expect(ids).toContain("openapi-3.1-operation");
		expect(ids).toContain("openapi-3.1-schema");
		expect(ids).toContain("openapi-3.1-parameter");
		expect(ids).toContain("openapi-3.1-response");
	});

	test("includes all OpenAPI 3.2 schemas", () => {
		const entries = getBuiltInSchemaEntries();
		const ids = entries.map((e) => e.id);

		expect(ids).toContain("openapi-3.2-root");
		expect(ids).toContain("openapi-3.2-operation");
		expect(ids).toContain("openapi-3.2-schema");
		expect(ids).toContain("openapi-3.2-parameter");
		expect(ids).toContain("openapi-3.2-response");
	});

	test("includes telescope-config schema", () => {
		const entries = getBuiltInSchemaEntries();
		const ids = entries.map((e) => e.id);

		expect(ids).toContain("telescope-config");
	});

	test("entry count matches schema cache keys", () => {
		const entries = getBuiltInSchemaEntries();
		const keys = getSchemaKeys();

		expect(entries.length).toBe(keys.length);
	});

	test("all entries have valid JSON Schema structure", () => {
		const entries = getBuiltInSchemaEntries();

		for (const entry of entries) {
			const schema = entry.schema as Record<string, unknown>;

			// Should have $id pointing to telescope://
			expect(schema.$id).toBe(`telescope://${entry.id}`);

			// Should have a title
			expect(schema.title).toBeDefined();
			expect(typeof schema.title).toBe("string");
		}
	});

	test("root schemas have type object", () => {
		const entries = getBuiltInSchemaEntries();
		const rootEntries = entries.filter((e) => e.id.endsWith("-root"));

		for (const entry of rootEntries) {
			const schema = entry.schema as Record<string, unknown>;
			expect(schema.type).toBe("object");
		}
	});

	test("root schemas have properties defined", () => {
		const entries = getBuiltInSchemaEntries();
		const rootEntries = entries.filter((e) => e.id.endsWith("-root"));

		for (const entry of rootEntries) {
			const schema = entry.schema as Record<string, unknown>;
			expect(schema.properties).toBeDefined();
			expect(typeof schema.properties).toBe("object");
		}
	});
});

describe("Schema Registry - Schema Content", () => {
	test("openapi-3.0-root schema has required openapi field", () => {
		const entries = getBuiltInSchemaEntries();
		const rootEntry = entries.find((e) => e.id === "openapi-3.0-root");
		const schema = rootEntry?.schema as Record<string, unknown>;
		const required = schema?.required as string[];

		expect(required).toBeDefined();
		expect(required).toContain("openapi");
	});

	test("openapi-3.1-root schema has required openapi field", () => {
		const entries = getBuiltInSchemaEntries();
		const rootEntry = entries.find((e) => e.id === "openapi-3.1-root");
		const schema = rootEntry?.schema as Record<string, unknown>;
		const required = schema?.required as string[];

		expect(required).toBeDefined();
		expect(required).toContain("openapi");
	});

	test("openapi-3.2-root schema has required openapi field", () => {
		const entries = getBuiltInSchemaEntries();
		const rootEntry = entries.find((e) => e.id === "openapi-3.2-root");
		const schema = rootEntry?.schema as Record<string, unknown>;
		const required = schema?.required as string[];

		expect(required).toBeDefined();
		expect(required).toContain("openapi");
	});

	test("all root schemas have info in required", () => {
		const entries = getBuiltInSchemaEntries();
		const rootEntries = entries.filter((e) => e.id.endsWith("-root"));

		for (const entry of rootEntries) {
			const schema = entry.schema as Record<string, unknown>;
			const required = schema?.required as string[];

			expect(required).toBeDefined();
			expect(required).toContain("info");
		}
	});
});

describe("Schema Registry - Integration with Schema Cache", () => {
	test("getBuiltInSchemaEntries uses schema cache", () => {
		const entries = getBuiltInSchemaEntries();
		const keys = getSchemaKeys();

		// All entry ids should be in schema cache keys
		for (const entry of entries) {
			expect(keys).toContain(entry.id);
		}
	});

	test("schema entries are consistent with cache", () => {
		const entries = getBuiltInSchemaEntries();

		// Each entry's schema should have the same $id as in cache
		for (const entry of entries) {
			const schema = entry.schema as Record<string, unknown>;
			expect(schema.$id).toBe(`telescope://${entry.id}`);
		}
	});
});

describe("Schema Registry - Version Coverage", () => {
	test("covers all supported OpenAPI versions", () => {
		const entries = getBuiltInSchemaEntries();
		const ids = entries.map((e) => e.id);

		// Check for 3.0 schemas
		const has30 = ids.some((id) => id.includes("3.0"));
		expect(has30).toBe(true);

		// Check for 3.1 schemas
		const has31 = ids.some((id) => id.includes("3.1"));
		expect(has31).toBe(true);

		// Check for 3.2 schemas
		const has32 = ids.some((id) => id.includes("3.2"));
		expect(has32).toBe(true);
	});

	test("each version has consistent component schemas", () => {
		const entries = getBuiltInSchemaEntries();
		const ids = entries.map((e) => e.id);

		const componentTypes = [
			"root",
			"operation",
			"schema",
			"parameter",
			"response",
			"request-body",
			"header",
			"security-scheme",
		];

		for (const version of ["3.0", "3.1", "3.2"]) {
			for (const component of componentTypes) {
				const expectedId = `openapi-${version}-${component}`;
				expect(ids).toContain(expectedId);
			}
		}
	});
});

describe("Schema Registry - Schema IDs", () => {
	test("all schema IDs follow naming convention", () => {
		const entries = getBuiltInSchemaEntries();

		for (const entry of entries) {
			// Should match pattern: openapi-X.Y-type or telescope-config
			const isOpenAPI = /^openapi-\d\.\d-[a-z-]+$/.test(entry.id);
			const isConfig = entry.id === "telescope-config";

			expect(isOpenAPI || isConfig).toBe(true);
		}
	});

	test("schema IDs are unique", () => {
		const entries = getBuiltInSchemaEntries();
		const ids = entries.map((e) => e.id);
		const uniqueIds = new Set(ids);

		expect(uniqueIds.size).toBe(ids.length);
	});
});

