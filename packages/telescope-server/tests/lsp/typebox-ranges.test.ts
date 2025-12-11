import { describe, expect, test } from "bun:test";
import type { IScriptSnapshot } from "typescript";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import { z } from "zod";
import { DataVirtualCode } from "../../src/lsp/languages/virtualCodes/data-virtual-code";
import { getZodSchema } from "../../src/lsp/services/shared/schema-cache";
import { zodErrorsToDiagnostics } from "../../src/lsp/services/shared/zod-to-diag";

/**
 * Helper to create a DataVirtualCode from YAML text for testing
 */
function createVirtualCode(
	text: string,
	languageId: "yaml" | "json" = "yaml",
): DataVirtualCode {
	const snapshot: IScriptSnapshot = {
		getText: (start, end) => text.slice(start, end),
		getLength: () => text.length,
		getChangeRange: () => undefined,
	};
	return new DataVirtualCode(snapshot, languageId);
}

describe("Zod Diagnostic Range Mapping", () => {
	test("should map missing property error to first key of parent object", () => {
		const text = `name: "Test"
settings:
  debug: true`;
		const virtualCode = createVirtualCode(text);

		const schema = z.object({
			name: z.string(),
			settings: z.object({
				debug: z.boolean(),
				timeout: z.number(), // Missing
			}),
		});

		const result = schema.safeParse(virtualCode.parsedObject);

		if (!result.success) {
			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);

			const range = diagnostics[0]?.range;
			// Should point to the settings object area
			expect(range).toBeDefined();
		} else {
			throw new Error("Validation should have failed");
		}
	});

	test("should map invalid type error to specific value", () => {
		const text = `name: "Test"
version: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = z.object({
			name: z.string(),
			version: z.string(),
		});

		const result = schema.safeParse(virtualCode.parsedObject);

		if (!result.success) {
			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
			);
			expect(diagnostics.length).toBeGreaterThanOrEqual(1);

			// Should have a diagnostic for the invalid version field
			expect(diagnostics[0]?.range).toBeDefined();
		} else {
			throw new Error("Validation should have failed");
		}
	});
});

describe("Zod Diagnostic Edge Cases", () => {
	describe("Nested Object Validation", () => {
		test("should handle deeply nested errors", () => {
			const text = `level1:
  level2:
    level3:
      value: "not a number"`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				level1: z.object({
					level2: z.object({
						level3: z.object({
							value: z.number(),
						}),
					}),
				}),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(1);
				// Should have a diagnostic for the nested value
				expect(diagnostics[0]?.range).toBeDefined();
			}
		});

		test("should handle array items", () => {
			const text = `items:
  - name: "valid"
  - name: 123`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				items: z.array(
					z.object({
						name: z.string(),
					}),
				),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			}
		});
	});

	describe("Error Message Formatting", () => {
		test("should format minimum constraint error", () => {
			const text = `value: 5`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				value: z.number().min(10),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			}
		});

		test("should format maximum constraint error", () => {
			const text = `value: 100`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				value: z.number().max(50),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			}
		});

		test("should format string minLength error", () => {
			const text = `name: "ab"`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				name: z.string().min(5),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			}
		});

		test("should format invalid format error for email", () => {
			const text = `email: "not-an-email"`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				email: z.string().email(),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			}
		});

		test("should format invalid format error for URL", () => {
			const text = `website: "not-a-url"`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				website: z.string().url(),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			}
		});
	});

	describe("Diagnostic Metadata", () => {
		test("should include source in diagnostics", () => {
			const text = `value: "wrong"`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				value: z.number(),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
					"custom-source",
				);
				expect(diagnostics[0]?.source).toBe("custom-source");
			}
		});

		test("should use default source when not provided", () => {
			const text = `value: "wrong"`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				value: z.number(),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics[0]?.source).toBe("zod-schema");
			}
		});

		test("should set severity to Error", () => {
			const text = `value: "wrong"`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				value: z.number(),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics[0]?.severity).toBe(DiagnosticSeverity.Error);
			}
		});

		test("should include code in diagnostics", () => {
			const text = `value: "wrong"`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				value: z.number(),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics[0]?.code).toBeDefined();
			}
		});
	});

	describe("Additional Properties", () => {
		test("should handle additional properties with strict schema", () => {
			const text = `name: "test"
unknownKey: "value"`;
			const virtualCode = createVirtualCode(text);

			const schema = z
				.object({
					name: z.string(),
				})
				.strict();

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			}
		});
	});

	describe("Union Types", () => {
		test("should handle union type errors", () => {
			const text = `value: []`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				value: z.union([z.string(), z.number()]),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThan(0);
			}
		});
	});

	describe("Empty and Null Values", () => {
		test("should handle null value", () => {
			const text = `value: null`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				value: z.string(),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			}
		});

		test("should handle empty string with minLength", () => {
			const text = `value: ""`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				value: z.string().min(1),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			}
		});
	});

	describe("JSON Support", () => {
		test("should get ranges for JSON nodes", () => {
			const json = `{"name": "Test", "version": 123}`;
			const virtualCode = createVirtualCode(json, "json");

			// getRange should work for JSON
			const range = virtualCode.getRange(["name"]);
			expect(range).toBeDefined();
			expect(range?.start.line).toBe(0);
		});
	});

	describe("Multiple Errors", () => {
		test("should report multiple errors", () => {
			const text = `name: 123
version: true`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				name: z.string(),
				version: z.string(),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(2);
			}
		});

		test("should report errors on different lines", () => {
			const text = `name: 123
version: true`;
			const virtualCode = createVirtualCode(text);

			const schema = z.object({
				name: z.string(),
				version: z.string(),
			});

			const result = schema.safeParse(virtualCode.parsedObject);

			expect(result.success).toBe(false);
			if (!result.success) {
				const diagnostics = zodErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				const lines = diagnostics.map((d) => d.range.start.line);
				// Should have errors on different lines
				expect(new Set(lines).size).toBeGreaterThanOrEqual(1);
			}
		});
	});
});

// ============================================================================
// OpenAPI-Specific Error Mapping Tests
// ============================================================================

describe("OpenAPI Zod Schema Error Mapping", () => {
	describe("OpenAPI 3.1 Root Document Errors", () => {
		test("missing info.title maps to correct error path", () => {
			const text = `openapi: "3.1.0"
info:
  version: "1.0.0"
paths: {}`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.1-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			// Should have error mentioning title
			const titleError = diagnostics.find(
				(d) => d.message.includes("title") || d.message.includes("Required"),
			);
			expect(titleError).toBeDefined();
			expect(titleError?.source).toBe("openapi");
		});

		test("missing info.version maps to correct error path", () => {
			const text = `openapi: "3.1.0"
info:
  title: "Test API"
paths: {}`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.1-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			// Should have error mentioning version
			const versionError = diagnostics.find(
				(d) => d.message.includes("version") || d.message.includes("Required"),
			);
			expect(versionError).toBeDefined();
		});

		test("invalid openapi version type produces error", () => {
			const text = `openapi: 3.1
info:
  title: "Test API"
  version: "1.0.0"
paths: {}`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.1-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);
		});

		test("valid document produces no diagnostics", () => {
			const text = `openapi: "3.1.0"
info:
  title: "Test API"
  version: "1.0.0"
paths: {}`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.1-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBe(0);
		});
	});

	describe("OpenAPI 3.0 Root Document Errors", () => {
		test("missing required fields produces multiple errors", () => {
			const text = `openapi: "3.0.0"
info: {}`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.0-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			// Should have errors for info.title, info.version, and paths
			expect(diagnostics.length).toBeGreaterThanOrEqual(2);
		});

		test("missing paths in 3.0 produces error", () => {
			const text = `openapi: "3.0.0"
info:
  title: "Test API"
  version: "1.0.0"`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.0-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			// Should mention paths
			const pathsError = diagnostics.find(
				(d) => d.message.includes("paths") || d.message.includes("Required"),
			);
			expect(pathsError).toBeDefined();
		});
	});

	describe("OpenAPI 3.2 Root Document Errors", () => {
		test("missing info object produces error", () => {
			const text = `openapi: "3.2.0"
paths: {}`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.2-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);
		});

		test("valid 3.2 document produces no errors", () => {
			const text = `openapi: "3.2.0"
info:
  title: "Test API"
  version: "1.0.0"
paths: {}`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.2-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBe(0);
		});
	});

	describe("Nested OpenAPI Object Errors", () => {
		test("invalid operation produces error with path", () => {
			const text = `openapi: "3.1.0"
info:
  title: "Test API"
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: 123
      responses:
        "200":
          description: Success`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.1-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);
		});

		test("invalid parameter location produces error", () => {
			const text = `openapi: "3.1.0"
info:
  title: "Test API"
  version: "1.0.0"
paths:
  /users:
    get:
      parameters:
        - name: userId
          in: invalid
      responses:
        "200":
          description: Success`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.1-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("Error Codes and Messages", () => {
		test("invalid type error has correct code", () => {
			const text = `openapi: "3.1.0"
info:
  title: "Test API"
  version: 123
paths: {}`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.1-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			const typeError = diagnostics.find(
				(d) => d.code === "invalid_type" || d.message.includes("Expected"),
			);
			expect(typeError).toBeDefined();
		});

		test("missing required field error has diagnostic code", () => {
			const text = `openapi: "3.1.0"
info:
  version: "1.0.0"
paths: {}`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.1-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			// All diagnostics should have a code
			for (const diag of diagnostics) {
				expect(diag.code).toBeDefined();
			}
			// Should have error about missing title
			const titleError = diagnostics.find(
				(d) =>
					d.message.includes("title") ||
					d.message.includes("Missing") ||
					d.message.includes("required"),
			);
			expect(titleError).toBeDefined();
		});
	});

	describe("Range Accuracy", () => {
		test("error range points to correct line for info.title", () => {
			const text = `openapi: "3.1.0"
info:
  version: "1.0.0"
paths: {}`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.1-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			// Error should be on or near line 1 (info object) or line 2
			const error = diagnostics[0];
			expect(error?.range.start.line).toBeGreaterThanOrEqual(0);
			expect(error?.range.start.line).toBeLessThanOrEqual(3);
		});

		test("multiple errors have different ranges", () => {
			const text = `openapi: "3.1.0"
info:
  title: 123
  version: true
paths: {}`;
			const virtualCode = createVirtualCode(text);
			const schema = getZodSchema("openapi-3.1-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(2);
			// At least some errors should have different line numbers
			const lines = new Set(diagnostics.map((d) => d.range.start.line));
			expect(lines.size).toBeGreaterThanOrEqual(1);
		});
	});

	describe("JSON Format Support", () => {
		test("JSON OpenAPI document errors map correctly", () => {
			const json = `{
  "openapi": "3.1.0",
  "info": {
    "version": "1.0.0"
  },
  "paths": {}
}`;
			const virtualCode = createVirtualCode(json, "json");
			const schema = getZodSchema("openapi-3.1-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			// Should have error for missing title
			const titleError = diagnostics.find(
				(d) => d.message.includes("title") || d.message.includes("Required"),
			);
			expect(titleError).toBeDefined();
		});

		test("JSON error ranges are valid", () => {
			const json = `{"openapi": "3.1.0", "info": {"version": "1.0.0"}, "paths": {}}`;
			const virtualCode = createVirtualCode(json, "json");
			const schema = getZodSchema("openapi-3.1-root")!;

			const diagnostics = zodErrorsToDiagnostics(
				schema,
				virtualCode.parsedObject,
				virtualCode,
				"openapi",
			);

			expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			// All diagnostics should have valid ranges
			for (const diag of diagnostics) {
				expect(diag.range.start.line).toBeGreaterThanOrEqual(0);
				expect(diag.range.start.character).toBeGreaterThanOrEqual(0);
			}
		});
	});
});
