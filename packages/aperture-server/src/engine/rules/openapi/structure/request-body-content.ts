import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * Operation Request Body Content Rule
 *
 * Validates that request bodies define at least one content type
 * in their content object. A request body without content types
 * is effectively unusable.
 */
const operationRequestBodyContent: Rule = defineRule({
	meta: {
		id: "operation-request-body-content",
		number: 153,
		type: "problem",
		description: "Request bodies must define at least one content type",
		defaultSeverity: "warning",
	},
	check(ctx) {
		return {
			RequestBody(requestBodyRef) {
				const $ = accessor(requestBodyRef.node);

				// Skip $ref request bodies
				if ($.has("$ref")) return;

				const content = $.getObject("content");

				// Check if content exists
				if (!content) {
					ctx.reportAt(requestBodyRef, "content", {
						message: "Request body must define a content object with at least one media type",
						severity: "error",
					});
					return;
				}

				// Check if content has at least one media type
				const mediaTypes = Object.keys(content);
				if (mediaTypes.length === 0) {
					ctx.reportAt(requestBodyRef, "content", {
						message: "Request body content must define at least one media type (e.g., application/json)",
						severity: "error",
					});
				}
			},
		};
	},
});

export default operationRequestBodyContent;

