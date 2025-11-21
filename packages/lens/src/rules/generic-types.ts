/**
 * Generic rule types for non-OpenAPI Additional Validation.
 * These types provide a simplified context compared to OpenAPI rules.
 */

import type { Range } from "vscode-languageserver-protocol";
import type { Diagnostic } from "./types";

export interface GenericFilePatch {
	uri: string;
	ops: Array<
		| { op: "add"; path: string; value: unknown }
		| { op: "remove"; path: string }
		| { op: "replace"; path: string; value: unknown }
	>;
}

export type GenericDiagnosticInput = Omit<Diagnostic, "ruleId"> & {
	ruleId?: string; // Optional, will be auto-filled from rule metadata if not provided
};

/**
 * Simplified context for generic rules.
 * Does not include OpenAPI-specific helpers like getScopeContext, locate, etc.
 */
export interface GenericRuleContext {
	file: {
		uri: string;
		ast: unknown; // Parsed AST (object, array, or primitive)
		rawText: string;
	};
	report(diagnostic: GenericDiagnosticInput): void;
	fix(patch: GenericFilePatch | GenericFilePatch[]): void;
	/**
	 * Convert byte offsets in raw text to a Range (line/character positions).
	 */
	offsetToRange(startOffset: number, endOffset?: number): Range | null;
}

/**
 * Simplified visitors for generic rules.
 * Only supports Document visitor since we don't have OpenAPI structure.
 */
export type GenericVisitors = {
	Document?(node: { uri: string; pointer: string; node: unknown }): void;
};

/**
 * Metadata for generic rules.
 */
export interface GenericRuleMeta {
	id: string;
	docs: {
		description: string;
		recommended?: boolean;
		url?: string;
	};
	type: "problem" | "suggestion" | "layout";
	schema?: unknown;
	fixable?: boolean;
	fileFormats?: string[]; // Array of file formats/extensions rule applies to
	ruleType?: "generic"; // Automatically set by defineGenericRule - do not set manually
}

/**
 * Generic rule interface.
 */
export interface GenericRule {
	meta: GenericRuleMeta;
	create(ctx: GenericRuleContext): GenericVisitors;
}

export const defineGenericRule = <T extends GenericRule>(rule: T): T => {
	// Automatically set ruleType to "generic" if not already set
	if (!rule.meta.ruleType) {
		rule.meta.ruleType = "generic";
	}
	return rule;
};
