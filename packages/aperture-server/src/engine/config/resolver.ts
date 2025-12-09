/**
 * Configuration Resolver Module
 *
 * This module handles loading, parsing, and resolving Telescope configuration.
 * It reads the `.telescope/config.yaml` file and materializes the configured
 * rules and extensions.
 *
 * Configuration sources:
 * - `.telescope/config.yaml` - Project-level configuration
 * - Default configuration - Used when no config file exists
 *
 * @module config/resolver
 *
 * @see {@link TelescopeConfig} - The configuration schema
 * @see {@link Rule} - Rule interface for custom rules
 *
 * @example
 * ```typescript
 * import { resolveConfig, materializeRules, materializeExtensions } from "aperture-server";
 *
 * // Load configuration
 * const config = resolveConfig("/path/to/workspace");
 *
 * // Materialize rules from config
 * const rules = await materializeRules(config, "/path/to/workspace");
 *
 * // Materialize extensions from config
 * const { registry, required } = await materializeExtensions(config, "/path/to/workspace");
 * ```
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Value } from "typebox/value";
import YAML from "yaml";
import {
	builtinRulesMap,
	openapiRules,
	sailpointRules,
} from "../rules/index.js";
import type { Rule } from "../rules/types.js";
import {
	type TelescopeConfig,
	TelescopeConfigSchema,
} from "../schemas/config-schema.js";
import { builtinExtensions } from "../schemas/extensions/builtin/index.js";
import {
	buildExtensionRegistry,
	type ExtensionRegistry,
} from "../schemas/extensions/index.js";
import type { ExtensionSchemaMeta } from "../schemas/extensions/types.js";
import { importTypeScript } from "../utils/ts-loader.js";

/**
 * Rule severity levels.
 *
 * - `off` - Rule is disabled
 * - `error` - Critical issues that must be fixed
 * - `warn` - Best practice violations that should be addressed
 * - `info` - Informational suggestions for improvement
 * - `hint` - Minor style suggestions
 */
export type Severity = "off" | "error" | "warn" | "info" | "hint";

/**
 * Configuration for a single rule.
 */
export interface RuleSetting {
	/** Severity level for the rule */
	severity: Severity;
	/** Optional rule-specific options */
	options?: unknown;
}

/**
 * Default configuration used when no config file is found.
 *
 * Includes default file patterns for OpenAPI document discovery.
 */
export const defaultConfig: TelescopeConfig = {
	openapi: {
		patterns: ["**/*.yaml", "**/*.yml", "**/*.json", "**/*.jsonc"],
	},
};

/**
 * Resolve Telescope configuration from a workspace.
 *
 * Looks for `.telescope/config.yaml` in the workspace root. If found,
 * parses and validates it against the configuration schema. If not found
 * or parsing fails, returns the default configuration.
 *
 * @param workspaceRoot - Path to the workspace root directory
 * @returns Resolved configuration (from file or defaults)
 *
 * @example
 * ```typescript
 * // Load from workspace
 * const config = resolveConfig("/path/to/project");
 *
 * // Access configuration
 * console.log(config.openapi?.patterns);
 * console.log(config.openapi?.sailpoint);
 * console.log(config.openapi?.rulesOverrides);
 *
 * // Without workspace root, returns defaults
 * const defaultCfg = resolveConfig();
 * ```
 */
export function resolveConfig(workspaceRoot?: string): TelescopeConfig {
	if (!workspaceRoot) {
		return defaultConfig;
	}

	// Check for config file
	const configFiles = [join(workspaceRoot, ".telescope", "config.yaml")];

	let configPath: string | null = null;
	for (const candidate of configFiles) {
		if (existsSync(candidate)) {
			configPath = candidate;
			break;
		}
	}

	if (!configPath) {
		return defaultConfig;
	}

	try {
		const configContent = readFileSync(configPath, "utf-8");
		const parsed = YAML.parse(configContent);
		// Use TypeBox Value.Decode for validation (throws on error)
		const validated = Value.Decode(
			TelescopeConfigSchema,
			parsed,
		) as TelescopeConfig;

		// Ensure openapi section exists with defaults if missing
		if (!validated.openapi) {
			return {
				...validated,
				openapi: defaultConfig.openapi,
			};
		}

		// Ensure defaults for patterns if missing. Historically presets were resolved here,
		// but the current configuration simply falls back to the default pattern list.
		const mergedOpenApi: TelescopeConfig["openapi"] = {
			...validated.openapi,
			patterns: validated.openapi.patterns ?? defaultConfig.openapi?.patterns,
		};

		return {
			...validated,
			openapi: mergedOpenApi,
		};
	} catch (error) {
		console.error(`Error parsing config file ${configPath}:`, error);
		// If parsing fails, return defaults
		return defaultConfig;
	}
}

