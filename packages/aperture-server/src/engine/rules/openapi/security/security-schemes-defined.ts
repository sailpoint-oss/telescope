import { defineRule, type RootRef, type Rule } from "../../api.js";

/**
 * Security Schemes Defined Rule
 *
 * Validates that the API defines at least one security scheme in
 * components/securitySchemes. APIs should document their authentication
 * requirements.
 */
const securitySchemesDefined: Rule = defineRule({
	meta: {
		id: "security-schemes-defined",
		number: 601,
		type: "suggestion",
		description: "API must define at least one security scheme",
		defaultSeverity: "info",
	},
	check(ctx) {
		return {
			Root(doc: RootRef) {
				// Use enriched accessor methods
				if (!doc.hasComponents()) {
					ctx.reportAt(doc, "components", {
						message:
							"API should define security schemes in components/securitySchemes",
						severity: "warning",
					});
					return;
				}

				if (!doc.hasSecuritySchemes()) {
					ctx.reportAt(doc, ["components", "securitySchemes"], {
						message:
							"API should define at least one security scheme in components/securitySchemes",
						severity: "warning",
					});
				}
			},
		};
	},
});

export default securitySchemesDefined;
