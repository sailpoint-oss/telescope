/**
 * Fixture Validation Tests
 *
 * Tests that validate pre-built OpenAPI fixtures produce expected results.
 * These serve as regression tests for the Zod schema validation pipeline.
 *
 * @module tests/lsp/fixtures
 */

import { describe, expect, test } from "bun:test";
import {
	getVersionedSchemaKey,
	getZodSchema,
} from "../../src/lsp/services/shared/schema-cache";
import { zodErrorsToDiagnostics } from "../../src/lsp/services/shared/zod-to-diag";
import {
	getInvalidFixtureNames,
	getValidFixtureNames,
	loadFixtureAsVirtualCode,
} from "./utils/test-helpers";

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

describe("Fixture Files - Valid Documents", () => {
	const validFixtures = getValidFixtureNames();

	if (validFixtures.length === 0) {
		test.skip("No valid fixtures found", () => {});
	} else {
		for (const fixture of validFixtures) {
			test(`${fixture} produces no validation errors`, () => {
				const virtualCode = loadFixtureAsVirtualCode(fixture);
				const version = detectOpenAPIVersion(virtualCode.parsedObject);

				expect(version).not.toBeNull();

				const schemaKey = getVersionedSchemaKey("root", version!);
				const schema = getZodSchema(schemaKey);

				expect(schema).toBeDefined();

				const diagnostics = zodErrorsToDiagnostics(
					schema!,
					virtualCode.parsedObject,
					virtualCode,
					"fixture-test",
				);

				expect(diagnostics.length).toBe(0);
			});
		}
	}
});

describe("Fixture Files - Invalid Documents", () => {
	const invalidFixtures = getInvalidFixtureNames();

	if (invalidFixtures.length === 0) {
		test.skip("No invalid fixtures found", () => {});
	} else {
		for (const fixture of invalidFixtures) {
			test(`${fixture} produces validation errors`, () => {
				const virtualCode = loadFixtureAsVirtualCode(fixture);
				const version = detectOpenAPIVersion(virtualCode.parsedObject);

				expect(version).not.toBeNull();

				const schemaKey = getVersionedSchemaKey("root", version!);
				const schema = getZodSchema(schemaKey);

				expect(schema).toBeDefined();

				const diagnostics = zodErrorsToDiagnostics(
					schema!,
					virtualCode.parsedObject,
					virtualCode,
					"fixture-test",
				);

				// Invalid fixtures should produce at least one error
				expect(diagnostics.length).toBeGreaterThan(0);
			});
		}
	}
});

describe("Specific Fixture Validation", () => {
	test("invalid-30-missing-info.yaml produces info error", () => {
		const virtualCode = loadFixtureAsVirtualCode("invalid-30-missing-info.yaml");
		const schema = getZodSchema("openapi-3.0-root")!;

		const diagnostics = zodErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"fixture-test",
		);

		expect(diagnostics.length).toBeGreaterThan(0);
		// Should have error about missing info
		const hasInfoError = diagnostics.some(
			(d) =>
				d.message.toLowerCase().includes("info") ||
				d.message.toLowerCase().includes("required"),
		);
		expect(hasInfoError).toBe(true);
	});

	test("invalid-31-bad-schema.yaml produces parameter error", () => {
		const virtualCode = loadFixtureAsVirtualCode("invalid-31-bad-schema.yaml");
		const schema = getZodSchema("openapi-3.1-root")!;

		const diagnostics = zodErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"fixture-test",
		);

		expect(diagnostics.length).toBeGreaterThan(0);
	});

	test("invalid-32-wrong-types.yaml produces type errors", () => {
		const virtualCode = loadFixtureAsVirtualCode("invalid-32-wrong-types.yaml");
		const schema = getZodSchema("openapi-3.2-root")!;

		const diagnostics = zodErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"fixture-test",
		);

		expect(diagnostics.length).toBeGreaterThan(0);
	});

	test("invalid-31-missing-title.yaml produces title error", () => {
		const virtualCode = loadFixtureAsVirtualCode(
			"invalid-31-missing-title.yaml",
		);
		const schema = getZodSchema("openapi-3.1-root")!;

		const diagnostics = zodErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"fixture-test",
		);

		expect(diagnostics.length).toBeGreaterThan(0);
		// Should have error about missing title
		const hasTitleError = diagnostics.some(
			(d) =>
				d.message.toLowerCase().includes("title") ||
				d.message.toLowerCase().includes("required"),
		);
		expect(hasTitleError).toBe(true);
	});

	test("valid-30-minimal.yaml produces no errors", () => {
		const virtualCode = loadFixtureAsVirtualCode("valid-30-minimal.yaml");
		const schema = getZodSchema("openapi-3.0-root")!;

		const diagnostics = zodErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"fixture-test",
		);

		expect(diagnostics.length).toBe(0);
	});

	test("valid-31-complete.yaml produces no errors", () => {
		const virtualCode = loadFixtureAsVirtualCode("valid-31-complete.yaml");
		const schema = getZodSchema("openapi-3.1-root")!;

		const diagnostics = zodErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"fixture-test",
		);

		expect(diagnostics.length).toBe(0);
	});
});

describe("Fixture Diagnostic Properties", () => {
	test("all diagnostics from fixtures have valid ranges", () => {
		const invalidFixtures = getInvalidFixtureNames();

		for (const fixture of invalidFixtures) {
			const virtualCode = loadFixtureAsVirtualCode(fixture);
			const version = detectOpenAPIVersion(virtualCode.parsedObject);

			if (!version) continue;

			const schemaKey = getVersionedSchemaKey("root", version);
			const schema = getZodSchema(schemaKey);

			if (!schema) continue;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"fixture-test",
			);

			for (const diag of diagnostics) {
				expect(diag.range.start.line).toBeGreaterThanOrEqual(0);
				expect(diag.range.start.character).toBeGreaterThanOrEqual(0);
				expect(diag.range.end.line).toBeGreaterThanOrEqual(
					diag.range.start.line,
				);
			}
		}
	});

	test("all diagnostics have codes", () => {
		const invalidFixtures = getInvalidFixtureNames();

		for (const fixture of invalidFixtures) {
			const virtualCode = loadFixtureAsVirtualCode(fixture);
			const version = detectOpenAPIVersion(virtualCode.parsedObject);

			if (!version) continue;

			const schemaKey = getVersionedSchemaKey("root", version);
			const schema = getZodSchema(schemaKey);

			if (!schema) continue;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"fixture-test",
			);

			for (const diag of diagnostics) {
				expect(diag.code).toBeDefined();
			}
		}
	});

	test("all diagnostics have consistent source", () => {
		const invalidFixtures = getInvalidFixtureNames();

		for (const fixture of invalidFixtures) {
			const virtualCode = loadFixtureAsVirtualCode(fixture);
			const version = detectOpenAPIVersion(virtualCode.parsedObject);

			if (!version) continue;

			const schemaKey = getVersionedSchemaKey("root", version);
			const schema = getZodSchema(schemaKey);

			if (!schema) continue;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"test-source",
			);

			for (const diag of diagnostics) {
				expect(diag.source).toBe("test-source");
			}
		}
	});
});