/**
 * A rule resolved from configuration with its severity.
 */
export interface ResolvedRule {
	/** Rule identifier */
	id: string;
	/** The rule implementation */
	rule: Rule;
	/** Configured severity level */
	severity: Severity;
	/** Optional rule-specific options */
	options?: unknown;
}

/**
 * Error categories for rule loading failures.
 */
export type RuleLoadErrorCode =
	| "file_not_found"
	| "import_failed"
	| "invalid_structure"
	| "missing_meta_or_check"
	| "invalid_rule_type"
	| "unknown_error";

/**
 * Structured error returned when a rule fails to load.
 * Provides detailed information for debugging and user feedback.
 */
export interface RuleLoadError {
	/** Error category for programmatic handling */
	code: RuleLoadErrorCode;
	/** Human-readable error message */
	message: string;
	/** Path that was attempted to load */
	path: string;
	/** Resolved absolute path (if resolution succeeded) */
	resolvedPath?: string;
	/** Original error (if caused by an exception) */
	cause?: Error;
}

/**
 * Result of attempting to load a custom rule.
 * Either contains the loaded rule or an error describing what went wrong.
 */
export type RuleLoadResult =
	| { success: true; rule: Rule }
	| { success: false; error: RuleLoadError };

/**
 * Load a custom OpenAPI rule from a file path.
 *
 * Supports loading TypeScript/JavaScript rule files from:
 * - `.telescope/rules/` directory (default location)
 * - Workspace root
 * - Absolute paths
 *
 * The rule file should export a rule created with `defineRule`.
 *
 * @param path - Path to the rule file
 * @param workspaceRoot - Workspace root for resolving relative paths
 * @returns The loaded rule, or null if loading fails
 *
 * @deprecated Use {@link loadOpenAPIRuleWithResult} for structured error handling
 *
 * @example
 * ```typescript
 * // Load from .telescope/rules/
 * const rule = await loadOpenAPIRule("my-rule.ts", "/project");
 *
 * // Load from absolute path
 * const rule = await loadOpenAPIRule("/path/to/rule.ts");
 *
 * // Load from .telescope/ subdirectory
 * const rule = await loadOpenAPIRule(".telescope/rules/my-rule.ts", "/project");
 * ```
 */
export async function loadOpenAPIRule(
	path: string,
	workspaceRoot?: string,
): Promise<Rule | null> {
	const result = await loadOpenAPIRuleWithResult(path, workspaceRoot);
	return result.success ? result.rule : null;
}

/**
 * Load a custom OpenAPI rule from a file path with structured error reporting.
 *
 * Supports loading TypeScript/JavaScript rule files from:
 * - `.telescope/rules/` directory (default location)
 * - Workspace root
 * - Absolute paths
 *
 * The rule file should export a rule created with `defineRule`.
 *
 * @param path - Path to the rule file
 * @param workspaceRoot - Workspace root for resolving relative paths
 * @returns Result object containing either the loaded rule or a structured error
 *
 * @example
 * ```typescript
 * const result = await loadOpenAPIRuleWithResult("my-rule.ts", "/project");
 * if (result.success) {
 *   console.log("Loaded rule:", result.rule.meta.id);
 * } else {
 *   console.error(`Failed to load rule: ${result.error.message}`);
 *   console.error(`Error code: ${result.error.code}`);
 * }
 * ```
 */
