import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * Schema AllOf Mixed Types Rule
 *
 * Ensures allOf compositions don't mix incompatible schema types.
 * Uses the recursive Schema visitor - called for every nested schema.
 */
const schemaAllofMixedTypes: Rule = defineRule({
	meta: {
		id: "schema-allof-mixed-types",
		number: 506,
		type: "suggestion",
		description: "allOf compositions must not mix incompatible schema types",
		defaultSeverity: "warning",
	},
	check(ctx) {
		return {
			Schema(schemaRef) {
				const $ = accessor(schemaRef.node);

				// Skip $ref schemas
				if ($.has("$ref")) return;

				// Only check schemas that have allOf
				const allOf = $.getArray<unknown>("allOf");
				if (!allOf || allOf.length < 2) return;

				const declaredTypes = new Set<string>();
				for (const item of allOf) {
					if (!item || typeof item !== "object") continue;
					const itemObj = item as Record<string, unknown>;

					if ("$ref" in itemObj) {
						// Try to resolve
						try {
							const resolved = ctx.project.resolver.deref<
								Record<string, unknown>
							>(
								{ uri: schemaRef.uri, pointer: schemaRef.pointer },
								itemObj.$ref as string,
							);
							if (resolved?.type && typeof resolved.type === "string") {
								declaredTypes.add(resolved.type);
							}
						} catch {
							// Resolution errors are reported elsewhere
						}
					} else {
						const type = itemObj.type;
						if (type && typeof type === "string") {
							declaredTypes.add(type);
						}
					}
				}

				if (declaredTypes.size > 1) {
					const types = Array.from(declaredTypes).sort();
					ctx.reportAt(schemaRef, "allOf", {
						message: `allOf must not mix incompatible types: ${types.join(", ")}. All schemas in allOf should use compatible types or omit type declarations.`,
						severity: "error",
					});
				}
			},
		};
	},
});

export default schemaAllofMixedTypes;
