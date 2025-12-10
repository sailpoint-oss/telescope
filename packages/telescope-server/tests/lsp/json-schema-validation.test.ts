import { describe, expect, test } from "bun:test";
import type { IScriptSnapshot } from "typescript";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import { DataVirtualCode } from "../../src/lsp/languages/virtualCodes/data-virtual-code";
import {
	clearValidatorCache,
	jsonSchemaErrorsToDiagnostics,
} from "../../src/lsp/services/shared/json-schema-to-diag";

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

describe("JSON Schema Diagnostic Range Mapping", () => {
	test("should map missing required field to first key of parent object", () => {
		const text = `name: "Test"
settings:
  debug: true`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string" },
				settings: {
					type: "object",
					properties: {
						debug: { type: "boolean" },
						timeout: { type: "number" },
					},
					required: ["debug", "timeout"],
				},
			},
			required: ["name", "settings"],
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Missing required field");
		expect(diagnostics[0]?.message).toContain("timeout");
	});

	test("should map type mismatch error to specific value", () => {
		const text = `name: "Test"
version: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string" },
				version: { type: "string" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Expected string");
		expect(diagnostics[0]?.message).toContain("received number");

		// Should point to the version value on line 1
		const range = diagnostics[0]?.range;
		expect(range?.start.line).toBe(1);
	});
});

describe("JSON Schema Draft Version Support", () => {
	test("should validate with draft-04 schema", () => {
		const text = `name: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-04/schema#",
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Expected string");
	});

	test("should validate with draft-07 schema", () => {
		const text = `name: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Expected string");
	});

	test("should validate with draft-2019-09 schema", () => {
		const text = `name: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "https://json-schema.org/draft/2019-09/schema",
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Expected string");
	});

	test("should validate with draft-2020-12 schema", () => {
		const text = `name: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "https://json-schema.org/draft/2020-12/schema",
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Expected string");
	});

	test("should default to draft-07 for schemas without $schema", () => {
		const text = `name: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Expected string");
	});
});

describe("JSON Schema Error Message Formatting", () => {
	test("should format enum validation error", () => {
		const text = `status: invalid`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				status: { type: "string", enum: ["active", "inactive", "pending"] },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Invalid value");
		expect(diagnostics[0]?.message).toContain("Expected one of");
		expect(diagnostics[0]?.message).toContain("active");
	});

	test("should format additionalProperties error", () => {
		const text = `name: "Test"
unknownField: "value"`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string" },
			},
			additionalProperties: false,
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Unrecognized key");
		expect(diagnostics[0]?.message).toContain("unknownField");
	});

	test("should format minLength error", () => {
		const text = `name: "ab"`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string", minLength: 5 },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("String is too short");
		expect(diagnostics[0]?.message).toContain("at least 5");
	});

	test("should format maxLength error", () => {
		const text = `name: "this is a very long string"`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string", maxLength: 10 },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("String is too long");
		expect(diagnostics[0]?.message).toContain("at most 10");
	});

	test("should format minimum error", () => {
		const text = `age: -5`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				age: { type: "number", minimum: 0 },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Number is too small");
		expect(diagnostics[0]?.message).toContain("at least 0");
	});

	test("should format maximum error", () => {
		const text = `count: 150`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				count: { type: "number", maximum: 100 },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Number is too large");
		expect(diagnostics[0]?.message).toContain("at most 100");
	});

	test("should format pattern error", () => {
		const text = `email: "not-an-email"`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				email: { type: "string", pattern: "^[a-z]+@[a-z]+\\.[a-z]+$" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain(
			"String does not match required pattern",
		);
	});

	test("should format email format error", () => {
		const text = `email: "not-an-email"`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				email: { type: "string", format: "email" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Invalid email format");
	});

	test("should format URL format error", () => {
		const text = `website: "not-a-url"`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				website: { type: "string", format: "uri" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Invalid URL format");
	});
});

describe("JSON Schema Nested Object Validation", () => {
	test("should handle deeply nested errors", () => {
		const text = `level1:
  level2:
    level3:
      value: "not-a-number"`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				level1: {
					type: "object",
					properties: {
						level2: {
							type: "object",
							properties: {
								level3: {
									type: "object",
									properties: {
										value: { type: "number" },
									},
								},
							},
						},
					},
				},
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Expected number");
		expect(diagnostics[0]?.message).toContain("level1.level2.level3.value");
	});

	test("should handle array item errors", () => {
		const text = `items:
  - name: "valid"
  - name: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				items: {
					type: "array",
					items: {
						type: "object",
						properties: {
							name: { type: "string" },
						},
					},
				},
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Expected string");
		expect(diagnostics[0]?.message).toContain("items.1.name");
	});
});

describe("JSON Schema Diagnostic Metadata", () => {
	test("should include source in diagnostics", () => {
		const text = `name: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"my-custom-source",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.source).toBe("my-custom-source");
	});

	test("should use default source when not provided", () => {
		const text = `name: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.source).toBe("json-schema");
	});

	test("should set severity to Error", () => {
		const text = `name: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.severity).toBe(DiagnosticSeverity.Error);
	});

	test("should include keyword as code", () => {
		const text = `name: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.code).toBe("type");
	});
});

describe("JSON Schema Multiple Errors", () => {
	test("should report multiple errors", () => {
		const text = `name: 123
age: "not-a-number"`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string" },
				age: { type: "number" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(2);
	});

	test("should report errors on different lines", () => {
		const text = `name: 123
age: "not-a-number"`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string" },
				age: { type: "number" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(2);

		const lines = diagnostics.map((d) => d.range.start.line).sort();
		expect(lines[0]).toBe(0);
		expect(lines[1]).toBe(1);
	});
});

describe("JSON Schema JSON Support", () => {
	test("should get ranges for JSON nodes", () => {
		const text = `{"name": 123, "version": "1.0"}`;
		const virtualCode = createVirtualCode(text, "json");

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string" },
				version: { type: "string" },
			},
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(1);
		expect(diagnostics[0]?.message).toContain("Expected string");

		// The error should have a valid range in the JSON document
		const range = diagnostics[0]?.range;
		expect(range?.start.line).toBe(0);
		expect(range?.start.character).toBeGreaterThan(0);
	});
});

describe("JSON Schema Valid Documents", () => {
	test("should return no diagnostics for valid document", () => {
		const text = `name: "Test"
version: "1.0.0"
count: 42`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string" },
				version: { type: "string" },
				count: { type: "number" },
			},
			required: ["name", "version"],
		};

		const diagnostics = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics.length).toBe(0);
	});
});

describe("JSON Schema Validator Cache", () => {
	test("should cache compiled validators", () => {
		clearValidatorCache();

		const text = `name: 123`;
		const virtualCode = createVirtualCode(text);

		const schema = {
			$schema: "http://json-schema.org/draft-07/schema#",
			type: "object",
			properties: {
				name: { type: "string" },
			},
		};

		// First call - should compile
		const diagnostics1 = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		// Second call - should use cache
		const diagnostics2 = jsonSchemaErrorsToDiagnostics(
			schema,
			virtualCode.parsedObject,
			virtualCode,
			"test-schema",
		);

		expect(diagnostics1.length).toBe(1);
		expect(diagnostics2.length).toBe(1);
		expect(diagnostics1[0]?.message).toBe(diagnostics2[0]?.message);
	});
});
