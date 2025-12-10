import { defineRule, type Rule } from "../../api.js";

/**
 * Nullable Usage Rule
 *
 * Validates proper usage of nullable schemas across OpenAPI versions:
 * - OpenAPI 3.0: `nullable: true` is the proper way to indicate nullable types
 * - OpenAPI 3.1+: `nullable` is deprecated, use `type: ["string", "null"]` instead
 *
 * This rule demonstrates version-aware validation using:
 * - `ctx.isVersion()` for version-specific logic
 * - `schema.nullable()` typed accessor (returns undefined if not present)
 * - `schema.typeArray()` typed accessor (for 3.1+ array-style types)
 */
const nullableUsage: Rule = defineRule({
	meta: {
		id: "nullable-usage",
		number: 600,
		type: "suggestion",
		description:
			"Validates proper usage of nullable schemas based on OpenAPI version",
		defaultSeverity: "warning",
	},
	check(ctx) {
		return {
			Schema(schema) {
				// Skip $ref schemas
				if (schema.isRef()) return;

				// Get nullable using typed accessor - returns undefined if not present
				const nullable = schema.nullable();
				const type = schema.type();
				const typeArray = schema.typeArray();

				// OpenAPI 3.0: nullable is valid but should have a type
				if (ctx.isVersion("3.0")) {
					if (nullable === true && !type) {
						ctx.reportAt(schema, "nullable", {
							message:
								"nullable without type is ambiguous - specify a type alongside nullable",
							severity: "warning",
						});
					}
				}

				// OpenAPI 3.1+: nullable is deprecated
				if (ctx.isVersion("3.1") || ctx.isVersion("3.2")) {
					if (nullable !== undefined) {
						// Suggest using type array instead
						const suggestedType = type
							? `["${type}", "null"]`
							: '["<type>", "null"]';
						ctx.reportAt(schema, "nullable", {
							message: `nullable is deprecated in OpenAPI 3.1+, use type: ${suggestedType} instead`,
							severity: "warning",
						});
					}

					// Also check for proper usage of type array with null
					if (typeArray && typeArray.includes("null") && nullable === true) {
						ctx.reportAt(schema, "nullable", {
							message:
								"redundant nullable: true when type array already includes null",
							severity: "info",
						});
					}
				}

				// OpenAPI 2.0: nullable doesn't exist, x-nullable might be used
				if (ctx.isVersion("2.0")) {
					if (nullable !== undefined) {
						ctx.reportAt(schema, "nullable", {
							message:
								"nullable is not supported in OpenAPI 2.0 (Swagger), use x-nullable extension instead",
							severity: "error",
						});
					}
				}
			},
		};
	},
});

export default nullableUsage;

