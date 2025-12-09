/**
 * Validators Module
 *
 * Provides declarative format validators for common validation patterns.
 * Simplifies rules by handling string format validation, length checks,
 * pattern matching, and more.
 *
 * @module rules/validators
 *
 * @example
 * ```typescript
 * import { defineRule } from "./api.js";
 * import { validators, validateField, createFieldValidator } from "./validators.js";
 *
 * export default defineRule({
 *   meta: { id: "operation-fields", number: 500, type: "problem", description: "..." },
 *   check(ctx) {
 *     return {
 *       // Option 1: Inline validation
 *       Operation(op) {
 *         validateField(ctx, op, "summary", validators.all(
 *           validators.required(),
 *           validators.maxWords(5)
 *         ));
 *       },
 *
 *       // Option 2: Declarative visitor factory
 *       Schema: createFieldValidator(ctx, {
 *         description: validators.minLength(10),
 *         type: validators.required(),
 *       }),
 *     };
 *   },
 * });
 * ```
 */

import type { FilePatch, RuleContext } from "./types.js";
import { addFieldFix } from "./fix-builder.js";

/**
 * Severity levels for validation messages.
 */
export type Severity = "error" | "warning" | "info";

/**
 * Result of a validation check.
 */
export interface ValidationResult {
	/** Whether the validation passed */
	valid: boolean;
	/** Message to display if validation failed */
	message?: string;
	/** Severity of the validation failure */
	severity?: Severity;
	/** Optional fix to apply when validation fails */
	fix?: FilePatch;
}

/**
 * Reference information for generating auto-fixes.
 */
export interface RefInfo {
	uri: string;
	pointer: string;
}

/**
 * A validator function that checks a value and returns a result.
 * When `ref` is provided, validators can generate auto-fix patches.
 */
export type Validator = (
	value: unknown,
	fieldName: string,
	ref?: RefInfo,
) => ValidationResult;

/**
 * Built-in validators for common validation patterns.
 */
