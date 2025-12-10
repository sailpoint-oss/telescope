/**
 * Configuration management for Telescope.
 *
 * This module handles:
 * - Loading and parsing .telescope/config.yaml
 * - Rule materialization (builtin + custom)
 * - Configuration schema validation
 */

// Schema exports
export {
	type AdditionalValidationGroup,
	AdditionalValidationGroupSchema,
	type OpenAPIRuleConfig,
	OpenAPIRuleConfigSchema,
	type Severity,
	SeveritySchema,
	type TelescopeConfig,
	TelescopeConfigSchema,
} from "../schemas/config-schema.js";

// Resolver exports
export {
	defaultConfig,
	loadCustomExtension,
	loadOpenAPIRule as loadCustomOpenAPIRule,
	type MaterializedExtensions,
	materializeExtensions,
	materializeRules,
	type ResolvedRule,
	type RuleSetting,
	resolveConfig,
} from "./resolver.js";
