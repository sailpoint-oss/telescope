import { defineRule, type Rule } from "../../api.js";

/**
 * No API Key in Query Rule
 *
 * Warns when API keys are defined to be passed in query parameters.
 * Query parameters can be logged and are visible in browser history,
 * making them a security risk for sensitive credentials.
 */
const noApiKeyInQuery: Rule = defineRule({
	meta: {
		id: "no-api-key-in-query",
		number: 603,
		type: "suggestion",
		description: "API keys should not be passed in query parameters",
		defaultSeverity: "warning",
	},
	check(ctx) {
		return {
			Root(doc) {
				// Use typed method to iterate over security schemes
				doc.eachSecurityScheme((schemeName, schemeObj, ref) => {
					if (!schemeObj || typeof schemeObj !== "object") return;

					const scheme = schemeObj as Record<string, unknown>;
					if (scheme.type !== "apiKey") return;

					if (scheme.in === "query") {
						ctx.reportAt(ref, "in", {
							message: `API key '${schemeName}' should not be passed in query parameters. Consider using header or cookie instead.`,
							severity: "warning",
						});
					}
				});
			},
		};
	},
});

export default noApiKeyInQuery;
