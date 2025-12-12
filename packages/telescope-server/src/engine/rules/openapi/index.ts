/**
 * OpenAPI Best Practice Rules
 *
 * These rules apply to ALL OpenAPI specifications and represent
 * widely-accepted best practices for API documentation quality.
 *
 * Directory structure is organized by goal:
 * - references/ - $ref validation (structural)
 * - naming/ - Naming conventions
 * - documentation/ - Documentation quality
 * - structure/ - Schema structure validation
 * - types/ - Type validation
 * - security/ - Security best practices
 * - servers/ - Server configuration
 * - paths/ - Path validation
 * - document/ - Document-level validation
 */

import type { Rule } from "../types.js";
// Document rules
import documentAscii from "./document/ascii.js";
// Documentation rules
import operationDeprecatedDescription from "./documentation/deprecated-description.js";
import schemaEnumDescription from "./documentation/enum-description.js";
// Naming rules
import componentExampleNameCapital from "./naming/example-name-capital.js";
import operationIdUnique from "./naming/operationid-unique.js";
import componentSchemaNameCapital from "./naming/schema-name-capital.js";
import operationTagsFormat from "./naming/tags-format.js";
import pathCasingConsistency from "./paths/casing-consistency.js";
// Paths rules
import operationIdUniqueInPath from "./paths/id-unique-in-path.js";
import pathKebabCase from "./paths/kebab-case.js";
import pathNoHttpVerbs from "./paths/no-http-verbs.js";
import pathNoTrailingSlash from "./paths/no-trailing-slash.js";
import pathParamsMatch from "./paths/params-match.js";
// References rules
import unresolvedRef from "./references/unresolved-ref.js";
// Security rules
import noApiKeyInQuery from "./security/no-api-key-in-query.js";
import oauthFlowUrls from "./security/oauth-flow-urls.js";
import securityGlobalOrOperation from "./security/security-global-or-operation.js";
import securitySchemesDefined from "./security/security-schemes-defined.js";
import serverUrlHttps from "./servers/server-url-https.js";
// Servers rules
import serversDefined from "./servers/servers-defined.js";
// Structure rules
import schemaAdditionalProperties from "./structure/additional-properties.js";
import schemaAllofMixedTypes from "./structure/allof-mixed-types.js";
import schemaAllofStructure from "./structure/allof-structure.js";
import schemaArrayItems from "./structure/array-items.js";
import schemaDiscriminatorMapping from "./structure/discriminator-mapping.js";
import operationRequestBodyContent from "./structure/request-body-content.js";
import schemaTypeRequired from "./structure/type-required.js";
// Types rules
import schemaNoUnknownFormats from "./types/no-unknown-formats.js";

/**
 * All OpenAPI best practice rules as an array
 */
export const openapiRules: Rule[] = [
	// References rules (structural - errors)
	unresolvedRef,

	// Naming rules (suggestions)
	componentExampleNameCapital,
	componentSchemaNameCapital,
	operationIdUnique,
	operationTagsFormat,

	// Documentation rules (suggestions)
	operationDeprecatedDescription,
	schemaEnumDescription,

	// Structure rules (suggestions)
	schemaAdditionalProperties,
	schemaAllofMixedTypes,
	schemaAllofStructure,
	schemaArrayItems,
	schemaDiscriminatorMapping,
	operationRequestBodyContent,
	schemaTypeRequired,

	// Types rules (hints/info)
	schemaNoUnknownFormats,

	// Security rules
	noApiKeyInQuery,
	oauthFlowUrls,
	securityGlobalOrOperation,
	securitySchemesDefined,

	// Servers rules (suggestions)
	serversDefined,
	serverUrlHttps,

	// Paths rules
	operationIdUniqueInPath,
	pathCasingConsistency,
	pathKebabCase,
	pathNoHttpVerbs,
	pathNoTrailingSlash,
	pathParamsMatch,

	// Document rules
	documentAscii,
];

/**
 * Map of OpenAPI rule IDs to rules for quick lookup
 */
export const openapiRulesMap = new Map<string, Rule>(
	openapiRules.map((rule) => [rule.meta.id, rule]),
);

// Named exports for individual rules
export {
	// References rules
	unresolvedRef,
	// Naming rules
	componentExampleNameCapital,
	componentSchemaNameCapital,
	operationIdUnique,
	operationTagsFormat,
	// Documentation rules
	operationDeprecatedDescription,
	schemaEnumDescription,
	// Structure rules
	schemaAdditionalProperties,
	schemaAllofMixedTypes,
	schemaAllofStructure,
	schemaArrayItems,
	schemaDiscriminatorMapping,
	operationRequestBodyContent,
	schemaTypeRequired,
	// Types rules
	schemaNoUnknownFormats,
	// Security rules
	noApiKeyInQuery,
	oauthFlowUrls,
	securityGlobalOrOperation,
	securitySchemesDefined,
	// Servers rules
	serversDefined,
	serverUrlHttps,
	// Paths rules
	operationIdUniqueInPath,
	pathCasingConsistency,
	pathKebabCase,
	pathNoHttpVerbs,
	pathNoTrailingSlash,
	pathParamsMatch,
	// Document rules
	documentAscii,
};
