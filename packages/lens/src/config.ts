import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import { type RuleConfigEntry, ruleRegistry } from "./registry.js";
import type { Rule } from "./rules/types.js";

export type Severity = "off" | "warn" | "error";

export interface RuleSetting {
	severity: Severity;
	options?: unknown;
}

// RuleConfigEntry is now exported from registry.ts
export type { RuleConfigEntry } from "./registry.js";

// New structured config format
export interface OpenAPIConfig {
	base?: string[];
	patterns?: string[];
	rules?: Array<{
		rule: string;
		pattern?: string;
	}>;
	rulesOverrides?: Record<string, RuleConfigEntry>;
	overrides?: Array<{
		files: string[];
		rules: Record<string, RuleConfigEntry>;
	}>;
	// Additional custom rules directly in config
	customRules?: Array<{
		rule: string;
		pattern?: string;
	}>;
}

export interface AdditionalValidationGroup {
	patterns?: string[];
	schemas?: Array<{
		schema: string;
		pattern?: string;
	}>;
	rules?: Array<{
		rule: string;
		pattern?: string;
	}>;
}

// If this configuration file exists at all, it should have an openapi section.
// And it should specify the base at least, all other fields are optional.
export interface LintConfig {
	openapi?: OpenAPIConfig; // Optional in type definition but effectively required for OpenAPI linting
	// AdditionalValidation config
	additionalValidation?: {
		groups: Record<string, AdditionalValidationGroup>;
	};
}

export const defaultConfig: LintConfig = {
	openapi: {
		base: ["@telescope-openapi/default"], // ID of defaultPreset
		patterns: ["**/*.yaml", "**/*.yml", "**/*.json"],
	},
};

export function resolveConfig(workspaceRoot?: string): LintConfig {
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
		const parsed = YAML.parse(configContent) as LintConfig;

		// Ensure openapi section exists with defaults if missing
		if (!parsed.openapi) {
			return {
				...parsed,
				openapi: defaultConfig.openapi,
			};
		}

		// Ensure defaults for base and patterns if missing
		// We merge with defaults if they are not present, but if they are present (even empty), we respect them?
		// Usually for patterns, if missing, we want defaults.
		// For base, if missing, we want default preset.
		const mergedOpenApi: OpenAPIConfig = {
			...parsed.openapi,
			base: parsed.openapi.base ?? defaultConfig.openapi?.base,
			patterns: parsed.openapi.patterns ?? defaultConfig.openapi?.patterns,
		};

		return {
			...parsed,
			openapi: mergedOpenApi,
		};
	} catch (error) {
		console.error(`Error parsing config file ${configPath}:`, error);
		// If parsing fails, return defaults
		// Note: In LSP context, warnings should be logged via DiagnosticsLogger
		// For standalone usage, warnings are silently swallowed
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
				resolvedPath = existsSync(telescopePath)
					? telescopePath
					: resolve(workspaceRoot, path);
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

		if (!candidateRule.meta || !candidateRule.create) {
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
	config: LintConfig,
	workspaceRoot?: string,
): Promise<ResolvedRule[]> {
	// Get all rules and presets from registry
	const allRules = ruleRegistry.getAllRules();
	const builtinRules = new Map<string, Rule>();
	for (const rule of allRules) {
		builtinRules.set(rule.meta.id, rule);
	}

	const presets = ruleRegistry.getAllPresets();
	const selected = new Map<string, ResolvedRule>();
	const appliedPresets = new Set<string>(); // Track applied presets to prevent cycles

	const applyRuleEntry = (ruleId: string, entry: RuleConfigEntry) => {
		const setting = normalizeRuleSetting(entry);
		if (setting.severity === "off") {
			selected.delete(ruleId);
			return;
		}
		const rule = builtinRules.get(ruleId);
		if (!rule) return;
		selected.set(ruleId, {
			id: ruleId,
			rule,
			severity: setting.severity as Severity,
			options: setting.options,
		});
	};

	const applyPreset = (presetId: string) => {
		// Prevent infinite loops from circular dependencies
		if (appliedPresets.has(presetId)) {
			return;
		}

		const preset = presets.get(presetId);
		if (!preset) {
			// Note: In LSP context, warnings should be logged via DiagnosticsLogger
			return;
		}

		appliedPresets.add(presetId);

		// First apply extended presets recursively
		if (preset.extends) {
			for (const extendedId of preset.extends) {
				applyPreset(extendedId);
			}
		}

		// Then apply this preset's rules (may override extended rules)
		for (const [ruleId, entry] of Object.entries(preset.rules)) {
			applyRuleEntry(ruleId, entry as RuleConfigEntry);
		}
	};

	// Reset applied presets for each config materialization
	appliedPresets.clear();
	// Use openapi.base with safe fallback to empty array (resolveConfig should handle defaults)
	for (const presetId of config.openapi?.base ?? []) {
		applyPreset(presetId);
	}

	if (config.openapi?.rulesOverrides) {
		for (const [ruleId, entry] of Object.entries(
			config.openapi.rulesOverrides,
		)) {
			applyRuleEntry(ruleId, entry);
		}
	}

	// Load custom OpenAPI rules
	if (config.openapi?.customRules && workspaceRoot) {
		for (const ruleConfig of config.openapi.customRules) {
			const customRule = await loadCustomOpenAPIRule(
				ruleConfig.rule,
				workspaceRoot,
			);
			if (customRule) {
				// Use rule ID from meta, or generate one from path
				const ruleId = customRule.meta.id || `custom-${ruleConfig.rule}`;
				// Register custom rule in registry
				ruleRegistry.registerRule(ruleId, customRule);
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

function normalizeRuleSetting(entry: RuleConfigEntry): RuleSetting {
	if (typeof entry === "string") {
		return { severity: entry as Severity };
	}
	if (Array.isArray(entry)) {
		return { severity: entry[0] as Severity, options: entry[1] };
	}
	return entry as RuleSetting;
}
