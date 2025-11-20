/**
 * Generic rule loading utilities for Additional Validation.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { LintConfig } from "../config.js";
import { ruleRegistry } from "../registry.js";
import type { GenericRule } from "./generic-types.js";

export type { GenericRule } from "./generic-types.js";

/**
 * Load a custom generic rule from a file path.
 */
export async function loadGenericRule(
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

		// Use Bun's native import for .ts and .js files
		// This works because we are running in Bun
		const module = await import(resolvedPath);

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
 */
export async function materializeGenericRules(
	config: LintConfig,
	workspaceRoot?: string,
): Promise<GenericRule[]> {
	const rules: GenericRule[] = [];

	if (!workspaceRoot) {
		return rules;
	}

	// Handle groups structure
	if (config.additionalValidation?.groups) {
		for (const group of Object.values(config.additionalValidation.groups)) {
			if (group.rules) {
				for (const ruleConfig of group.rules) {
					const customRule = await loadGenericRule(
						ruleConfig.rule,
						workspaceRoot,
					);
					if (customRule) {
						// Register custom generic rule in registry
						const ruleId =
							customRule.meta.id || `custom-generic-${ruleConfig.rule}`;
						ruleRegistry.registerGenericRule(ruleId, customRule);
						rules.push(customRule);
					}
				}
			}
		}
	}

	return rules;
}
