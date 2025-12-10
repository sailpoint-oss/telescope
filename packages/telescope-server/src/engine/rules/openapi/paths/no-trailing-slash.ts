import { defineRule, type Rule } from "../../api.js";

/**
 * Path No Trailing Slash Rule
 *
 * Validates that paths do not end with trailing slashes (except for root "/").
 * Trailing slashes can cause routing issues and inconsistent behavior.
 */
const pathNoTrailingSlash: Rule = defineRule({
	meta: {
		id: "path-no-trailing-slash",
		number: 201,
		type: "suggestion",
		description: "Paths should not end with trailing slashes",
		defaultSeverity: "warning",
	},
	check(ctx) {
		return {
			PathItem(pathItem) {
				// Use typed method to get the path string
				const path = pathItem.path();
				if (!path) return;

				// Skip root path
				if (path === "/") return;

				// Check for trailing slash
				if (path.endsWith("/")) {
					ctx.reportHere(pathItem, {
						message: `Path '${path}' should not end with a trailing slash`,
						severity: "warning",
					});
				}
			},
		};
	},
});

export default pathNoTrailingSlash;
