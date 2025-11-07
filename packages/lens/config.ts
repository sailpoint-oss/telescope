import { rules as builtinRules, recommended31 } from "blueprint";
import type { Rule } from "engine";

export type Severity = "off" | "warn" | "error";

export interface RuleSetting {
	severity: Severity;
	options?: unknown;
}

export type RuleConfigEntry = RuleSetting | Severity;

export interface LintConfig {
	entrypoints: string[];
	extends?: string[];
	rules?: Record<string, RuleConfigEntry>;
	overrides?: Array<{
		files: string[];
		rules: Record<string, RuleConfigEntry>;
	}>;
	versionOverride?: string;
}

export const defaultConfig: LintConfig = {
	entrypoints: ["openapi.yaml"],
	extends: [recommended31.id],
};

export function resolveConfig(): LintConfig {
	return defaultConfig;
}

export interface ResolvedRule {
	id: string;
	rule: Rule;
	severity: Severity;
	options?: unknown;
}

export function materializeRules(config: LintConfig): ResolvedRule[] {
	const presets = new Map<string, typeof recommended31>([
		[recommended31.id, recommended31],
	]);
	const selected = new Map<string, ResolvedRule>();

	const applyRuleEntry = (ruleId: string, entry: RuleConfigEntry) => {
		const setting = normalizeRuleSetting(entry);
		if (setting.severity === "off") {
			selected.delete(ruleId);
			return;
		}
		const rule = builtinRules[ruleId];
		if (!rule) return;
		selected.set(ruleId, {
			id: ruleId,
			rule,
			severity: setting.severity,
			options: setting.options,
		});
	};

	const applyPreset = (presetId: string) => {
		const preset = presets.get(presetId);
		if (!preset) return;
		for (const [ruleId, entry] of Object.entries(preset.rules)) {
			applyRuleEntry(ruleId, entry as RuleConfigEntry);
		}
	};

	for (const presetId of config.extends ?? []) {
		applyPreset(presetId);
	}

	if (config.rules) {
		for (const [ruleId, entry] of Object.entries(config.rules)) {
			applyRuleEntry(ruleId, entry);
		}
	}

	return [...selected.values()];
}

function normalizeRuleSetting(entry: RuleConfigEntry): RuleSetting {
	if (typeof entry === "string") {
		return { severity: entry };
	}
	return entry;
}

