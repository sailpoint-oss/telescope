/**
 * Security Rules
 *
 * Rules for validating API security configurations including
 * security schemes, OAuth flows, and security requirements.
 */

import type { Rule } from "../../types.js";

import securitySchemesDefined from "./security-schemes-defined.js";
import oauthFlowUrls from "./oauth-flow-urls.js";
import noApiKeyInQuery from "./no-api-key-in-query.js";
import securityGlobalOrOperation from "./security-global-or-operation.js";

/**
 * All security rules as an array
 */
export const securityRules: Rule[] = [
	securitySchemesDefined,
	oauthFlowUrls,
	noApiKeyInQuery,
	securityGlobalOrOperation,
];

/**
 * Map of security rule IDs to rules for quick lookup
 */
export const securityRulesMap = new Map<string, Rule>(
	securityRules.map((rule) => [rule.meta.id, rule]),
);

// Named exports for individual rules
export {
	securitySchemesDefined,
	oauthFlowUrls,
	noApiKeyInQuery,
	securityGlobalOrOperation,
};

