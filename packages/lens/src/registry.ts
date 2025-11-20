/**
 * Rule Registry - Central registry for OpenAPI and generic rules.
 * This breaks the circular dependency between lens and blueprint by using
 * a registration pattern instead of direct imports.
 */

import type { GenericRule } from "./rules/generic-types.js";
import type { Rule } from "./rules/types.js";

/**
 * Rule configuration entry - can be a severity string or an array with severity and options.
 */
export type RuleConfigEntry = string | [string, unknown?];

/**
 * Preset configuration for grouping rules.
 */
export interface Preset {
	id: string;
	extends?: string[];
	rules: Record<string, RuleConfigEntry>;
}

/**
 * Rule Registry - Singleton registry for rules and presets.
 * Supports both built-in rules (from blueprint) and custom rules (from user config).
 */
class RuleRegistry {
	private rules = new Map<string, Rule>();
	private genericRules = new Map<string, GenericRule>();
	private presets = new Map<string, Preset>();

	/**
	 * Register an OpenAPI rule.
	 */
	registerRule(id: string, rule: Rule): void {
		this.rules.set(id, rule);
	}

	/**
	 * Register a generic rule.
	 */
	registerGenericRule(id: string, rule: GenericRule): void {
		this.genericRules.set(id, rule);
	}

	/**
	 * Register a preset configuration.
	 */
	registerPreset(id: string, preset: Preset): void {
		this.presets.set(id, preset);
	}

	/**
	 * Get an OpenAPI rule by ID.
	 */
	getRule(id: string): Rule | undefined {
		return this.rules.get(id);
	}

	/**
	 * Get a generic rule by ID.
	 */
	getGenericRule(id: string): GenericRule | undefined {
		return this.genericRules.get(id);
	}

	/**
	 * Get a preset by ID.
	 */
	getPreset(id: string): Preset | undefined {
		return this.presets.get(id);
	}

	/**
	 * Get all registered OpenAPI rules.
	 */
	getAllRules(): Rule[] {
		return Array.from(this.rules.values());
	}

	/**
	 * Get all registered generic rules.
	 */
	getAllGenericRules(): GenericRule[] {
		return Array.from(this.genericRules.values());
	}

	/**
	 * Get all registered presets.
	 */
	getAllPresets(): Map<string, Preset> {
		return new Map(this.presets);
	}

	/**
	 * Clear all registrations (useful for tests).
	 */
	clear(): void {
		this.rules.clear();
		this.genericRules.clear();
		this.presets.clear();
	}
}

/**
 * Singleton rule registry instance.
 */
export const ruleRegistry = new RuleRegistry();