export const validators = {
	/**
	 * Require a non-empty string value.
	 *
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "error")
	 *
	 * @example
	 * ```typescript
	 * validators.required()
	 * validators.required("Summary is required")
	 * validators.required("Summary is recommended", "warning")
	 * ```
	 */
	required:
		(msg?: string, severity?: Severity): Validator =>
		(val, field) => ({
			valid: typeof val === "string" && val.trim().length > 0,
			message: msg ?? `${field} is required`,
			severity: severity ?? "error",
		}),

	/**
	 * Require a string of minimum length.
	 *
	 * @param min - Minimum length
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "warning")
	 *
	 * @example
	 * ```typescript
	 * validators.minLength(10)
	 * validators.minLength(25, "Description should be detailed")
	 * ```
	 */
	minLength:
		(min: number, msg?: string, severity?: Severity): Validator =>
		(val, field) => ({
			valid: typeof val === "string" && val.length >= min,
			message: msg ?? `${field} must be at least ${min} characters`,
			severity: severity ?? "warning",
		}),

	/**
	 * Require a string of maximum length.
	 *
	 * @param max - Maximum length
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "warning")
	 *
	 * @example
	 * ```typescript
	 * validators.maxLength(100)
	 * validators.maxLength(50, "Summary should be concise")
	 * ```
	 */
	maxLength:
		(max: number, msg?: string, severity?: Severity): Validator =>
		(val, field) => ({
			valid: typeof val === "string" && val.length <= max,
			message: msg ?? `${field} must be at most ${max} characters`,
			severity: severity ?? "warning",
		}),

	/**
	 * Require a string with maximum word count.
	 *
	 * @param max - Maximum number of words
	 * @param msg - Custom error message (can use {count} placeholder)
	 * @param severity - Severity level (default: "warning")
	 *
	 * @example
	 * ```typescript
	 * validators.maxWords(5)
	 * validators.maxWords(5, "Summary should be ≤5 words (found {count})")
	 * ```
	 */
	maxWords:
		(max: number, msg?: string, severity?: Severity): Validator =>
		(val, field) => {
			const words =
				typeof val === "string" ? val.trim().split(/\s+/).filter(Boolean) : [];
			const count = val && typeof val === "string" && val.trim() ? words.length : 0;
			return {
				valid: count <= max,
				message: (msg ?? `${field} should be no more than ${max} words (found {count})`).replace(
					"{count}",
					String(count),
				),
				severity: severity ?? "warning",
			};
		},

	/**
	 * Require a string matching a regex pattern.
	 *
	 * @param regex - Pattern to match
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "error")
	 *
	 * @example
	 * ```typescript
	 * validators.pattern(/^[a-z][a-zA-Z0-9]*$/)
	 * validators.pattern(/^[a-z][a-zA-Z0-9]*$/, "operationId must be camelCase")
	 * ```
	 */
	pattern:
		(regex: RegExp, msg?: string, severity?: Severity): Validator =>
		(val, field) => ({
			valid: typeof val === "string" && regex.test(val),
			message: msg ?? `${field} does not match required format`,
			severity: severity ?? "error",
		}),

	/**
	 * Require a value to be one of a set of allowed values.
	 *
	 * @param allowed - Array of allowed values
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "error")
	 *
	 * @example
	 * ```typescript
	 * validators.oneOf(["get", "post", "put", "delete"])
	 * validators.oneOf(["int32", "int64"], "format must be int32 or int64")
	 * ```
	 */
	oneOf:
		<T>(allowed: T[], msg?: string, severity?: Severity): Validator =>
		(val, field) => ({
			valid: allowed.includes(val as T),
			message: msg ?? `${field} must be one of: ${allowed.join(", ")}`,
			severity: severity ?? "error",
		}),

	/**
	 * Forbid certain patterns (e.g., placeholder text).
	 *
	 * @param patterns - Array of regex patterns to forbid
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "error")
	 *
	 * @example
	 * ```typescript
	 * validators.forbidPatterns([/^TODO:/i, /placeholder/i])
	 * ```
	 */
	forbidPatterns:
		(patterns: RegExp[], msg?: string, severity?: Severity): Validator =>
		(val, field) => {
			if (typeof val !== "string") return { valid: true };
			const forbidden = patterns.some((p) => p.test(val));
			return {
				valid: !forbidden,
				message: msg ?? `${field} contains forbidden content`,
				severity: severity ?? "error",
			};
		},

	/**
	 * Require that the field exists (is defined).
	 *
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "error")
	 *
	 * @example
	 * ```typescript
	 * validators.defined()
	 * validators.defined("responses field is required")
	 * ```
	 */
	defined:
		(msg?: string, severity?: Severity): Validator =>
		(val, field) => ({
			valid: val !== undefined,
			message: msg ?? `${field} must be defined`,
			severity: severity ?? "error",
		}),

	/**
	 * Require that a string starts with a capital letter (Title Case).
	 *
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "error")
	 */
	titleCase:
		(msg?: string, severity?: Severity): Validator =>
		(val, field) => ({
			valid: typeof val === "string" && /^[A-Z]/.test(val),
			message: msg ?? `${field} should start with a capital letter`,
			severity: severity ?? "error",
		}),

	/**
	 * Require that a string is in camelCase format.
	 *
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "error")
	 */
	camelCase:
		(msg?: string, severity?: Severity): Validator =>
		(val, field) => ({
			valid: typeof val === "string" && /^[a-z][a-zA-Z0-9]*$/.test(val),
			message: msg ?? `${field} must be camelCase`,
			severity: severity ?? "error",
		}),

	/**
	 * Custom validator with arbitrary logic.
	 *
	 * @param fn - Validation function returning true if valid
	 * @param msg - Error message if invalid
	 * @param severity - Severity level (default: "error")
	 *
	 * @example
	 * ```typescript
	 * validators.custom(
	 *   (val) => typeof val === "string" && val.includes("api"),
	 *   "operationId should contain 'api'"
	 * )
	 * ```
	 */
	custom:
		(
			fn: (val: unknown) => boolean,
			msg: string,
			severity?: Severity,
		): Validator =>
		(val) => ({
			valid: fn(val),
			message: msg,
			severity: severity ?? "error",
		}),

	/**
	 * Compose multiple validators (all must pass).
	 * Stops at first failure.
	 *
	 * @param vs - Validators to compose
	 *
	 * @example
	 * ```typescript
	 * validators.all(
	 *   validators.required(),
	 *   validators.minLength(10),
	 *   validators.maxLength(100)
	 * )
	 * ```
	 */
	all:
		(...vs: Validator[]): Validator =>
		(val, field) => {
			for (const v of vs) {
				const result = v(val, field);
				if (!result.valid) return result;
			}
			return { valid: true };
		},

	/**
	 * Compose multiple validators (any must pass).
	 * Returns valid if any validator passes.
	 *
	 * @param vs - Validators to compose
	 *
	 * @example
	 * ```typescript
	 * validators.any(
	 *   validators.pattern(/^get/),
	 *   validators.pattern(/^list/)
	 * )
	 * ```
	 */
	any:
		(...vs: Validator[]): Validator =>
		(val, field) => {
			let lastResult: ValidationResult = { valid: false, message: `${field} is invalid` };
			for (const v of vs) {
				const result = v(val, field);
				if (result.valid) return result;
				lastResult = result;
			}
			return lastResult;
		},

	/**
	 * Apply validator only if field exists.
	 * Passes validation if field is undefined.
	 *
	 * @param v - Validator to apply when field exists
	 *
	 * @example
	 * ```typescript
	 * validators.optional(validators.minLength(10))
	 * ```
	 */
	optional:
		(v: Validator): Validator =>
		(val, field, ref) => {
			if (val === undefined) return { valid: true };
			return v(val, field, ref);
		},

	// ═══════════════════════════════════════════════════════════════════════════
	// Auto-Fix Validators
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * Require a non-empty string value with an auto-fix that adds a default value.
	 *
	 * @param defaultValue - Value to insert when field is missing
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "error")
	 *
	 * @example
	 * ```typescript
	 * validators.requiredWithFix("TODO: Add summary")
	 * validators.requiredWithFix("TODO", "Summary is required", "error")
	 * ```
	 */
	requiredWithFix:
		(defaultValue: unknown, msg?: string, severity?: Severity): Validator =>
		(val, field, ref) => {
			const isValid = typeof val === "string" && val.trim().length > 0;
			return {
				valid: isValid,
				message: msg ?? `${field} is required`,
				severity: severity ?? "error",
				fix: !isValid && ref ? addFieldFix(ref, field, defaultValue) : undefined,
			};
		},

	/**
	 * Require a string of minimum length with an auto-fix that pads or replaces
	 * with a default value.
	 *
	 * @param min - Minimum length
	 * @param defaultValue - Value to insert when validation fails
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "warning")
	 *
	 * @example
	 * ```typescript
	 * validators.minLengthWithFix(10, "TODO: Add detailed description")
	 * validators.minLengthWithFix(25, "TODO: Expand description", "Description too short")
	 * ```
	 */
	minLengthWithFix:
		(min: number, defaultValue: unknown, msg?: string, severity?: Severity): Validator =>
		(val, field, ref) => {
			const isValid = typeof val === "string" && val.length >= min;
			return {
				valid: isValid,
				message: msg ?? `${field} must be at least ${min} characters`,
				severity: severity ?? "warning",
				fix: !isValid && ref ? addFieldFix(ref, field, defaultValue) : undefined,
			};
		},

	/**
	 * Require a value to be one of a set of allowed values with an auto-fix
	 * that sets a default value.
	 *
	 * @param allowed - Array of allowed values
	 * @param defaultValue - Value to insert when validation fails
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "error")
	 *
	 * @example
	 * ```typescript
	 * validators.oneOfWithFix(["int32", "int64"], "int32")
	 * validators.oneOfWithFix(["asc", "desc"], "asc", "Sort order must be asc or desc")
	 * ```
	 */
	oneOfWithFix:
		<T>(allowed: T[], defaultValue: T, msg?: string, severity?: Severity): Validator =>
		(val, field, ref) => {
			const isValid = allowed.includes(val as T);
			return {
				valid: isValid,
				message: msg ?? `${field} must be one of: ${allowed.join(", ")}`,
				severity: severity ?? "error",
				fix: !isValid && ref ? addFieldFix(ref, field, defaultValue) : undefined,
			};
		},

	/**
	 * Require that a string is in camelCase format with an auto-fix that
	 * converts the value.
	 *
	 * @param msg - Custom error message
	 * @param severity - Severity level (default: "error")
	 *
	 * @example
	 * ```typescript
	 * validators.camelCaseWithFix()
	 * validators.camelCaseWithFix("operationId must be camelCase")
	 * ```
	 */
	camelCaseWithFix:
		(msg?: string, severity?: Severity): Validator =>
		(val, field, ref) => {
			const isValid = typeof val === "string" && /^[a-z][a-zA-Z0-9]*$/.test(val);
			// Convert to camelCase by lowercasing first char and removing non-alphanumeric
			const fixValue = typeof val === "string"
				? val.charAt(0).toLowerCase() + val.slice(1).replace(/[^a-zA-Z0-9]/g, "")
				: val;
			return {
				valid: isValid,
				message: msg ?? `${field} must be camelCase`,
				severity: severity ?? "error",
				fix: !isValid && ref && typeof val === "string" ? addFieldFix(ref, field, fixValue) : undefined,
			};
		},
};

