/**
 * Generic Rule Type Definitions
 *
 * This module defines types for generic (non-OpenAPI) validation rules.
 * Generic rules provide a simplified API for validating any YAML/JSON file,
 * not just OpenAPI documents.
 *
 * Generic rules are useful for:
 * - Validating configuration files
 * - Enforcing custom schema conventions
 * - Checking file-level properties
 *
 * @module rules/generic-types
 *
 * @see {@link defineGenericRule} - Helper function for creating generic rules
 * @see {@link runGenericRules} - Function that executes generic rules
 *
 * @example
 * ```typescript
 * import { defineGenericRule } from "aperture-server";
 *
 * export default defineGenericRule({
 *   meta: {
 *     id: "require-version",
 *     docs: { description: "Files must have a version field" },
 *     type: "problem"
 *   },
 *   create(ctx) {
 *     return {
 *       Document({ node }) {
 *         const doc = node as Record<string, unknown>;
 *         if (!doc.version) {
 *           ctx.report({
 *             message: "Missing version field",
 *             uri: ctx.file.uri,
 *             range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
 *             severity: "error"
 *           });
 *         }
 *       }
 *     };
 *   }
 * });
 * ```
 */

import type { Range } from "vscode-languageserver-protocol";
import type { Diagnostic } from "./types";

/**
 * File modification operation for generic rule auto-fixes.
 *
 * Similar to FilePatch but designed for generic rules. Uses JSON Patch
 * operations to describe modifications.
 *
 * @see {@link GenericRuleContext.fix} - Method to register fixes
 *
 * @example
 * ```typescript
 * const patch: GenericFilePatch = {
 *   uri: "file:///config.yaml",
 *   ops: [
 *     { op: "add", path: "/version", value: "1.0.0" }
 *   ]
 * };
 * ctx.fix(patch);
 * ```
 */
export interface GenericFilePatch {
	/** URI of the file to modify */
	uri: string;
	/** Array of JSON Patch operations to apply */
	ops: Array<
		| { op: "add"; path: string; value: unknown }
		| { op: "remove"; path: string }
		| { op: "replace"; path: string; value: unknown }
	>;
}

/**
 * Simplified diagnostic input for generic rules.
 *
 * Similar to DiagnosticInput but with required severity since generic
 * rules don't have a default severity in their metadata.
 *
 * @see {@link GenericRuleContext.report} - Method that accepts this type
 *
 * @example
 * ```typescript
 * ctx.report({
 *   message: "Invalid configuration value",
 *   uri: ctx.file.uri,
 *   range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
 *   severity: "error"
 * });
 * ```
 */
export type GenericDiagnosticInput = Omit<Diagnostic, "code" | "source" | "severity"> & {
	/** Optional rule code (auto-filled from rule metadata if not provided) */
	code?: string;
	/** Optional source (auto-filled as "telescope" if not provided) */
	source?: string;
	/** Severity level (required for generic rules) */
	severity: "error" | "warning" | "info" | "hint";
};

/**
 * Context provided to generic rules during validation.
 *
 * GenericRuleContext provides a simplified API compared to RuleContext,
 * without OpenAPI-specific helpers like getScopeContext or schema navigation.
 * It's designed for validating any YAML/JSON file.
 *
 * @see {@link runGenericRules} - Function that creates this context
 *
 * @example
 * ```typescript
 * const rule: GenericRule = {
 *   meta: { id: "example", docs: { description: "..." }, type: "problem" },
 *   create(ctx: GenericRuleContext) {
 *     return {
 *       Document({ node }) {
 *         const doc = node as Record<string, unknown>;
 *         if (!doc.name) {
 *           ctx.report({
 *             message: "Missing name field",
 *             uri: ctx.file.uri,
 *             range: ctx.offsetToRange(0, 1)!,
 *             severity: "error"
 *           });
 *         }
 *       }
 *     };
 *   }
 * };
 * ```
 */
export interface GenericRuleContext {
	/** Information about the file being validated */
	file: {
		/** Document URI */
		uri: string;
		/** Parsed AST (object, array, or primitive) */
		ast: unknown;
		/** Raw text content of the file */
		rawText: string;
	};

	/**
	 * Report a diagnostic issue found during validation.
	 *
	 * @param diagnostic - The diagnostic to report
	 *
	 * @example
	 * ```typescript
	 * ctx.report({
	 *   message: "Configuration error",
	 *   uri: ctx.file.uri,
	 *   range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
	 *   severity: "error"
	 * });
	 * ```
	 */
	report(diagnostic: GenericDiagnosticInput): void;

	/**
	 * Register a fix that can be applied to resolve an issue.
	 *
	 * @param patch - One or more file patches to apply
	 *
	 * @example
	 * ```typescript
	 * ctx.fix({
	 *   uri: ctx.file.uri,
	 *   ops: [{ op: "add", path: "/version", value: "1.0.0" }]
	 * });
	 * ```
	 */
	fix(patch: GenericFilePatch | GenericFilePatch[]): void;

	/**
	 * Convert byte offsets in raw text to a Range (line/character positions).
	 *
	 * @param startOffset - Starting byte offset
	 * @param endOffset - Optional ending byte offset (defaults to startOffset + 1)
	 * @returns Range in the document, or null if invalid
	 *
	 * @example
	 * ```typescript
	 * const range = ctx.offsetToRange(100, 150);
	 * if (range) {
	 *   ctx.report({ message: "Issue here", uri: ctx.file.uri, range, severity: "warning" });
	 * }
	 * ```
	 */
	offsetToRange(startOffset: number, endOffset?: number): Range | null;
}

