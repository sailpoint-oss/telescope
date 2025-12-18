import { defineRule, type Rule } from "../../api.js";
import {
	segmentContainsTemplateExpression,
	stripTemplateExpressions,
} from "./path-template.js";

/**
 * HTTP verbs that should not appear in path segments.
 */
const HTTP_VERBS = [
	"get",
	"post",
	"put",
	"patch",
	"delete",
	"head",
	"options",
	"trace",
	"connect",
];

/**
 * Common verb-like words that indicate action in URL.
 */
const ACTION_WORDS = [
	"create",
	"read",
	"update",
	"fetch",
	"remove",
	"add",
	"edit",
	"modify",
	"list",
	"retrieve",
	"save",
	"load",
];

/**
 * Path No HTTP Verbs Rule
 *
 * Validates that path segments do not contain HTTP verbs or action words.
 * RESTful APIs should use HTTP methods for actions, not URL segments.
 */
const pathNoHttpVerbs: Rule = defineRule({
	meta: {
		id: "path-no-http-verbs",
		number: 203,
		type: "suggestion",
		description: "Path segments should not contain HTTP verbs or action words",
		defaultSeverity: "warning",
	},
	check(ctx) {
		return {
			PathItem(pathItemRef) {
				const ownerKey = `${pathItemRef.uri}#${pathItemRef.pointer}`;
				const ownerPaths = ctx.project.index.pathItemsToPaths.get(ownerKey) ?? [];
				if (ownerPaths.length === 0) return;

				const path = ownerPaths[0];
				if (!path) return;

				// Split path into segments
				const segments = path.split("/").filter((s) => s.length > 0);

				for (const segment of segments) {
					const hasTemplate = segmentContainsTemplateExpression(segment);
					const literal = stripTemplateExpressions(segment);
					if (literal.length === 0) continue;
					// Avoid false positives for mixed segments like `get-{id}` -> `get-`
					if (hasTemplate && (literal.startsWith("-") || literal.endsWith("-"))) {
						continue;
					}

					const lowerSegment = literal.toLowerCase();

					// Check for HTTP verbs
					for (const verb of HTTP_VERBS) {
						if (
							lowerSegment === verb ||
							lowerSegment.startsWith(`${verb}-`) ||
							lowerSegment.endsWith(`-${verb}`)
						) {
							ctx.reportHere(pathItemRef, {
								message: `Path segment '${segment}' contains HTTP verb '${verb}'. Use HTTP methods for actions instead of URL segments.`,
								severity: "warning",
							});
							return; // Only report once per path
						}
					}

					// Check for action words (with slightly lower priority)
					for (const action of ACTION_WORDS) {
						if (
							lowerSegment === action ||
							lowerSegment.startsWith(`${action}-`) ||
							lowerSegment.endsWith(`-${action}`)
						) {
							ctx.reportHere(pathItemRef, {
								message: `Path segment '${segment}' contains action word '${action}'. Consider using HTTP methods and resource-based URLs instead.`,
								severity: "info",
							});
							return; // Only report once per path
						}
					}
				}
			},
		};
	},
});

export default pathNoHttpVerbs;

