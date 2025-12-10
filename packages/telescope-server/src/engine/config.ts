import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { builtinRules, builtinRulesMap } from "./rules/index.js";
import type { Rule } from "./rules/types.js";
import {
	type TelescopeConfig,
	TelescopeConfigSchema,
} from "./schemas/config-schema.js";

export type Severity = "off" | "warn" | "error" | "info" | "hint";

export interface RuleSetting {
	severity: Severity;
	options?: unknown;
}

export const defaultConfig: TelescopeConfig = {
	openapi: {
		patterns: ["**/*.yaml", "**/*.yml", "**/*.json", "**/*.jsonc"],
	},
};

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
		// Use Zod parse for validation (throws on error)
		const validated = TelescopeConfigSchema.parse(parsed) as TelescopeConfig;

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

export interface ResolvedRule {
	id: string;
	rule: Rule;
	severity: Severity;
	options?: unknown;
}

/**
 * Load a custom OpenAPI rule from a file path.
 */
export async function loadCustomOpenAPIRule(
	path: string,
	workspaceRoot?: string,
): Promise<Rule | null> {
	try {
		// Resolve path relative to workspace root or .telescope folder
		let resolvedPath: string;
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
			// Warning: Custom OpenAPI rule not found
			// Note: In LSP context, warnings should be logged via DiagnosticsLogger
			return null;
		}

		// Use file:// URL for dynamic import
		// For Bun, module resolution happens relative to the imported file's location
		// The test directory should have package.json files with workspace dependencies
		const fileUrl = pathToFileURL(resolvedPath).toString();
		// biome-ignore lint/suspicious/noExplicitAny: dynamic import type is unknown
		let module: any;
		try {
			module = await import(fileUrl);
		} catch (error) {
			// If import fails due to module resolution, provide helpful error message
			if (
				error instanceof Error &&
				(error.message.includes("Cannot find package") ||
					error.message.includes("Cannot resolve"))
			) {
				// Check if this is a test environment issue
				// Note: In LSP context, errors should be logged via DiagnosticsLogger
				throw error;
			}
			throw error;
		}

		// Support both default export and named export
		const rule = module.default || module.rule || module;

		// Validate rule structure
		if (!rule || typeof rule !== "object") {
			// Note: In LSP context, warnings should be logged via DiagnosticsLogger
			return null;
		}

		// Cast to Rule to check properties safely
		const candidateRule = rule as Partial<Rule>;

		if (!candidateRule.meta || !candidateRule.check) {
			// Note: In LSP context, warnings should be logged via DiagnosticsLogger
			return null;
		}

		// Validate it's an OpenAPI rule (ruleType should be set by defineRule)
		if (
			!candidateRule.meta.ruleType ||
			candidateRule.meta.ruleType !== "openapi"
		) {
			// Note: In LSP context, warnings should be logged via DiagnosticsLogger
			return null;
		}

		return rule as Rule;
	} catch (_error) {
		// Note: In LSP context, warnings should be logged via DiagnosticsLogger
		return null;
	}
}

export async function materializeRules(
	config: TelescopeConfig,
	workspaceRoot?: string,
): Promise<ResolvedRule[]> {
	const selected = new Map<string, ResolvedRule>();

	const applyRuleEntry = (ruleId: string, severity: Severity) => {
		const rule = builtinRulesMap.get(ruleId);
		if (!rule) return;
		selected.set(ruleId, {
			id: ruleId,
			rule,
			severity: severity,
		});
	};

	// Start with all builtin rules at default severity
	for (const rule of builtinRules) {
		selected.set(rule.meta.id, {
			id: rule.meta.id,
			rule,
			severity: "error",
		});
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
			const customRule = await loadCustomOpenAPIRule(
				ruleConfig.rule,
				workspaceRoot,
			);
			if (customRule) {
				// Use rule ID from meta, or generate one from path
				const ruleId = customRule.meta.id || `custom-${ruleConfig.rule}`;
				selected.set(ruleId, {
					id: ruleId,
					rule: customRule,
					severity: "error", // Default severity for custom rules
				});
			}
		}
	}

	return [...selected.values()];
}