/**
 * Visitor functions for generic rules.
 *
 * Generic rules only support the Document visitor since they don't
 * have access to OpenAPI-specific structure like operations or schemas.
 *
 * @see {@link GenericRule.create} - Method that returns GenericVisitors
 *
 * @example
 * ```typescript
 * const visitors: GenericVisitors = {
 *   Document({ uri, pointer, node }) {
 *     console.log(`Processing document: ${uri}`);
 *     const doc = node as Record<string, unknown>;
 *     // Validate document structure...
 *   }
 * };
 * ```
 */
export type GenericVisitors = {
	/**
	 * Called once for the document root.
	 *
	 * @param node - Document information
	 * @param node.uri - Document URI
	 * @param node.pointer - Always "#" for the root
	 * @param node.node - The parsed document content
	 */
	Document?(node: { uri: string; pointer: string; node: unknown }): void;
};

/**
 * Metadata for a generic rule.
 *
 * Similar to RuleMeta but uses a `docs` object for description and
 * doesn't require a numeric `number` field.
 *
 * @see {@link GenericRule} - Interface that includes GenericRuleMeta
 *
 * @example
 * ```typescript
 * const meta: GenericRuleMeta = {
 *   id: "require-name",
 *   docs: {
 *     description: "All config files must have a name field",
 *     recommended: true,
 *     url: "https://example.com/rules/require-name"
 *   },
 *   type: "problem",
 *   fileFormats: ["yaml", "json"]
 * };
 * ```
 */
export interface GenericRuleMeta {
	/** Unique identifier for the rule */
	id: string;
	/** Documentation for the rule */
	docs: {
		/** Human-readable description of what the rule checks */
		description: string;
		/** Whether this rule is recommended to be enabled */
		recommended?: boolean;
		/** Optional URL with more information about the rule */
		url?: string;
	};
	/** Category of the rule: problem (error), suggestion, or layout */
	type: "problem" | "suggestion" | "layout";
	/** Optional JSON Schema for rule-specific configuration */
	schema?: unknown;
	/** Whether the rule can provide automatic fixes */
	fixable?: boolean;
	/** File formats/extensions this rule applies to (e.g., ["yaml", "json"]) */
	fileFormats?: string[];
	/**
	 * Type of rule - automatically set by defineGenericRule.
	 * Do not set manually.
	 */
	ruleType?: "generic";
}

/**
 * A generic validation rule for any YAML/JSON file.
 *
 * Generic rules provide a simplified API for validating files that
 * aren't OpenAPI documents. They only have access to the document
 * visitor and basic context methods.
 *
 * @see {@link defineGenericRule} - Helper function for creating generic rules
 * @see {@link GenericRuleContext} - Context passed to the create function
 *
 * @example
 * ```typescript
 * import { defineGenericRule } from "aperture-server";
 *
 * export default defineGenericRule({
 *   meta: {
 *     id: "config-has-name",
 *     docs: { description: "Config files must have a name field" },
 *     type: "problem",
 *     fileFormats: ["yaml"]
 *   },
 *   create(ctx) {
 *     return {
 *       Document({ node }) {
 *         const doc = node as Record<string, unknown>;
 *         if (!doc.name || typeof doc.name !== "string") {
 *           ctx.report({
 *             message: "Config file must have a 'name' string field",
 *             uri: ctx.file.uri,
 *             range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
 *             severity: "error"
 *           });
 *         }
 *       }
 *     };
 *   }
 * });
 * ```
 */
export interface GenericRule {
	/** Metadata describing the rule */
	meta: GenericRuleMeta;
	/**
	 * Create visitor functions for this rule.
	 *
	 * @param ctx - The generic rule context
	 * @returns Visitor functions (only Document is supported)
	 */
	create(ctx: GenericRuleContext): GenericVisitors;
}

/**
 * A resolved generic rule paired with its file patterns.
 *
 * This type is used internally to associate generic rules with their
 * configured patterns for pattern-based filtering.
 *
 * @see {@link materializeGenericRules} - Function that creates resolved rules
 *
 * @example
 * ```typescript
 * const resolved: ResolvedGenericRule = {
 *   rule: myGenericRule,
 *   patterns: ["custom/*.yaml", "!custom/ignore.yaml"],
 *   label: "my-validation-group"
 * };
 * ```
 */
export interface ResolvedGenericRule {
	/** The generic rule implementation */
	rule: GenericRule;
	/** Glob patterns for files this rule applies to */
	patterns: string[];
	/** Label/group name from additionalValidation config */
	label: string;
}

/**
 * Helper function to define a generic rule with proper typing.
 *
 * This function automatically sets the ruleType to "generic" and provides
 * TypeScript type inference for the rule definition.
 *
 * @typeParam T - The specific GenericRule type
 * @param rule - The rule definition
 * @returns The rule with ruleType set to "generic"
 *
 * @example
 * ```typescript
 * import { defineGenericRule } from "aperture-server";
 *
 * export default defineGenericRule({
 *   meta: {
 *     id: "my-generic-rule",
 *     docs: { description: "My custom validation" },
 *     type: "suggestion"
 *   },
 *   create(ctx) {
 *     return {
 *       Document({ node }) {
 *         // Validation logic here
 *       }
 *     };
 *   }
 * });
 * ```
 */
export const defineGenericRule = <T extends GenericRule>(rule: T): T => {
	// Automatically set ruleType to "generic" if not already set
	if (!rule.meta.ruleType) {
		rule.meta.ruleType = "generic";
	}
	return rule;
};
