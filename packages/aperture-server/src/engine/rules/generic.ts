/**
 * Generic rule loading utilities for Additional Validation.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { TelescopeConfig } from "../schemas/config-schema.js";
import { importTypeScript } from "../utils/ts-loader.js";
import type { GenericRule, ResolvedGenericRule } from "./generic-types.js";

export type { GenericRule, ResolvedGenericRule } from "./generic-types.js";

/**
 * Load a custom generic rule from a file path.
 */
export async function loadGenericRule(
	label: string,
	path: string,
	workspaceRoot?: string,
): Promise<GenericRule | null> {
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
			// Note: In LSP context, warnings should be logged via DiagnosticsLogger
			return null;
		}

		console.log(`Loading generic rule ${label} from ${resolvedPath}`);

		// Use esbuild to transform TypeScript files at runtime
		// For JavaScript files, use native import
		const module = resolvedPath.endsWith(".ts")
			? await importTypeScript(resolvedPath)
			: await import(resolvedPath);

		console.log(`Loaded generic rule ${label} from ${resolvedPath}`);

		// Support both default export and named export
		const rule = module.default || module.rule || module;

		// Validate rule structure
		if (!rule || typeof rule !== "object") {
			// Note: In LSP context, warnings should be logged via DiagnosticsLogger
			return null;
		}

		if (!rule.meta || !rule.create) {
			// Note: In LSP context, warnings should be logged via DiagnosticsLogger
			return null;
		}

		// Validate it's a generic rule (ruleType should be set by defineGenericRule)
		if (!rule.meta.ruleType || rule.meta.ruleType !== "generic") {
			// Note: In LSP context, warnings should be logged via DiagnosticsLogger
			return null;
		}

		return rule as GenericRule;
	} catch (error) {
		// Note: In LSP context, warnings should be logged via DiagnosticsLogger
		return null;
	}
}

/**
 * Materialize generic rules from config.
 *
 * Returns resolved rules that include the rule implementation along with
 * the configured patterns for file matching.
 *
 * @param config - Telescope configuration
 * @param workspaceRoot - Workspace root for resolving rule paths
 * @returns Array of resolved generic rules with patterns
 */
export async function materializeGenericRules(
	config: TelescopeConfig,
	workspaceRoot?: string,
): Promise<ResolvedGenericRule[]> {
	const rules: ResolvedGenericRule[] = [];

	if (!workspaceRoot) {
		return rules;
	}

	// Handle groups structure
	if (config.additionalValidation) {
		for (const [label, group] of Object.entries(config.additionalValidation)) {
			if (group.rules) {
				for (const ruleConfig of group.rules) {
					const customRule = await loadGenericRule(
						label,
						ruleConfig.rule,
						workspaceRoot,
					);
					if (customRule) {
						// Use rule-specific patterns, or fall back to group patterns
						const patterns = ruleConfig.patterns ?? group.patterns ?? [];
						rules.push({
							rule: customRule,
							patterns,
							label,
						});
					}
				}
			}
		}
	}

	return rules;
}
