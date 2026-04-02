/**
 * Custom PathItem rule: require trailing slashes on all paths.
 *
 * This rule demonstrates the PathItem visitor pattern for custom rules.
 * It inverts the built-in `path-no-trailing-slash` rule, requiring that
 * all paths end with `/`.
 *
 * Based on the use case reported in GitHub issue #11.
 *
 * Key API points for PathItem visitors:
 * - `pathItem.path` is a property (not a method) containing the path string
 * - `ctx.report()` takes { message, uri, range, severity }
 * - `ctx.locate(uri, pointer)` returns the source range for a JSON Pointer
 */
import { defineRule } from "@sailpoint-oss/telescope";

export default defineRule({
	meta: {
		id: "custom-trailing-slash",
		number: 9998,
		description: "Paths should end with a trailing slash",
		type: "suggestion",
		fileFormats: ["yaml", "yml", "json"],
	},
	check(ctx) {
		return {
			PathItem(pathItem) {
				const path = pathItem.path;
				if (!path || path === "/") return;

				if (!path.endsWith("/")) {
					const range = ctx.locate(pathItem.uri, pathItem.pointer);
					if (!range) return;

					ctx.report({
						message: `Path '${path}' should end with a trailing slash`,
						uri: pathItem.uri,
						range,
						severity: "warning",
					});
				}
			},
		};
	},
});
