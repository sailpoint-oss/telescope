import { defineRule, type Rule } from "../../api.js";

/**
 * Casing patterns
 */
const PATTERNS = {
	kebab: /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
	snake: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
	camel: /^[a-z][a-zA-Z0-9]*$/,
	pascal: /^[A-Z][a-zA-Z0-9]*$/,
};

type CasingStyle = keyof typeof PATTERNS;

/**
 * Path parameter pattern.
 */
const PATH_PARAM_PATTERN = /^\{[^}]+\}$/;

/**
 * Path Casing Consistency Rule
 *
 * Validates that all paths use consistent casing style.
 * Mixing kebab-case, snake_case, camelCase, etc. creates confusion.
 */
const pathCasingConsistency: Rule = defineRule({
	meta: {
		id: "path-casing-consistency",
		number: 204,
		type: "suggestion",
		description: "All paths should use consistent casing",
		defaultSeverity: "warning",
	},
	state: () => ({
		detectedStyle: null as CasingStyle | null,
		firstPathUri: "",
		firstPathPointer: "",
		inconsistentPaths: [] as Array<{
			uri: string;
			pointer: string;
			path: string;
			style: CasingStyle | "unknown";
		}>,
	}),
	check(ctx, state) {
		return {
			PathItem(pathItemRef) {
				const ownerKey = `${pathItemRef.uri}#${pathItemRef.pointer}`;
				const ownerPaths = ctx.project.index.pathItemsToPaths.get(ownerKey) ?? [];
				if (ownerPaths.length === 0) return;

				const path = ownerPaths[0];
				if (!path) return;

				// Get all non-parameter segments
				const segments = path
					.split("/")
					.filter((s) => s.length > 0 && !PATH_PARAM_PATTERN.test(s));

				if (segments.length === 0) return;

				// Detect casing style for this path
				const style = detectCasingStyle(segments);

				if (style === "unknown") {
					// Can't determine style, skip
					return;
				}

				// First path sets the expected style
				if (state.detectedStyle === null) {
					state.detectedStyle = style;
					state.firstPathUri = pathItemRef.uri;
					state.firstPathPointer = pathItemRef.pointer;
					return;
				}

				// Check consistency
				if (style !== state.detectedStyle) {
					state.inconsistentPaths.push({
						uri: pathItemRef.uri,
						pointer: pathItemRef.pointer,
						path,
						style,
					});
				}
			},

			Project() {
				// Report inconsistent paths
				if (state.inconsistentPaths.length > 0 && state.detectedStyle) {
					for (const { uri, pointer, path, style } of state.inconsistentPaths) {
						ctx.reportHere({ uri, pointer }, {
							message: `Path '${path}' uses ${style}-case, but other paths use ${state.detectedStyle}-case. Use consistent casing across all paths.`,
							severity: "warning",
						});
					}
				}
			},
		};
	},
});

/**
 * Detect the dominant casing style of path segments.
 */
function detectCasingStyle(segments: string[]): CasingStyle | "unknown" {
	const styleCounts: Record<CasingStyle | "unknown", number> = {
		kebab: 0,
		snake: 0,
		camel: 0,
		pascal: 0,
		unknown: 0,
	};

	for (const segment of segments) {
		let matched = false;
		for (const [style, pattern] of Object.entries(PATTERNS)) {
			if (pattern.test(segment)) {
				styleCounts[style as CasingStyle]++;
				matched = true;
				break;
			}
		}
		if (!matched) {
			styleCounts.unknown++;
		}
	}

	// Find the dominant style
	let maxCount = 0;
	let dominantStyle: CasingStyle | "unknown" = "unknown";

	for (const [style, count] of Object.entries(styleCounts)) {
		if (style !== "unknown" && count > maxCount) {
			maxCount = count;
			dominantStyle = style as CasingStyle;
		}
	}

	return dominantStyle;
}

export default pathCasingConsistency;