/**
 * Validate a field and report if invalid.
 * When using fix-enabled validators, auto-fixes are automatically registered.
 *
 * @param ctx - Rule context
 * @param ref - Visitor ref with uri, pointer, and node
 * @param field - Field name to validate
 * @param validator - Validator to apply
 * @returns true if valid, false if reported
 *
 * @example Basic validation
 * ```typescript
 * Operation(op) {
 *   validateField(ctx, op, "summary", validators.required());
 *   validateField(ctx, op, "description", validators.minLength(25));
 * }
 * ```
 *
 * @example Validation with auto-fix
 * ```typescript
 * Operation(op) {
 *   // If validation fails, a fix will be suggested that adds "TODO: Add summary"
 *   validateField(ctx, op, "summary", validators.requiredWithFix("TODO: Add summary"));
 * }
 * ```
 */
export function validateField(
	ctx: RuleContext,
	ref: { uri: string; pointer: string; node: unknown },
	field: string,
	validator: Validator,
): boolean {
	const obj = ref.node as Record<string, unknown>;
	const value = obj?.[field];
	// Pass ref info to enable auto-fix generation
	const result = validator(value, field, { uri: ref.uri, pointer: ref.pointer });

	if (!result.valid && result.message) {
		ctx.reportAt(ref, field, {
			message: result.message,
			severity: result.severity ?? "error",
		});
		// Register auto-fix if validator provided one
		if (result.fix) {
			ctx.fix(result.fix);
		}
		return false;
	}
	return true;
}