export async function loadOpenAPIRuleWithResult(
	path: string,
	workspaceRoot?: string,
): Promise<RuleLoadResult> {
	let resolvedPath: string | undefined;

	try {
		// Resolve path relative to workspace root or .telescope folder
		if (workspaceRoot) {
			// If path starts with .telescope/, resolve relative to workspace root
			// Otherwise, try .telescope/rules/ first, then workspace root
			if (path.startsWith(".telescope/")) {
				resolvedPath = resolve(workspaceRoot, path);
			} else if (!path.startsWith("/") && !/^[a-zA-Z]:/.test(path)) {
				// Relative path - try .telescope/rules/ first, then workspace root
				const telescopePath = resolve(
					workspaceRoot,
					".telescope",
					"rules",
					path,
				);
				if (existsSync(telescopePath)) {
					resolvedPath = telescopePath;
				} else {
					// If not in .telescope/rules, try workspace root directly
					resolvedPath = resolve(workspaceRoot, path);
				}
			} else {
				// Absolute path
				resolvedPath = path;
			}
		} else {
			resolvedPath = resolve(path);
		}

		if (!existsSync(resolvedPath)) {
			return {
				success: false,
				error: {
					code: "file_not_found",
					message: `Custom OpenAPI rule file not found: ${resolvedPath}`,
					path,
					resolvedPath,
				},
			};
		}

		// Use esbuild to transform TypeScript files at runtime
		// For JavaScript files, use native import with file:// URL
		// biome-ignore lint/suspicious/noExplicitAny: dynamic import type is unknown
		let module: any;
		try {
			if (resolvedPath.endsWith(".ts")) {
				module = await importTypeScript(resolvedPath);
			} else {
				const fileUrl = pathToFileURL(resolvedPath).toString();
				module = await import(fileUrl);
			}
		} catch (importError) {
			const cause = importError instanceof Error ? importError : undefined;
			return {
				success: false,
				error: {
					code: "import_failed",
					message: `Failed to import rule from ${resolvedPath}: ${cause?.message ?? String(importError)}`,
					path,
					resolvedPath,
					cause,
				},
			};
		}

		// Support both default export and named export
		const rule = module.default || module.rule || module;

		// Validate rule structure
		if (!rule || typeof rule !== "object") {
			return {
				success: false,
				error: {
					code: "invalid_structure",
					message: `Rule file ${resolvedPath} does not export a valid rule object. Expected an object with 'meta' and 'check' properties.`,
					path,
					resolvedPath,
				},
			};
		}

		// Cast to Rule to check properties safely
		const candidateRule = rule as Partial<Rule>;

		if (!candidateRule.meta || !candidateRule.check) {
			const missing = [];
			if (!candidateRule.meta) missing.push("meta");
			if (!candidateRule.check) missing.push("check");
			return {
				success: false,
				error: {
					code: "missing_meta_or_check",
					message: `Rule in ${resolvedPath} is missing required properties: ${missing.join(", ")}. Rules must be created using defineRule().`,
					path,
					resolvedPath,
				},
			};
		}

		// Validate it's an OpenAPI rule (ruleType should be set by defineRule)
		if (
			!candidateRule.meta.ruleType ||
			candidateRule.meta.ruleType !== "openapi"
		) {
			return {
				success: false,
				error: {
					code: "invalid_rule_type",
					message: `Rule in ${resolvedPath} has invalid ruleType "${candidateRule.meta.ruleType ?? "undefined"}". Expected "openapi". Rules should be created using defineRule() from the aperture-server package.`,
					path,
					resolvedPath,
				},
			};
		}

		return { success: true, rule: rule as Rule };
	} catch (error) {
		const cause = error instanceof Error ? error : undefined;
		return {
			success: false,
			error: {
				code: "unknown_error",
				message: `Unexpected error loading rule from ${path}: ${cause?.message ?? String(error)}`,
				path,
				resolvedPath,
				cause,
			},
		};
	}
}

/**
 * Options for rule materialization.
 */
export interface MaterializeRulesOptions {
	/** Callback to handle rule load errors. If provided, errors are reported here instead of being silently ignored. */
	onRuleLoadError?: (error: RuleLoadError) => void;
}

/**
 * Result of materializing rules from configuration.
 */
export interface MaterializeRulesResult {
	/** Successfully resolved rules */
	rules: ResolvedRule[];
	/** Errors encountered while loading custom rules */
	errors: RuleLoadError[];
}

/**
 * Materialize rules from configuration into runnable Rule instances.
 *
 * This function:
 * 1. Starts with built-in OpenAPI rules
 * 2. Adds SailPoint-specific rules if enabled
 * 3. Applies rule overrides from config (disable or change severity)
 * 4. Loads custom rules from configured paths
 *
 * @param config - Telescope configuration
 * @param workspaceRoot - Workspace root for loading custom rules
 * @returns Array of resolved rules ready for execution
 *
 * @example
 * ```typescript
 * const config = resolveConfig("/path/to/workspace");
 * const rules = await materializeRules(config, "/path/to/workspace");
 *
 * // Filter to only active rules
 * const activeRules = rules.filter(r => r.severity !== "off");
 *
 * // Run the engine with resolved rules
 * const result = runEngine(projectContext, files, {
 *   rules: activeRules.map(r => r.rule)
 * });
 * ```
 */
export async function materializeRules(
	config: TelescopeConfig,
	workspaceRoot?: string,
): Promise<ResolvedRule[]> {
	const result = await materializeRulesWithErrors(config, workspaceRoot);
	return result.rules;
}

