import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * Kebab-case pattern for path segments.
 * Allows lowercase letters, numbers, and hyphens.
 */
const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Path parameter pattern (e.g., {userId}, {id}).
 */
const PATH_PARAM_PATTERN = /^\{[^}]+\}$/;

/**
 * Path Kebab Case Rule
 *
 * Suggests that path segments use kebab-case (lowercase with hyphens).
 * This is a common REST API convention that improves URL readability.
 *
 * This rule runs on root documents only since path strings are only
 * meaningful at the root level (fragment documents don't have real paths).
 */
const pathKebabCase: Rule = defineRule({
	meta: {
		id: "path-kebab-case",
		number: 202,
		type: "suggestion",
		description: "Path segments should use kebab-case",
		defaultSeverity: "info",
	},
	check(ctx) {
		return {
			Root({ uri, node, pointer }) {
				const $ = accessor(node);
				const paths = $.get("paths");

				// Only run on root documents that have a paths object
				if (!paths || typeof paths !== "object") return;

				const pathsObj = paths as Record<string, unknown>;

				for (const path of Object.keys(pathsObj)) {
					// Path strings must start with /
					if (!path.startsWith("/")) continue;

					// Split path into segments
					const segments = path.split("/").filter((s) => s.length > 0);

					for (const segment of segments) {
						// Skip path parameters
						if (PATH_PARAM_PATTERN.test(segment)) continue;

						// Check if segment is kebab-case
						if (!KEBAB_CASE_PATTERN.test(segment)) {
							// Provide specific feedback
							let suggestion = "";
							if (/[A-Z]/.test(segment)) {
								suggestion = ` Consider using '${toKebabCase(segment)}' instead.`;
							} else if (/_/.test(segment)) {
								suggestion = ` Consider using hyphens instead of underscores.`;
							}

							// Report at the specific path in the paths object
							const pathPointer = `${pointer}/paths/${escapeJsonPointer(path)}`;
							ctx.reportAt({ uri, pointer: pathPointer }, [], {
								message: `Path segment '${segment}' should be kebab-case (lowercase with hyphens).${suggestion}`,
								severity: "info",
							});
							// Only report once per path
							break;
						}
					}
				}
			},
		};
	},
});

/**
 * Escape a string for use in a JSON pointer.
 * ~ becomes ~0, / becomes ~1
 */
function escapeJsonPointer(str: string): string {
	return str.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Convert a string to kebab-case.
 */
function toKebabCase(str: string): string {
	return str
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.replace(/[\s_]+/g, "-")
		.toLowerCase();
}

export default pathKebabCase;

