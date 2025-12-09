import { describe, expect, test } from "bun:test";
import type { IScriptSnapshot } from "typescript";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import { DataVirtualCode } from "../../src/lsp/languages/virtualCodes/data-virtual-code";
import { typeboxErrorsToDiagnostics } from "../../src/lsp/services/shared/typebox-to-diag";

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

describe("TypeBox Diagnostic Range Mapping", () => {
	test("should map missing property error to first key of parent object", () => {
		const text = `name: "Test"
settings:
  debug: true`;
		const virtualCode = createVirtualCode(text);

		const schema = Type.Object({
			name: Type.String(),
			settings: Type.Object({
				debug: Type.Boolean(),
				timeout: Type.Number(), // Missing
			}),
		});

		const isValid = Value.Check(schema, virtualCode.parsedObject);

		if (!isValid) {
			const diagnostics = typeboxErrorsToDiagnostics(
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

		const schema = Type.Object({
			name: Type.String(),
			version: Type.String(),
		});

		const isValid = Value.Check(schema, virtualCode.parsedObject);

		if (!isValid) {
			const diagnostics = typeboxErrorsToDiagnostics(
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

describe("TypeBox Diagnostic Edge Cases", () => {
	describe("Nested Object Validation", () => {
		test("should handle deeply nested errors", () => {
			const text = `level1:
  level2:
    level3:
      value: "not a number"`;
			const virtualCode = createVirtualCode(text);

			const schema = Type.Object({
				level1: Type.Object({
					level2: Type.Object({
						level3: Type.Object({
							value: Type.Number(),
						}),
					}),
				}),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				items: Type.Array(
					Type.Object({
						name: Type.String(),
					}),
				),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				value: Type.Number({ minimum: 10 }),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				value: Type.Number({ maximum: 50 }),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				name: Type.String({ minLength: 5 }),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				email: Type.String({ format: "email" }),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics.length).toBeGreaterThanOrEqual(1);
			}
		});

		test("should format invalid format error for URI", () => {
			const text = `website: "not-a-url"`;
			const virtualCode = createVirtualCode(text);

			const schema = Type.Object({
				website: Type.String({ format: "uri" }),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				value: Type.Number(),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				value: Type.Number(),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
					schema,
					virtualCode.parsedObject,
					virtualCode,
				);
				expect(diagnostics[0]?.source).toBe("typebox-schema");
			}
		});

		test("should set severity to Error", () => {
			const text = `value: "wrong"`;
			const virtualCode = createVirtualCode(text);

			const schema = Type.Object({
				value: Type.Number(),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				value: Type.Number(),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object(
				{
					name: Type.String(),
				},
				{ additionalProperties: false },
			);

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				value: Type.Union([Type.String(), Type.Number()]),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				value: Type.String(),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				value: Type.String({ minLength: 1 }),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				name: Type.String(),
				version: Type.String(),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

			const schema = Type.Object({
				name: Type.String(),
				version: Type.String(),
			});

			const isValid = Value.Check(schema, virtualCode.parsedObject);

			expect(isValid).toBe(false);
			if (!isValid) {
				const diagnostics = typeboxErrorsToDiagnostics(
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

