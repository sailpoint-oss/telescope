/**
 * Unresolved Reference Rule
 *
 * Reports $ref entries that cannot be resolved to their target.
 * This rule ensures all references in an OpenAPI document point to
 * existing schemas, parameters, or other components.
 */

import { defineRule, type Rule } from "../../api.js";

const unresolvedRef: Rule = defineRule({
	meta: {
		id: "unresolved-ref",
		number: 402,
		type: "problem",
		description: "Report $ref entries that cannot be resolved",
		defaultSeverity: "error",
		scope: "cross-file", // Requires resolver which needs all referenced files
	},
	check(ctx) {
		return {
			Reference(referenceRef) {
				try {
					const resolved = ctx.project.resolver.deref<unknown>(
						{ uri: referenceRef.uri, pointer: referenceRef.pointer },
						referenceRef.ref,
					);
					if (!resolved) {
						ctx.reportAt(
							{
								uri: referenceRef.uri,
								pointer: referenceRef.pointer,
							},
							"$ref",
							{
								message: `Unresolved $ref: ${referenceRef.ref}`,
								severity: "error",
							},
						);
					}
				} catch {
					ctx.reportAt(
						{
							uri: referenceRef.uri,
							pointer: referenceRef.pointer,
						},
						"$ref",
						{
							message: `Unresolved $ref: ${referenceRef.ref}`,
							severity: "error",
						},
					);
				}
			},
		};
	},
});

export default unresolvedRef;
