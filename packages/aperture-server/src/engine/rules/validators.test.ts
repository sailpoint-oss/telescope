import { describe, expect, it } from "bun:test";
import { validators } from "./validators.js";

describe("validators", () => {
	describe("required", () => {
		const v = validators.required();

		it("should pass for non-empty string", () => {
			expect(v("hello", "field").valid).toBe(true);
		});

		it("should fail for empty string", () => {
			const result = v("", "summary");
			expect(result.valid).toBe(false);
			expect(result.message).toBe("summary is required");
			expect(result.severity).toBe("error");
		});

		it("should fail for whitespace-only string", () => {
			expect(v("   ", "field").valid).toBe(false);
		});

		it("should fail for undefined", () => {
			expect(v(undefined, "field").valid).toBe(false);
		});

		it("should fail for non-string", () => {
			expect(v(123, "field").valid).toBe(false);
		});

		it("should use custom message", () => {
			const custom = validators.required("Custom message");
			expect(custom("", "field").message).toBe("Custom message");
		});

		it("should use custom severity", () => {
			const custom = validators.required("msg", "warning");
			expect(custom("", "field").severity).toBe("warning");
		});
	});

	describe("minLength", () => {
		const v = validators.minLength(5);

		it("should pass for string at minimum length", () => {
			expect(v("hello", "field").valid).toBe(true);
		});

		it("should pass for string above minimum length", () => {
			expect(v("hello world", "field").valid).toBe(true);
		});

		it("should fail for string below minimum length", () => {
			const result = v("hi", "description");
			expect(result.valid).toBe(false);
			expect(result.message).toBe("description must be at least 5 characters");
		});

		it("should fail for non-string", () => {
			expect(v(123, "field").valid).toBe(false);
		});
	});

	describe("maxLength", () => {
		const v = validators.maxLength(5);

		it("should pass for string at maximum length", () => {
			expect(v("hello", "field").valid).toBe(true);
		});

		it("should pass for string below maximum length", () => {
			expect(v("hi", "field").valid).toBe(true);
		});

		it("should fail for string above maximum length", () => {
			const result = v("hello world", "summary");
			expect(result.valid).toBe(false);
			expect(result.message).toBe("summary must be at most 5 characters");
		});
	});

	describe("maxWords", () => {
		const v = validators.maxWords(3);

		it("should pass for text with fewer words", () => {
			expect(v("two words", "field").valid).toBe(true);
		});

		it("should pass for text at maximum words", () => {
			expect(v("one two three", "field").valid).toBe(true);
		});

		it("should fail for text with too many words", () => {
			const result = v("one two three four five", "summary");
			expect(result.valid).toBe(false);
			expect(result.message).toContain("no more than 3 words");
			expect(result.message).toContain("5");
		});

		it("should handle empty string", () => {
			expect(v("", "field").valid).toBe(true);
		});

		it("should use {count} placeholder in custom message", () => {
			const custom = validators.maxWords(2, "Found {count} words");
			expect(custom("one two three", "field").message).toBe("Found 3 words");
		});
	});

	describe("pattern", () => {
		const v = validators.pattern(/^[a-z]+$/);

		it("should pass for matching string", () => {
			expect(v("hello", "field").valid).toBe(true);
		});

		it("should fail for non-matching string", () => {
			const result = v("Hello123", "operationId");
			expect(result.valid).toBe(false);
			expect(result.message).toBe("operationId does not match required format");
		});

		it("should fail for non-string", () => {
			expect(v(123, "field").valid).toBe(false);
		});

		it("should use custom message", () => {
			const custom = validators.pattern(/^[a-z]+$/, "Must be lowercase");
			expect(custom("ABC", "field").message).toBe("Must be lowercase");
		});
	});

	describe("oneOf", () => {
		const v = validators.oneOf(["get", "post", "put"]);

		it("should pass for allowed value", () => {
			expect(v("get", "field").valid).toBe(true);
		});

		it("should fail for disallowed value", () => {
			const result = v("delete", "method");
			expect(result.valid).toBe(false);
			expect(result.message).toBe("method must be one of: get, post, put");
		});
	});

	describe("forbidPatterns", () => {
		const v = validators.forbidPatterns([/^TODO:/i, /placeholder/i]);

		it("should pass for clean text", () => {
			expect(v("Valid description", "field").valid).toBe(true);
		});

		it("should fail for forbidden pattern", () => {
			expect(v("TODO: add description", "field").valid).toBe(false);
		});

		it("should fail for any forbidden pattern", () => {
			expect(v("This is a placeholder", "field").valid).toBe(false);
		});

		it("should pass for non-string", () => {
			expect(v(123, "field").valid).toBe(true);
		});
	});

	describe("defined", () => {
		const v = validators.defined();

		it("should pass for defined value", () => {
			expect(v("value", "field").valid).toBe(true);
		});

		it("should pass for null", () => {
			expect(v(null, "field").valid).toBe(true);
		});

		it("should fail for undefined", () => {
			expect(v(undefined, "field").valid).toBe(false);
		});
	});

	describe("titleCase", () => {
		const v = validators.titleCase();

		it("should pass for title case", () => {
			expect(v("Hello World", "field").valid).toBe(true);
		});

		it("should fail for lowercase start", () => {
			expect(v("hello world", "field").valid).toBe(false);
		});

		it("should fail for non-string", () => {
			expect(v(123, "field").valid).toBe(false);
		});
	});

	describe("camelCase", () => {
		const v = validators.camelCase();

		it("should pass for camelCase", () => {
			expect(v("listUsers", "field").valid).toBe(true);
		});

		it("should pass for single lowercase word", () => {
			expect(v("list", "field").valid).toBe(true);
		});

		it("should fail for PascalCase", () => {
			expect(v("ListUsers", "field").valid).toBe(false);
		});

		it("should fail for snake_case", () => {
			expect(v("list_users", "field").valid).toBe(false);
		});

		it("should fail for kebab-case", () => {
			expect(v("list-users", "field").valid).toBe(false);
		});
	});

	describe("custom", () => {
		it("should use custom function", () => {
			const v = validators.custom(
				(val) => typeof val === "number" && val > 0,
				"Must be positive number",
			);

			expect(v(5, "field").valid).toBe(true);
			expect(v(-1, "field").valid).toBe(false);
			expect(v(-1, "field").message).toBe("Must be positive number");
		});
	});

	describe("all", () => {
		const v = validators.all(
			validators.required(),
			validators.minLength(5),
			validators.maxLength(10),
		);

		it("should pass when all validators pass", () => {
			expect(v("hello", "field").valid).toBe(true);
		});

		it("should fail on first failing validator", () => {
			const result = v("", "field");
			expect(result.valid).toBe(false);
			expect(result.message).toContain("required");
		});

		it("should check subsequent validators", () => {
			const result = v("hi", "field");
			expect(result.valid).toBe(false);
			expect(result.message).toContain("at least 5");
		});
	});

	describe("any", () => {
		const v = validators.any(
			validators.pattern(/^get/),
			validators.pattern(/^list/),
		);

		it("should pass if any validator passes", () => {
			expect(v("getUsers", "field").valid).toBe(true);
			expect(v("listUsers", "field").valid).toBe(true);
		});

		it("should fail if no validator passes", () => {
			expect(v("createUser", "field").valid).toBe(false);
		});
	});

	describe("optional", () => {
		const v = validators.optional(validators.minLength(5));

		it("should pass for undefined", () => {
			expect(v(undefined, "field").valid).toBe(true);
		});

		it("should apply validator when value exists", () => {
			expect(v("hello", "field").valid).toBe(true);
			expect(v("hi", "field").valid).toBe(false);
		});
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// Auto-Fix Validators
	// ═══════════════════════════════════════════════════════════════════════════

	describe("requiredWithFix", () => {
		const v = validators.requiredWithFix("TODO: Add summary");

		it("should pass for non-empty string without generating fix", () => {
			const result = v("hello", "summary", { uri: "file:///test.yaml", pointer: "#/paths/~1users/get" });
			expect(result.valid).toBe(true);
			expect(result.fix).toBeUndefined();
		});

		it("should fail for empty string and generate fix", () => {
			const result = v("", "summary", { uri: "file:///test.yaml", pointer: "#/paths/~1users/get" });
			expect(result.valid).toBe(false);
			expect(result.message).toBe("summary is required");
			expect(result.fix).toBeDefined();
			expect(result.fix?.uri).toBe("file:///test.yaml");
			expect(result.fix?.ops).toHaveLength(1);
			expect(result.fix?.ops[0].op).toBe("add");
			expect(result.fix?.ops[0].path).toBe("#/paths/~1users/get/summary");
			expect((result.fix?.ops[0] as { value: unknown }).value).toBe("TODO: Add summary");
		});

		it("should fail for undefined and generate fix", () => {
			const result = v(undefined, "summary", { uri: "file:///test.yaml", pointer: "#/paths/~1users/get" });
			expect(result.valid).toBe(false);
			expect(result.fix).toBeDefined();
		});

		it("should not generate fix without ref info", () => {
			const result = v("", "summary");
			expect(result.valid).toBe(false);
			expect(result.fix).toBeUndefined();
		});

		it("should use custom message and severity", () => {
			const custom = validators.requiredWithFix("default", "Custom message", "warning");
			const result = custom("", "field", { uri: "file:///test.yaml", pointer: "#" });
			expect(result.message).toBe("Custom message");
			expect(result.severity).toBe("warning");
		});
	});

	describe("minLengthWithFix", () => {
		const v = validators.minLengthWithFix(10, "TODO: Expand description");

		it("should pass for string at minimum length without generating fix", () => {
			const result = v("0123456789", "description", { uri: "file:///test.yaml", pointer: "#" });
			expect(result.valid).toBe(true);
			expect(result.fix).toBeUndefined();
		});

		it("should fail for short string and generate fix", () => {
			const result = v("short", "description", { uri: "file:///test.yaml", pointer: "#/components/schemas/User" });
			expect(result.valid).toBe(false);
			expect(result.message).toBe("description must be at least 10 characters");
			expect(result.fix).toBeDefined();
			expect((result.fix?.ops[0] as { value: unknown }).value).toBe("TODO: Expand description");
		});

		it("should not generate fix without ref info", () => {
			const result = v("short", "description");
			expect(result.valid).toBe(false);
			expect(result.fix).toBeUndefined();
		});
	});

	describe("oneOfWithFix", () => {
		const v = validators.oneOfWithFix(["int32", "int64"], "int32");

		it("should pass for allowed value without generating fix", () => {
			const result = v("int64", "format", { uri: "file:///test.yaml", pointer: "#" });
			expect(result.valid).toBe(true);
			expect(result.fix).toBeUndefined();
		});

		it("should fail for disallowed value and generate fix", () => {
			const result = v("integer", "format", { uri: "file:///test.yaml", pointer: "#/components/schemas/Id" });
			expect(result.valid).toBe(false);
			expect(result.message).toBe("format must be one of: int32, int64");
			expect(result.fix).toBeDefined();
			expect((result.fix?.ops[0] as { value: unknown }).value).toBe("int32");
		});

		it("should use custom message", () => {
			const custom = validators.oneOfWithFix(["asc", "desc"], "asc", "Sort order invalid");
			const result = custom("up", "sort", { uri: "file:///test.yaml", pointer: "#" });
			expect(result.message).toBe("Sort order invalid");
		});
	});

	describe("camelCaseWithFix", () => {
		const v = validators.camelCaseWithFix();

		it("should pass for camelCase without generating fix", () => {
			const result = v("listUsers", "operationId", { uri: "file:///test.yaml", pointer: "#" });
			expect(result.valid).toBe(true);
			expect(result.fix).toBeUndefined();
		});

		it("should fail for PascalCase and generate fix", () => {
			const result = v("ListUsers", "operationId", { uri: "file:///test.yaml", pointer: "#/paths/~1users/get" });
			expect(result.valid).toBe(false);
			expect(result.fix).toBeDefined();
			expect((result.fix?.ops[0] as { value: unknown }).value).toBe("listUsers");
		});

		it("should remove non-alphanumeric characters", () => {
			const result = v("list-users", "operationId", { uri: "file:///test.yaml", pointer: "#" });
			expect(result.valid).toBe(false);
			expect((result.fix?.ops[0] as { value: unknown }).value).toBe("listusers");
		});

		it("should not generate fix for non-string", () => {
			const result = v(123, "operationId", { uri: "file:///test.yaml", pointer: "#" });
			expect(result.valid).toBe(false);
			expect(result.fix).toBeUndefined();
		});
	});
});

