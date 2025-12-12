import { defineRule, type Rule } from "../../api.js";

/**
 * Schema String Max Length Rule
 *
 * Encourages string schemas to declare a maxLength to avoid unbounded inputs.
 * This is a best-practice style rule (info) and intentionally skips:
 * - $ref schemas
 * - enums (bounded by definition)
 * - composition schemas (allOf/anyOf/oneOf) where limits may be defined elsewhere
 */
const schemaStringMaxLength: Rule = defineRule({
	meta: {
		id: "schema-string-max-length",
		number: 310,
		type: "suggestion",
		description: "String schemas should declare maxLength",
		defaultSeverity: "info",
	},
	check(ctx) {
		return {
			Schema(schema) {
				if (schema.isRef()) return;
				if (schema.isComposition()) return;

				const raw = schema.node as Record<string, unknown>;
				if (!raw || typeof raw !== "object") return;

				if (raw.type !== "string") return;
				if (Array.isArray(raw.enum) && raw.enum.length > 0) return;

				const maxLength = raw.maxLength;
				if (typeof maxLength !== "number") {
					ctx.reportAt(schema, "maxLength", {
						message:
							"String schema should declare maxLength to avoid unbounded input. If unbounded is intended, consider documenting that explicitly.",
						severity: "info",
					});
				}
			},
		};
	},
});

export default schemaStringMaxLength;
