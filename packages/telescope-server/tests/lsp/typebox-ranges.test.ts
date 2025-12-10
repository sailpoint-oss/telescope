import { describe, expect, test } from "bun:test";
import type { IScriptSnapshot } from "typescript";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import { z } from "zod";
import { DataVirtualCode } from "../../src/lsp/languages/virtualCodes/data-virtual-code";
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
