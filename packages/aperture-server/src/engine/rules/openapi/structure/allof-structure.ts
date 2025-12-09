/**
 * Schema AllOf Structure Rule
 *
 * Detects invalid allOf usage patterns that can cause validation
 * or code generation issues.
 *
 * Using allOf with type, nullable, or properties at the same level
 * is problematic. These should be moved into the allOf schemas.
 */

import { defineRule, type Rule } from "../../api.js";

const schemaAllofStructure: Rule = defineRule({
	meta: {
		id: "schema-allof-structure",
		number: 507,
		type: "suggestion",
		description:
			"Detects allOf used with type, nullable, or properties at the same level",
		defaultSeverity: "warning",
	},
	check(ctx) {
		return {
			Schema(schema) {
				// Skip $ref schemas - use enriched accessor
				if (schema.isRef()) return;

				// Only check schemas with allOf - use enriched accessor
				if (!schema.hasAllOf()) return;

				// Check for allOf with conflicting properties - use enriched accessors
				if (schema.hasType()) {
					ctx.reportHere(schema, {
						message:
							"allOf should not be used with 'type' at the same level. Type should be declared within the allOf schemas or omitted entirely.",
						severity: "warning",
					});
				}

				if (schema.nullable() === true) {
					ctx.reportHere(schema, {
						message:
							"allOf should not be used with 'nullable' at the same level. Nullable should be declared within the allOf schemas if needed.",
						severity: "warning",
					});
				}

				if (schema.hasProperties()) {
					ctx.reportHere(schema, {
						message:
							"allOf should not be used with 'properties' at the same level. Properties should be declared within the allOf schemas or the schema should omit allOf.",
						severity: "warning",
					});
				}
			},
		};
	},
});

export default schemaAllofStructure;