/**
 * Create a field validation visitor that auto-validates on each visit.
 * Enables declarative field validation with optional auto-fix support.
 *
 * @param ctx - Rule context
 * @param validations - Map of field names to validators
 * @returns Visitor function that validates all specified fields
 *
 * @example Basic declarative validation
 * ```typescript
 * check(ctx) {
 *   return {
 *     Operation: createFieldValidator(ctx, {
 *       summary: validators.all(validators.required(), validators.maxWords(5)),
 *       description: validators.minLength(25),
 *       operationId: validators.pattern(/^[a-z][a-zA-Z0-9]*$/),
 *     }),
 *   };
 * }
 * ```
 *
 * @example With auto-fix validators
 * ```typescript
 * check(ctx) {
 *   return {
 *     Operation: createFieldValidator(ctx, {
 *       summary: validators.requiredWithFix("TODO: Add summary"),
 *       description: validators.minLengthWithFix(25, "TODO: Add detailed description"),
 *     }),
 *   };
 * }
 * ```
 */
export function createFieldValidator<
	T extends { uri: string; pointer: string; node: unknown },
>(ctx: RuleContext, validations: Record<string, Validator>) {
	return (ref: T) => {
		for (const [field, validator] of Object.entries(validations)) {
			validateField(ctx, ref, field, validator);
		}
	};
}

