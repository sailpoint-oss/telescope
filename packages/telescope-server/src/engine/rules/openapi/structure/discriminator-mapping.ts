import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * Discriminator Mapping Complete Rule
 *
 * Validates that discriminator mappings cover all oneOf schemas.
 * When using discriminator with oneOf, the mapping should include
 * entries for all possible schemas to ensure proper deserialization.
 */
const discriminatorMappingComplete: Rule = defineRule({
	meta: {
		id: "discriminator-mapping-complete",
		number: 313,
		type: "problem",
		description: "Discriminator mappings should cover all oneOf schemas",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Schema(schemaRef) {
				const $ = accessor(schemaRef.node);

				// Skip $ref schemas
				if ($.has("$ref")) return;

				// Only check schemas with discriminator
				const discriminator = $.getObject("discriminator");
				if (!discriminator) return;

				// Get oneOf schemas
				const oneOf = $.getArray("oneOf");
				if (!oneOf || oneOf.length === 0) return;

				const disc = discriminator as Record<string, unknown>;
				const propertyName = disc.propertyName;
				if (typeof propertyName !== "string") {
					ctx.reportAt(schemaRef, ["discriminator", "propertyName"], {
						message: "Discriminator must have a propertyName",
						severity: "error",
					});
					return;
				}

				const mapping = disc.mapping as Record<string, string> | undefined;

				// If no explicit mapping, check that each oneOf schema has the discriminator property
				if (!mapping) {
					// OpenAPI allows implicit mapping based on schema names
					// But we should still validate the structure
					for (let i = 0; i < oneOf.length; i++) {
						const subSchema = oneOf[i];
						if (!subSchema || typeof subSchema !== "object") continue;

						const sub = subSchema as Record<string, unknown>;
						// If it's a $ref, we can't easily check the target
						if (sub.$ref) continue;

						// Check if the schema defines the discriminator property
						const properties = sub.properties as Record<string, unknown> | undefined;
						if (!properties || !(propertyName in properties)) {
							ctx.reportAt(schemaRef, ["oneOf", String(i)], {
								message: `oneOf schema at index ${i} should define the discriminator property '${propertyName}'`,
								severity: "warning",
							});
						}
					}
					return;
				}

				// If mapping exists, check it covers all oneOf refs
				const mappingValues = new Set(Object.values(mapping));

				for (let i = 0; i < oneOf.length; i++) {
					const subSchema = oneOf[i];
					if (!subSchema || typeof subSchema !== "object") continue;

					const sub = subSchema as Record<string, unknown>;
					if (sub.$ref && typeof sub.$ref === "string") {
						// Check if this $ref is in the mapping values
						if (!mappingValues.has(sub.$ref)) {
							// Check if any mapping value ends with this $ref (for relative refs)
							const refName = sub.$ref.split("/").pop();
							const isMapped = [...mappingValues].some(
								(v) => v === sub.$ref || v.endsWith(`/${refName}`),
							);

							if (!isMapped) {
								ctx.reportAt(schemaRef, ["discriminator", "mapping"], {
									message: `Discriminator mapping should include an entry for '${sub.$ref}'`,
									severity: "warning",
								});
							}
						}
					}
				}
			},
		};
	},
});

export default discriminatorMappingComplete;

