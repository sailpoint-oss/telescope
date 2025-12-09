import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * String Max Length Rule
 *
 * Suggests that string schemas define a maxLength constraint.
 * Unbounded strings can cause issues with storage, validation,
 * and API abuse. This is a hint-level suggestion for best practice.
 */
const stringMaxLength: Rule = defineRule({
	meta: {
		id: "string-max-length",
		number: 310,
		type: "suggestion",
		description: "String schemas should define maxLength",
		defaultSeverity: "hint",
	},
	check(ctx) {
		return {
			Schema(schemaRef) {
				const $ = accessor(schemaRef.node);

				// Skip $ref schemas
				if ($.has("$ref")) return;

				// Only check string schemas
				const type = $.getString("type");
				if (type !== "string") return;

				// Skip if maxLength is already defined
				if ($.has("maxLength")) return;

				// Skip if this is an enum (fixed values)
				if ($.has("enum")) return;

				// Skip if format suggests bounded values
				const format = $.getString("format");
				const boundedFormats = new Set([
					"date",
					"date-time",
					"time",
					"duration",
					"email",
					"uuid",
					"ipv4",
					"ipv6",
					"uri",
					"hostname",
					"byte",
				]);
				if (format && boundedFormats.has(format)) return;

				ctx.reportAt(schemaRef, "maxLength", {
					message:
						"Consider adding maxLength to string schema to prevent unbounded input",
					severity: "hint",
				});
			},
		};
	},
});

export default stringMaxLength;

