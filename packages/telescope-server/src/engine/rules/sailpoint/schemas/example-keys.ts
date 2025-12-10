import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * SailPoint Schema Example Keys Rule
 *
 * Ensures example keys in schema examples are meaningful names
 * between 6 and 20 characters.
 */
const schemaExampleKeys: Rule = defineRule({
	meta: {
		id: "schema-example-keys",
		number: 507,
		type: "problem",
		description:
			"Example keys in schema examples must be meaningful names between 6 and 20 characters",
	},
	check(ctx) {
		return {
			Schema(schemaRef) {
				const $ = accessor(schemaRef.node);

				// Skip $ref schemas
				if ($.has("$ref")) return;

				const examples = $.getObject("examples");
				if (!examples) return;

				for (const key of Object.keys(examples)) {
					const exampleRef = {
						uri: schemaRef.uri,
						pointer: `${schemaRef.pointer}/examples/${key}`,
						node: examples[key],
					};

					if (key.length < 6) {
						ctx.reportHere(exampleRef, {
							message: `Example key "${key}" must be at least 6 characters long. Use descriptive names like "success-response" or "error-case".`,
							severity: "error",
						});
					} else if (key.length > 20) {
						ctx.reportHere(exampleRef, {
							message: `Example key "${key}" must be no more than 20 characters long. Use concise but descriptive names.`,
							severity: "error",
						});
					}
				}
			},
		};
	},
});

export default schemaExampleKeys;
