/**
 * Built-in Rules Index
 *
 * This module is the central registry for all built-in validation rules.
 * Rules are organized into two categories:
 *
 * ## OpenAPI Rules (`openapiRules`)
 *
 * Best practices for ALL OpenAPI specifications. These rules suggest
 * improvements and catch common mistakes that apply regardless of your
 * specific API conventions. Severities are warning/info/hint.
 *
 * Categories:
 * - **References**: $ref validation (unresolved refs) - errors
 * - **Naming**: Naming conventions for components, operations, tags
 * - **Documentation**: Documentation quality checks
 * - **Structure**: Schema structure validation
 * - **Types**: Type validation
 * - **Security**: Security best practices
 * - **Servers**: Server configuration
 * - **Paths**: Path validation
 * - **Document**: Document-level checks (ASCII)
 *
 * ## SailPoint Rules (`sailpointRules`)
 *
 * SailPoint business requirements. These rules enforce fields that OpenAPI
 * says are optional but SailPoint mandates. Severities are typically errors.
 *
 * Enable these by setting `sailpoint: true` in your `.telescope/config.yaml`.
 *
 * @module rules
 *
 * @see {@link defineRule} - Function for creating custom rules
 * @see {@link Rule} - Rule interface
 */

// Import rule collections
import { openapiRules, openapiRulesMap } from "./openapi/index.js";
import { sailpointRules, sailpointRulesMap } from "./sailpoint/index.js";
import type { Rule } from "./types.js";

// Export categorized rule collections
export { openapiRules, openapiRulesMap } from "./openapi/index.js";
export { sailpointRules, sailpointRulesMap } from "./sailpoint/index.js";

/**
 * Combined array of all built-in rules (OpenAPI + SailPoint)
 */
export const builtinRules: Rule[] = [...openapiRules, ...sailpointRules];

/**
 * Combined map of all built-in rules for quick lookup by ID
 */
export const builtinRulesMap = new Map<string, Rule>([
	...openapiRulesMap,
	...sailpointRulesMap,
]);

// ============================================================================
// Rule Filtering Utilities
// ============================================================================

/**
 * Filter rules to only single-file rules.
 * Single-file rules can be run in per-document diagnostics for fast feedback.
 *
 * @param rules - Array of rules to filter
 * @returns Rules that only need one file to validate
 */
export function getSingleFileRules(rules: Rule[]): Rule[] {
	return rules.filter((rule) => rule.meta.scope !== "cross-file");
}

/**
 * Filter rules to only cross-file rules.
 * Cross-file rules need project context and should run in workspace diagnostics.
 *
 * @param rules - Array of rules to filter
 * @returns Rules that need multiple files/project context
 */
export function getCrossFileRules(rules: Rule[]): Rule[] {
	return rules.filter((rule) => rule.meta.scope === "cross-file");
}

/**
 * Categorize rules by scope for efficient diagnostic scheduling.
 *
 * @param rules - Array of rules to categorize
 * @returns Object with singleFile and crossFile rule arrays
 */
export function categorizeRulesByScope(rules: Rule[]): {
	singleFile: Rule[];
	crossFile: Rule[];
} {
	const singleFile: Rule[] = [];
	const crossFile: Rule[] = [];

	for (const rule of rules) {
		if (rule.meta.scope === "cross-file") {
			crossFile.push(rule);
		} else {
			singleFile.push(rule);
		}
	}

	return { singleFile, crossFile };
}

// Named exports for OpenAPI rules
export {
	// Naming rules
	componentExampleNameCapital,
	componentSchemaNameCapital,
	// Document rules
	documentAscii,
	// Security rules
	noApiKeyInQuery,
	oauthFlowUrls,
	// Documentation rules
	operationDeprecatedDescription,
	operationIdUnique,
	// Paths rules
	operationIdUniqueInPath,
	operationRequestBodyContent,
	operationTagsFormat,
	pathCasingConsistency,
	pathKebabCase,
	pathNoHttpVerbs,
	pathNoTrailingSlash,
	pathParamsMatch,
	// Structure rules
	schemaAdditionalProperties,
	schemaAllofMixedTypes,
	schemaAllofStructure,
	schemaArrayItems,
	schemaDiscriminatorMapping,
	schemaEnumDescription,
	// Types rules
	schemaNoUnknownFormats,
	schemaTypeRequired,
	securityGlobalOrOperation,
	securitySchemesDefined,
	// Servers rules
	serversDefined,
	serverUrlHttps,
	// References rules
	unresolvedRef,
} from "./openapi/index.js";

// Named exports for SailPoint rules
export {
	// Types rules
	booleanDefault,
	numericFormat,
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
	parameterExampleKeys,
	parameterExampleRequired,
	parameterFilters,
	parameterRequiredExplicit,
	parameterSorters,
	// Root rules
	rootSailpointApi,
	rootTags,
	// Schema rules
	schemaDescriptionRequired,
	schemaExampleKeys,
	schemaExampleRequired,
	schemaRequiredArray,
} from "./sailpoint/index.js";
