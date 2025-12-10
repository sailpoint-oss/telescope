import { accessor, defineRule, type Rule } from "../../api.js";

const FILTERING_DOC_LINK = "standard-collection-parameters#filtering-results";

/**
 * SailPoint Filters Parameter Rule
 *
 * Validates that the filters query parameter follows the standard
 * collection parameter format and references proper documentation.
 */
const parameterFilters: Rule = defineRule({
	meta: {
		id: "parameter-filters",
		number: 324,
		type: "problem",
		description:
			"filters query parameter must follow standard collection parameter format",
	},
	check(ctx) {
		return {
			Parameter(parameterRef) {
				const $ = accessor(parameterRef.node);

				// Skip $ref parameters
				if ($.has("$ref")) return;

				// Only check filters query parameters
				if ($.getString("in") !== "query" || $.getString("name") !== "filters")
					return;

				const description = $.getString("description");

				// Check if description exists
				if (!description?.trim()) {
					ctx.reportAt(parameterRef, "description", {
						message:
							"`filters` must describe the standard collection parameter syntax",
						severity: "error",
					});
					return;
				}

				// Check for documentation link
				if (!description.toLowerCase().includes(FILTERING_DOC_LINK)) {
					ctx.reportAt(parameterRef, "description", {
						message:
							"`filters` description must reference the V3 API Standard Collection Parameters filtering documentation",
						severity: "error",
					});
				}
			},
		};
	},
});

export default parameterFilters;
