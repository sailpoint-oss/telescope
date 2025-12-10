/**
 * SailPoint-Specific Rules
 *
 * These rules enforce SailPoint's business requirements for API specifications.
 * They require fields that OpenAPI says are optional but SailPoint mandates.
 *
 * Directory structure:
 * - operations/ - Operation-level requirements
 * - parameters/ - Parameter-level requirements
 * - schemas/ - Schema-level requirements
 * - types/ - Type validation requirements
 * - root/ - Document-level requirements
 */

import type { Rule } from "../types.js";

// Operation rules - SailPoint requirements
import operationDescriptionRequired from "./operations/description-required.js";
import operationErrorResponses from "./operations/error-responses.js";
import operationIdFormat from "./operations/id-format.js";
import operationPagination from "./operations/pagination.js";
import operationSecurityRequirements from "./operations/security-requirements.js";
import operationSummaryRequired from "./operations/summary-required.js";
import operationTagsRequired from "./operations/tags-required.js";
import operationUserLevels from "./operations/user-levels.js";

// Parameter rules - SailPoint requirements
import parameterDescriptionRequired from "./parameters/description-required.js";
import parameterExampleRequired from "./parameters/example-required.js";
import parameterExampleKeys from "./parameters/example-keys.js";
import parameterFilters from "./parameters/filters.js";
import parameterRequiredExplicit from "./parameters/required-explicit.js";
import parameterSorters from "./parameters/sorters.js";

// Schema rules - SailPoint requirements
import schemaDescriptionRequired from "./schemas/description-required.js";
import schemaExampleKeys from "./schemas/example-keys.js";
import schemaExampleRequired from "./schemas/example-required.js";
import schemaRequiredArray from "./schemas/required-array.js";

// Types rules - SailPoint requirements
import booleanDefault from "./types/boolean-default.js";
import numericFormat from "./types/numeric-format.js";

// Root rules - SailPoint-specific extensions
import rootSailpointApi from "./root/sailpoint-api.js";
import rootTags from "./root/tags.js";

/**
 * All SailPoint-specific rules as an array
 */
export const sailpointRules: Rule[] = [
	// Operation rules
	operationDescriptionRequired,
	operationErrorResponses,
	operationIdFormat,
	operationPagination,
	operationSecurityRequirements,
	operationSummaryRequired,
	operationTagsRequired,
	operationUserLevels,

	// Parameter rules
	parameterDescriptionRequired,
	parameterExampleRequired,
	parameterExampleKeys,
	parameterFilters,
	parameterRequiredExplicit,
	parameterSorters,

	// Schema rules
	schemaDescriptionRequired,
	schemaExampleKeys,
	schemaExampleRequired,
	schemaRequiredArray,

	// Types rules
	booleanDefault,
	numericFormat,

	// Root rules
	rootSailpointApi,
	rootTags,
];

/**
 * Map of SailPoint rule IDs to rules for quick lookup
 */
export const sailpointRulesMap = new Map<string, Rule>(
	sailpointRules.map((rule) => [rule.meta.id, rule]),
);

// Named exports for individual rules
export {
	// Operation rules
	operationDescriptionRequired,
	operationErrorResponses,
	operationIdFormat,
	operationPagination,
	operationSecurityRequirements,
	operationSummaryRequired,
	operationTagsRequired,
	operationUserLevels,

	// Parameter rules
	parameterDescriptionRequired,
	parameterExampleRequired,
	parameterExampleKeys,
	parameterFilters,
	parameterRequiredExplicit,
	parameterSorters,

	// Schema rules
	schemaDescriptionRequired,
	schemaExampleKeys,
	schemaExampleRequired,
	schemaRequiredArray,

	// Types rules
	booleanDefault,
	numericFormat,

	// Root rules
	rootSailpointApi,
	rootTags,
};