/**
 * Materialize rules from configuration with full error reporting.
 *
 * This function:
 * 1. Starts with built-in OpenAPI rules
 * 2. Adds SailPoint-specific rules if enabled
 * 3. Applies rule overrides from config (disable or change severity)
 * 4. Loads custom rules from configured paths
 * 5. Collects and returns any errors encountered during custom rule loading
 *
 * @param config - Telescope configuration
 * @param workspaceRoot - Workspace root for loading custom rules
 * @param options - Options including error callback
 * @returns Object containing resolved rules and any errors encountered
 *
 * @example
 * ```typescript
 * const config = resolveConfig("/path/to/workspace");
 * const { rules, errors } = await materializeRulesWithErrors(config, "/path/to/workspace");
 *
 * // Report errors to the user
 * for (const error of errors) {
 *   console.error(`Failed to load rule from ${error.path}: ${error.message}`);
 * }
 *
 * // Filter to only active rules
 * const activeRules = rules.filter(r => r.severity !== "off");
 * ```
 */
export async function materializeRulesWithErrors(
	config: TelescopeConfig,
	workspaceRoot?: string,
	options?: MaterializeRulesOptions,
): Promise<MaterializeRulesResult> {
	const selected = new Map<string, ResolvedRule>();
	const errors: RuleLoadError[] = [];

	/**
	 * Convert rule's defaultSeverity (from RuleMeta) to resolver Severity.
	 * Maps "warning" -> "warn" for config compatibility.
	 */
	const getDefaultSeverity = (rule: Rule): Severity => {
		const defaultSev = rule.meta.defaultSeverity;
		if (!defaultSev) return "error"; // Default to error if not specified
		if (defaultSev === "warning") return "warn";
		return defaultSev as Severity;
	};

	const applyRuleEntry = (ruleId: string, severity: Severity) => {
		const rule = builtinRulesMap.get(ruleId);
		if (!rule) return;
		selected.set(ruleId, {
			id: ruleId,
			rule,
			severity: severity,
		});
	};

	// Start with general OpenAPI rules (always included)
	for (const rule of openapiRules) {
		selected.set(rule.meta.id, {
			id: rule.meta.id,
			rule,
			severity: getDefaultSeverity(rule),
		});
	}

	// Add SailPoint-specific rules if enabled
	if (config.openapi?.sailpoint) {
		for (const rule of sailpointRules) {
			selected.set(rule.meta.id, {
				id: rule.meta.id,
				rule,
				severity: getDefaultSeverity(rule),
			});
		}
	}

	// Apply rule overrides from config
	if (config.openapi?.rulesOverrides) {
		for (const [ruleId, entry] of Object.entries(
			config.openapi.rulesOverrides,
		)) {
			if (entry === "off") {
				// Remove rules that are turned off
				selected.delete(ruleId);
			} else {
				applyRuleEntry(ruleId, entry);
			}
		}
	}

	// Load custom OpenAPI rules
	if (config.openapi?.rules && workspaceRoot) {
		for (const ruleConfig of config.openapi.rules) {
			const result = await loadOpenAPIRuleWithResult(
				ruleConfig.rule,
				workspaceRoot,
			);
			if (result.success) {
				// Use rule ID from meta, or generate one from path
				const ruleId = result.rule.meta.id || `custom-${ruleConfig.rule}`;
				selected.set(ruleId, {
					id: ruleId,
					rule: result.rule,
					severity: getDefaultSeverity(result.rule),
				});
			} else {
				errors.push(result.error);
				if (options?.onRuleLoadError) {
					options.onRuleLoadError(result.error);
				}
			}
		}
	}

	return { rules: [...selected.values()], errors };
}

/**
 * Load a custom extension schema from a file path.
 *
 * Supports loading TypeScript/JavaScript extension files from:
 * - `.telescope/extensions/` directory (default location)
 * - Workspace root
 * - Absolute paths
 *
 * The extension file should export an ExtensionSchemaMeta object.
 *
 * @param path - Path to the extension file
 * @param workspaceRoot - Workspace root for resolving relative paths
 * @returns The extension metadata, or null if loading fails
 *
 * @example
 * ```typescript
 * // Load from .telescope/extensions/
 * const ext = await loadCustomExtension("x-custom.ts", "/project");
 *
 * // Extension should export:
 * // export default defineExtension({
 * //   name: "x-custom",
 * //   scope: "operation",
 * //   description: "Custom extension",
 * //   schema: z.object({ ... })
 * // });
 * ```
 */
