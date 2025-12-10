import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * SailPoint Parameter Example Keys Rule
 *
 * Validates that example keys in parameter examples are meaningful names
 * between 6 and 20 characters.
 */
const parameterExampleKeys: Rule = defineRule({
	meta: {
		id: "parameter-example-keys",
		number: 507,
		type: "problem",
		description:
			"Example keys in parameter examples must be meaningful names between 6 and 20 characters",
	},
	check(ctx) {
		return {
			Parameter(parameterRef) {
				const $ = accessor(parameterRef.node);

				// Skip $ref parameters
				if ($.has("$ref")) return;

				const examples = $.getObject("examples");
				if (!examples) return;

				for (const key of Object.keys(examples)) {
					const exampleRef = {
						uri: parameterRef.uri,
						pointer: `${parameterRef.pointer}/examples/${key}`,
						node: examples[key],
					};

					if (key.length < 6) {
						ctx.reportHere(exampleRef, {
							message: `Example key "${key}" must be at least 6 characters long. Use descriptive names like "default-value" or "custom-input".`,
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

export default parameterExampleKeys;
