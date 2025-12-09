import { accessor, defineRule, type Rule } from "../../api.js";

const SORTING_DOC_LINK = "standard-collection-parameters#sorting-results";

/**
 * SailPoint Sorters Parameter Rule
 *
 * Validates that the sorters query parameter follows the standard
 * collection parameter format and references proper documentation.
 */
const parameterSorters: Rule = defineRule({
	meta: {
		id: "parameter-sorters",
		number: 325,
		type: "problem",
		description:
			"sorters query parameter must follow standard collection parameter format",
	},
	check(ctx) {
		return {
			Parameter(parameterRef) {
				const $ = accessor(parameterRef.node);

				// Skip $ref parameters
				if ($.has("$ref")) return;

				// Only check sorters query parameters
				if ($.getString("in") !== "query" || $.getString("name") !== "sorters")
					return;

				const description = $.getString("description");

				// Check if description exists
				if (!description?.trim()) {
					ctx.reportAt(parameterRef, "description", {
						message:
							"`sorters` must describe the standard collection parameter syntax",
						severity: "error",
					});
					return;
				}

				// Check for documentation link
				if (!description.toLowerCase().includes(SORTING_DOC_LINK)) {
					ctx.reportAt(parameterRef, "description", {
						message:
							"`sorters` description must reference the V3 API Standard Collection Parameters sorting documentation",
						severity: "error",
					});
				}
			},
		};
	},
});

export default parameterSorters;