export async function loadCustomExtension(
	path: string,
	workspaceRoot?: string,
): Promise<ExtensionSchemaMeta | null> {
	try {
		// Resolve path relative to workspace root or .telescope folder
		let resolvedPath: string;
		if (workspaceRoot) {
			// If path starts with .telescope/, resolve relative to workspace root
			// Otherwise, try .telescope/extensions/ first, then workspace root
			if (path.startsWith(".telescope/")) {
				resolvedPath = resolve(workspaceRoot, path);
			} else if (!path.startsWith("/") && !/^[a-zA-Z]:/.test(path)) {
				// Relative path - try .telescope/extensions/ first, then workspace root
				const telescopePath = resolve(
					workspaceRoot,
					".telescope",
					"extensions",
					path,
				);
				if (existsSync(telescopePath)) {
					resolvedPath = telescopePath;
				} else {
					// If not in .telescope/extensions, try workspace root directly
					resolvedPath = resolve(workspaceRoot, path);
				}
			} else {
				// Absolute path
				resolvedPath = path;
			}
		} else {
			resolvedPath = resolve(path);
		}

		if (!existsSync(resolvedPath)) {
			console.warn(`Custom extension not found: ${resolvedPath}`);
			return null;
		}

		// Use esbuild to transform TypeScript files at runtime
		// For JavaScript files, use native import with file:// URL
		// biome-ignore lint/suspicious/noExplicitAny: dynamic import type is unknown
		let module: any;
		try {
			if (resolvedPath.endsWith(".ts")) {
				module = await importTypeScript(resolvedPath);
			} else {
				const fileUrl = pathToFileURL(resolvedPath).toString();
				module = await import(fileUrl);
			}
		} catch (error) {
			if (
				error instanceof Error &&
				(error.message.includes("Cannot find package") ||
					error.message.includes("Cannot resolve"))
			) {
				throw error;
			}
			throw error;
		}

		// Support both default export and named export
		const extension = module.default || module.extension || module;

		// Validate extension structure
		if (!extension || typeof extension !== "object") {
			console.warn(`Invalid extension structure in ${resolvedPath}`);
			return null;
		}

		// Check required fields
		const candidate = extension as Partial<ExtensionSchemaMeta>;
		if (
			!candidate.name ||
			!candidate.scope ||
			!candidate.description ||
			!candidate.schema
		) {
			console.warn(
				`Extension in ${resolvedPath} is missing required fields (name, scope, description, schema)`,
			);
			return null;
		}

		// Validate extension name starts with "x-"
		if (!candidate.name.startsWith("x-")) {
			console.warn(`Extension name "${candidate.name}" must start with "x-"`);
			return null;
		}

		return extension as ExtensionSchemaMeta;
	} catch (error) {
		console.error(`Error loading custom extension from ${path}:`, error);
		return null;
	}
}

/**
 * Result of materializing extensions from config.
 */
export interface MaterializedExtensions {
	/** Registry of all compiled extensions (builtin + custom) */
	registry: ExtensionRegistry;
	/** List of extension names that are required */
	required: string[];
}

/**
 * Materialize all extensions (builtin + custom) from configuration.
 *
 * This function:
 * 1. Starts with all built-in extensions
 * 2. Loads custom extensions from configured paths
 * 3. Builds the extension registry
 * 4. Returns the registry and list of required extensions
 *
 * @param config - Telescope configuration
 * @param workspaceRoot - Workspace root for loading custom extensions
 * @returns Extension registry and required extension names
 *
 * @example
 * ```typescript
 * const config = resolveConfig("/path/to/workspace");
 * const { registry, required } = await materializeExtensions(config, "/path/to/workspace");
 *
 * // Check if an extension is required
 * if (required.includes("x-custom")) {
 *   // Extension is required
 * }
 *
 * // Get extension schemas for a scope
 * const operationExtensions = registry.getSchemasByScope("operation");
 * ```
 */
export async function materializeExtensions(
	config: TelescopeConfig,
	workspaceRoot?: string,
): Promise<MaterializedExtensions> {
	// Start with all builtin extensions
	const allExtensions: ExtensionSchemaMeta[] = [...builtinExtensions];

	// Load custom extensions from config (now under extensions.schemas)
	if (config.openapi?.extensions?.schemas && workspaceRoot) {
		for (const extensionPath of config.openapi.extensions.schemas) {
			const customExtension = await loadCustomExtension(
				extensionPath,
				workspaceRoot,
			);
			if (customExtension) {
				allExtensions.push(customExtension);
			}
		}
	}

	// Build the registry
	const registry = buildExtensionRegistry(allExtensions);

	// Get the required extensions list from config
	const required = config.openapi?.extensions?.required ?? [];

	return { registry, required };
}
