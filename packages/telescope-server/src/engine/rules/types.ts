/**
 * Rule Engine Type Definitions
 *
 * This module defines the core types used by the Telescope rule engine for
 * OpenAPI document validation. These types form the foundation of the rule
 * authoring API and the engine execution system.
 *
 * @module rules/types
 *
 * @example
 * ```typescript
 * import type { Rule, RuleContext, Visitors } from "telescope-server";
 *
 * const myRule: Rule = {
 *   meta: { id: "my-rule", number: 1000, type: "problem", description: "..." },
 *   check(ctx) {
 *     return {
 *       Operation(op) {
 *         ctx.report({ message: "Issue found", uri: op.uri, range: ctx.locate(op.uri, op.pointer)! });
 *       }
 *     };
 *   }
 * };
 * ```
 */

import type {
	DiagnosticRelatedInformation,
	DiagnosticSeverity,
	Range,
} from "vscode-languageserver-protocol";
import type { RefGraph, Resolver } from "../indexes/graph-types.js";
import type {
	CallbackRef,
	ComponentRef,
	ExampleRef,
	HeaderRef,
	InfoRef,
	LinkRef,
	MediaTypeRef,
	OperationRef,
	ParameterRef,
	PathItemRef,
	ProjectIndex,
	ReferenceRef,
	RequestBodyRef,
	ResponseRef,
	RootRef,
	RootResolver,
	SchemaRef,
	ScopeContext,
	SecurityRequirementRef,
	TagRef,
} from "../indexes/types.js";
import type { ParsedDocument } from "../types.js";

/**
 * Represents a diagnostic message reported by a rule.
 *
 * Diagnostics are the primary output of rule validation, containing
 * information about issues found in OpenAPI documents including the
 * location, severity, and optionally suggested fixes.
 *
 * This type is aligned with LSP Diagnostic for direct use with VS Code.
 *
 * @see {@link RuleContext.report} - Method to report diagnostics from rules
 * @see {@link DiagnosticInput} - Simplified input type for rule authors
 *
 * @example
 * ```typescript
 * const diagnostic: Diagnostic = {
 *   code: "rule-123-operation-description",
 *   message: "Operation is missing a description",
 *   uri: "file:///api.yaml",
 *   range: { start: { line: 10, character: 4 }, end: { line: 10, character: 8 } },
 *   severity: DiagnosticSeverity.Warning,
 *   source: "telescope"
 * };
 * ```
 */
export interface Diagnostic {
	/** Rule identifier/code (e.g., "rule-123-operation-description") */
	code: string;
	/** Human-readable description of the issue */
	message: string;
	/** URI of the document containing the issue */
	uri: string;
	/** Location of the issue within the document */
	range: Range;
	/** Severity level of the diagnostic */
	severity: DiagnosticSeverity;
	/** Source identifier (always "telescope" for engine diagnostics) */
	source: string;
	/** Optional link to rule documentation (clickable in VS Code) */
	codeDescription?: { href: string };
	/** Optional related locations that provide additional context */
	relatedInformation?: DiagnosticRelatedInformation[];
	/** Optional suggested fixes that can be applied automatically */
	suggest?: Array<{ title: string; fix: FilePatch | FilePatch[] }>;
	/**
	 * Indicates how precisely the range was determined.
	 * UI tools can use this to indicate uncertainty (e.g., dashed underline for fallback).
	 *
	 * - "exact": Range points to the exact location of the issue
	 * - "key": Range points to the key name (for missing field errors)
	 * - "parent": Range fell back to the parent node
	 * - "firstChild": Range fell back to the first child of parent
	 * - "fallback": Range fell back to document start (location unknown)
	 */
	rangePrecision?: "exact" | "key" | "parent" | "firstChild" | "fallback";
}

/**
 * Represents a file modification operation for auto-fixes.
 *
 * File patches use JSON Patch-like operations to describe modifications
 * that can be applied to documents to fix issues. These are used by
 * the LSP layer to provide code actions.
 *
 * @see {@link RuleContext.fix} - Method to register fixes from rules
 *
 * @example
 * ```typescript
 * const patch: FilePatch = {
 *   uri: "file:///api.yaml",
 *   ops: [
 *     { op: "add", path: "/paths/~1users/get/description", value: "List all users" }
 *   ]
 * };
 * ```
 */
export interface FilePatch {
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
 * Contains all data needed to validate a project or set of related documents.
 *
 * The ProjectContext aggregates parsed documents, their reference graph,
 * and indexes for efficient traversal. It is constructed by the engine
 * before running rules and provides the foundation for validation.
 *
 * @see {@link buildRefGraph} - Function that builds the reference graph
 * @see {@link buildIndex} - Function that builds the project index
 * @see {@link runEngine} - Function that uses ProjectContext to run rules
 *
 * @example
 * ```typescript
 * const context: ProjectContext = {
 *   docs: new Map([["file:///api.yaml", parsedDoc]]),
 *   index: buildIndex({ docs, graph, resolver }),
 *   resolver: graphResolver,
 *   graph: refGraph,
 *   rootResolver: rootResolver,
 *   version: "3.1"
 * };
 * ```
 */
export interface ProjectContext {
	/** Map of document URIs to their parsed representations */
	docs: Map<string, ParsedDocument>;
	/** Index containing extracted OpenAPI elements for fast lookup */
	index: ProjectIndex;
	/** Resolver for dereferencing $ref pointers across documents */
	resolver: Resolver;
	/** Graph of $ref relationships between documents */
	graph: RefGraph;
	/** Resolver for finding root documents for any node */
	rootResolver: RootResolver;
	/** Detected OpenAPI version (e.g., "3.0", "3.1", "3.2") */
	version: string;
}

/**
 * Interface for objects that can resolve scope context for document locations.
 *
 * @see {@link ScopeContext} - The context object returned by this interface
 */
export interface ScopeLocator {
	/**
	 * Get the scope context for a specific location in a document.
	 *
	 * @param uri - Document URI
	 * @param pointer - JSON pointer to the location
	 * @returns Scope context or null if not found
	 */
	getScopeContext(uri: string, pointer: string): ScopeContext | null;
}

/**
 * Simplified diagnostic input type for rule authors.
 *
 * This type allows rule authors to omit code/source and use string severity
 * values instead of numeric constants. The engine automatically fills
 * in code from rule metadata, source as "telescope", and converts severity strings.
 *
 * @see {@link Diagnostic} - The full diagnostic type
 * @see {@link RuleContext.report} - Method that accepts this type
 *
 * @example
 * ```typescript
 * ctx.report({
 *   message: "Missing description",
 *   uri: op.uri,
 *   range: ctx.locate(op.uri, op.pointer)!,
 *   severity: "warning"  // String instead of DiagnosticSeverity.Warning
 * });
 * ```
 */
export type DiagnosticInput = Omit<
	Diagnostic,
	"code" | "source" | "severity"
> & {
	/** Optional rule code (auto-filled from rule metadata if not provided) */
	code?: string;
	/** Optional source (auto-filled as "telescope" if not provided) */
	source?: string;
	/** Severity as a string (auto-converted to DiagnosticSeverity) */
	severity?: "error" | "warning" | "info" | "hint";
};

/**
 * Context object provided to rules during validation.
 *
 * RuleContext provides access to the project data and utility methods
 * for locating nodes, reporting diagnostics, and navigating schemas.
 * It is the primary interface for rule implementations.
 *
 * @see {@link createRuleContext} - Factory function in runner.ts
 * @see {@link Rule.check} - Method that receives this context
 *
 * @example
 * ```typescript
 * const rule: Rule = {
 *   meta: { id: "example", number: 1, type: "problem", description: "..." },
 *   check(ctx: RuleContext) {
 *     return {
 *       Operation(op) {
 *         const range = ctx.locate(op.uri, op.pointer);
 *         if (range) {
 *           ctx.report({ message: "Issue", uri: op.uri, range, severity: "error" });
 *         }
 *       }
 *     };
 *   }
 * };
 * ```
 */
/**
 * OpenAPI version strings for version-aware rule authoring.
 * Only major.minor versions are tracked since patch versions don't affect schema structure.
 */
export type OpenAPIVersion = "2.0" | "3.0" | "3.1" | "3.2";

export interface RuleContext {
	/** The project context containing all documents and indexes */
	project: ProjectContext;
	/** Information about the current file being validated */
	file: { uri: string; document: ParsedDocument };

	/**
	 * The detected OpenAPI version for the current document.
	 * Returns "unknown" if version cannot be determined.
	 */
	readonly version: OpenAPIVersion | "unknown";

	/**
	 * Check if the current document is a specific OpenAPI version.
	 * Use for version-specific validation logic.
	 *
	 * @param version - The OpenAPI version to check ("2.0", "3.0", "3.1", "3.2")
	 * @returns true if the document matches the specified version
	 *
	 * @example
	 * ```typescript
	 * Schema(schema) {
	 *   const nullable = schema.nullable();
	 *
	 *   if (ctx.isVersion("3.0")) {
	 *     // nullable is valid in 3.0
	 *     if (nullable && !schema.type()) {
	 *       ctx.reportAt(schema, "nullable", {
	 *         message: "nullable without type is ambiguous",
	 *         severity: "warning"
	 *       });
	 *     }
	 *   }
	 *
	 *   if (ctx.isVersion("3.1") || ctx.isVersion("3.2")) {
	 *     // nullable is deprecated in 3.1+
	 *     if (nullable) {
	 *       ctx.reportAt(schema, "nullable", {
	 *         message: "nullable is deprecated, use type: ['string', 'null']",
	 *         severity: "warning"
	 *       });
	 *     }
	 *   }
	 * }
	 * ```
	 */
	isVersion(version: OpenAPIVersion): boolean;

	/**
	 * Report a diagnostic issue found during validation.
	 *
	 * @param diagnostic - The diagnostic to report
	 *
	 * @example
	 * ```typescript
	 * ctx.report({
	 *   message: "Operation missing description",
	 *   uri: op.uri,
	 *   range: ctx.locate(op.uri, `${op.pointer}/description`)!,
	 *   severity: "warning"
	 * });
	 * ```
	 */
	report(diagnostic: DiagnosticInput): void;

	/**
	 * Report at a specific field with automatic fallback to parent.
	 * This is a convenience method that handles the common pattern of:
	 * 1. Building the field pointer
	 * 2. Locating the range (with fallback to parent)
	 * 3. Reporting the diagnostic
	 *
	 * @param ref - The visitor ref (has uri and pointer)
	 * @param field - Field name or path (e.g., "summary" or ["responses", "200"])
	 * @param opts - Message, severity, and optional preferKey flag
	 * @returns true if reported, false if range couldn't be resolved at all
	 *
	 * @example
	 * ```typescript
	 * // Instead of:
	 * const pointer = `${op.pointer}/summary`;
	 * const range = ctx.locate(op.uri, pointer) ?? ctx.locate(op.uri, op.pointer);
	 * if (range) ctx.report({ message: "...", severity: "error", uri: op.uri, range });
	 *
	 * // Use:
	 * ctx.reportAt(op, "summary", { message: "Missing summary", severity: "error" });
	 * ```
	 */
	reportAt(
		ref: { uri: string; pointer: string },
		field: string | string[],
		opts: {
			message: string;
			severity: "error" | "warning" | "info" | "hint";
			preferKey?: boolean;
		},
	): boolean;

	/**
	 * Report at the ref's own location (no field navigation).
	 * Shorthand for when you want to report on the node itself.
	 *
	 * @param ref - The visitor ref (has uri and pointer)
	 * @param opts - Message and severity
	 * @returns true if reported, false if range couldn't be resolved
	 *
	 * @example
	 * ```typescript
	 * ctx.reportHere(op, { message: "Invalid operation", severity: "error" });
	 * ```
	 */
	reportHere(
		ref: { uri: string; pointer: string },
		opts: { message: string; severity: "error" | "warning" | "info" | "hint" },
	): boolean;

	/**
	 * Register a fix that can be applied to resolve an issue.
	 *
	 * @param patch - One or more file patches to apply
	 *
	 * @example
	 * ```typescript
	 * ctx.fix({
	 *   uri: op.uri,
	 *   ops: [{ op: "add", path: `${op.pointer}/description`, value: "TODO: Add description" }]
	 * });
	 * ```
	 */
	fix(patch: FilePatch | FilePatch[]): void;

	/**
	 * Get the scope context for a location, providing information about
	 * the path, operation, component, etc. that contains the node.
	 *
	 * @param uri - Document URI
	 * @param pointer - JSON pointer to the location
	 * @returns Scope context or null if not determinable
	 */
	getScopeContext(uri: string, pointer: string): ScopeContext | null;

	/**
	 * Get the source range for a node identified by a JSON pointer.
	 *
	 * @param uri - Document URI
	 * @param pointer - JSON pointer to the node
	 * @returns Range in the source document, or null if not found
	 *
	 * @example
	 * ```typescript
	 * const range = ctx.locate(op.uri, `${op.pointer}/operationId`);
	 * if (range) {
	 *   ctx.report({ message: "Invalid operationId", uri: op.uri, range, severity: "error" });
	 * }
	 * ```
	 */
	locate(uri: string, pointer: string): Range | null;

	/**
	 * Locate just the key name at a pointer (not the value).
	 * Useful for "unrecognized key" or "invalid key name" errors where you want
	 * to highlight only the key, not the entire value.
	 *
	 * @param uri - Document URI
	 * @param pointer - JSON pointer to the node
	 * @returns Range of the key name only, or null if not found or no key info
	 *
	 * @example
	 * ```typescript
	 * // Highlight just the key "operationId" instead of its value
	 * const keyRange = ctx.locateKey(op.uri, `${op.pointer}/operationId`);
	 * if (keyRange) {
	 *   ctx.report({ message: "Invalid key name", uri: op.uri, range: keyRange, severity: "error" });
	 * }
	 * ```
	 */
	locateKey(uri: string, pointer: string): Range | null;

	/**
	 * Locate the first key in an object at the given pointer.
	 * Useful for reporting missing sibling keys - highlights where additional keys should be.
	 * Returns the range of the first property key (e.g., "openapi:" when pointer is "#").
	 *
	 * @param uri - Document URI
	 * @param pointer - JSON pointer to an object node
	 * @returns Range of the first key, or null if not found/not an object
	 */
	locateFirstChild(uri: string, pointer: string): Range | null;

	/**
	 * Convert byte offsets in raw text to a Range (line/character positions).
	 * Useful for finding exact positions when working with raw text content.
	 *
	 * @param uri - Document URI
	 * @param startOffset - Starting byte offset
	 * @param endOffset - Optional ending byte offset (defaults to startOffset + 1)
	 * @returns Range in the document, or null if invalid
	 */
	offsetToRange(
		uri: string,
		startOffset: number,
		endOffset?: number,
	): Range | null;

	/**
	 * Find the range of a key name in an object, given the parent pointer and key name.
	 * This searches backwards from the value's position to find the key name.
	 *
	 * @param uri - Document URI
	 * @param parentPointer - JSON pointer to the parent object
	 * @param keyName - Name of the key to find
	 * @returns Range of the key name, or null if not found
	 */
	findKeyRange(
		uri: string,
		parentPointer: string,
		keyName: string,
	): Range | null;

	/**
	 * Get root document URI(s) for the current file or a specific node.
	 * Returns empty array if no roots found, or [uri] if file is itself a root.
	 *
	 * @param uri - Optional URI (defaults to current file URI)
	 * @param pointer - Optional JSON pointer (defaults to document root "#")
	 * @returns Array of root document URIs
	 */
	getRootDocuments(uri?: string, pointer?: string): string[];

	/**
	 * Get the primary root document URI for the current file or a specific node.
	 * Returns null if not connected to any root.
	 *
	 * @param uri - Optional URI (defaults to current file URI)
	 * @param pointer - Optional JSON pointer (defaults to document root "#")
	 * @returns Primary root document URI, or null if not found
	 */
	getPrimaryRoot(uri?: string, pointer?: string): string | null;

	// Schema navigation methods

	/**
	 * Get all direct child schemas of a schema (properties, items, allOf members, etc.)
	 *
	 * @param schemaRef - The parent schema reference
	 * @returns Array of child schema references
	 */
	getChildSchemas(schemaRef: SchemaRef): SchemaRef[];

	/**
	 * Get a specific property schema by name.
	 *
	 * @param schemaRef - The parent schema reference
	 * @param propertyName - The property name to look up
	 * @returns The property schema reference, or null if not found
	 */
	getPropertySchema(
		schemaRef: SchemaRef,
		propertyName: string,
	): SchemaRef | null;

	/**
	 * Get the array items schema.
	 *
	 * @param schemaRef - The array schema reference
	 * @returns The items schema reference, or null if not an array or no items defined
	 */
	getItemsSchema(schemaRef: SchemaRef): SchemaRef | null;

	/**
	 * Get the required properties array for a schema.
	 *
	 * @param schemaRef - The schema reference
	 * @returns Array of required property names
	 */
	getRequiredProperties(schemaRef: SchemaRef): string[];
}

/**
 * Visitor functions for traversing OpenAPI document elements.
 *
 * Rules return a Visitors object from their `check` method. The engine
 * calls the appropriate visitor function for each element type found
 * during document traversal.
 *
 * @see {@link Rule.check} - Method that returns Visitors
 * @see {@link runEngine} - Function that dispatches visitors
 *
 * @example
 * ```typescript
 * const visitors: Visitors = {
 *   Operation(op) {
 *     console.log(`Found operation: ${op.method} at ${op.pointer}`);
 *   },
 *   Schema(schema) {
 *     console.log(`Found schema at ${schema.pointer}`);
 *   },
 *   Project({ index }) {
 *     // Called once after all files processed - for aggregate checks
 *   }
 * };
 * ```
 */
export type Visitors = {
	/** Called for every OpenAPI file (general file checks like ASCII validation) */
	Document?(node: { uri: string; pointer: string; node: unknown }): void;
	/** Called only for root-level OpenAPI documents (containing openapi/swagger keys) */
	Root?(node: RootRef): void;
	/** Called for the info section of root OpenAPI documents */
	Info?(node: InfoRef): void;
	/** Called for each tag definition at root level */
	Tag?(node: TagRef): void;
	/** Called for each path item (e.g., /users, /users/{id}) */
	PathItem?(node: PathItemRef): void;
	/** Called for each HTTP operation (GET, POST, etc.) */
	Operation?(node: OperationRef): void;
	/** Called for each component definition */
	Component?(node: ComponentRef): void;
	/** Called for each schema (recursive into nested schemas) */
	Schema?(node: SchemaRef): void;
	/** Called for each parameter definition */
	Parameter?(node: ParameterRef): void;
	/** Called for each response definition */
	Response?(node: ResponseRef): void;
	/** Called for each request body definition */
	RequestBody?(node: RequestBodyRef): void;
	/** Called for each header definition */
	Header?(node: HeaderRef): void;
	/** Called for each media type definition */
	MediaType?(node: MediaTypeRef): void;
	/** Called for each security requirement */
	SecurityRequirement?(node: SecurityRequirementRef): void;
	/** Called for each example definition */
	Example?(node: ExampleRef): void;
	/** Called for each link definition */
	Link?(node: LinkRef): void;
	/** Called for each callback definition */
	Callback?(node: CallbackRef): void;
	/** Called for each $ref node */
	Reference?(node: ReferenceRef): void;
	/**
	 * Called once after all per-file visitors complete.
	 * Use for aggregate/project-level checks like duplicate operationId detection.
	 */
	Project?(ctx: { index: ProjectIndex }): void;
};

/**
 * Metadata describing a validation rule.
 *
 * Every rule must provide metadata that identifies it and describes
 * its purpose. This information is used for configuration, reporting,
 * and documentation.
 *
 * @see {@link Rule} - Interface that includes RuleMeta
 * @see {@link defineRule} - Helper function for creating rules
 *
 * @example
 * ```typescript
 * const meta: RuleMeta = {
 *   id: "operation-description",
 *   number: 101,
 *   description: "Operations should have a description",
 *   type: "suggestion",
 *   url: "https://example.com/rules/operation-description"
 * };
 * ```
 */
export interface RuleMeta {
	/** Unique identifier for the rule (e.g., "operation-description") */
	id: string;
	/** Numeric identifier for the rule (used in diagnostic codes) */
	number: number;
	/** Human-readable description of what the rule checks */
	description: string;
	/** Optional URL with more information about the rule */
	url?: string;
	/** Category of the rule: problem (error), suggestion, or layout */
	type: "problem" | "suggestion" | "layout";
	/**
	 * Default severity for this rule. Can be overridden in config.
	 * - error: Critical issues that must be fixed
	 * - warning: Best practice violations that should be addressed
	 * - info: Informational suggestions for improvement
	 * - hint: Minor style suggestions
	 */
	defaultSeverity?: "error" | "warning" | "info" | "hint";
	/** Optional JSON Schema for rule-specific configuration */
	schema?: unknown;
	/** Whether the rule can provide automatic fixes */
	fixable?: boolean;
	/** File formats this rule applies to (e.g., ["yaml", "json"]) */
	fileFormats?: string[];
	/** Type of rule: "openapi" for OpenAPI-specific, "generic" for any file */
	ruleType?: "openapi" | "generic";
	/**
	 * Scope of the rule determining when it runs:
	 * - "single-file": Rule only needs one file to validate (fast, per-document diagnostics)
	 *   Examples: missing description, invalid enum, schema structure
	 * - "cross-file": Rule needs multiple files/project context (workspace diagnostics)
	 *   Examples: unresolved $refs, duplicate operationIds, circular references
	 *
	 * Defaults to "single-file" if not specified.
	 * This distinction is similar to TypeScript's syntactic vs semantic diagnostics.
	 */
	scope?: "single-file" | "cross-file";
}

/**
 * Names of visitor types that can be used in field declarations.
 */
export type VisitorName =
	| "Document"
	| "Root"
	| "Info"
	| "Tag"
	| "PathItem"
	| "Operation"
	| "Component"
	| "Schema"
	| "Parameter"
	| "Response"
	| "RequestBody"
	| "Header"
	| "MediaType"
	| "SecurityRequirement"
	| "Example"
	| "Link"
	| "Callback"
	| "Reference";

/**
 * Field validation constraints for a specific visitor type.
 *
 * Declare which fields are required, suggested, or recommended for
 * elements visited by this visitor.
 *
 * @example
 * ```typescript
 * const constraints: VisitorFieldConstraints = {
 *   required: { summary: "Operations must have a summary" },
 *   suggested: { description: "Consider adding a description" },
 * };
 * ```
 */
export interface VisitorFieldConstraints {
	/**
	 * Fields that MUST exist and be non-empty.
	 * Reports with severity "error".
	 * Map of field name to error message.
	 */
	required?: Record<string, string>;
	/**
	 * Fields that SHOULD exist.
	 * Reports with severity "warning".
	 * Map of field name to warning message.
	 */
	suggested?: Record<string, string>;
	/**
	 * Fields that are recommended but not required.
	 * Reports with severity "info".
	 * Map of field name to info message.
	 */
	recommended?: Record<string, string>;
}

/**
 * Declarative field validation rules per visitor type.
 *
 * This allows rules to declare required/suggested/recommended fields
 * without writing a check() function. The engine auto-generates
 * visitors that validate field presence.
 *
 * @example
 * ```typescript
 * const fields: RuleFieldsDeclaration = {
 *   Operation: {
 *     required: { tags: "Operations must provide at least one tag" },
 *     suggested: { description: "Operations should have a description" },
 *   },
 *   Schema: {
 *     required: { type: "Schemas must specify a type" },
 *   },
 * };
 * ```
 */
export type RuleFieldsDeclaration = {
	[K in VisitorName]?: VisitorFieldConstraints;
};

/**
 * A validation rule that checks OpenAPI documents for issues.
 *
 * Rules are the primary extension point for adding custom validation.
 * They can use declarative field validation via `fields`, custom logic
 * via `check()`, or both.
 *
 * @typeParam S - Type of the rule's state object (for stateful rules)
 *
 * @see {@link defineRule} - Helper function for creating rules
 * @see {@link RuleContext} - Context passed to the check function
 * @see {@link Visitors} - Return type of the check function
 *
 * @example Declarative field validation (simplest)
 * ```typescript
 * export default defineRule({
 *   meta: { id: "tags-required", number: 420, type: "problem", description: "..." },
 *   fields: {
 *     Operation: { required: { tags: "Operations must provide at least one tag" } },
 *   },
 * });
 * ```
 *
 * @example Custom validation logic
 * ```typescript
 * export default defineRule({
 *   meta: { id: "require-summary", number: 100, type: "problem", description: "..." },
 *   check(ctx) {
 *     return {
 *       Operation(op) {
 *         if (!op.summary()) {
 *           ctx.reportAt(op, "summary", {
 *             message: "Operation is missing a summary",
 *             severity: "error"
 *           });
 *         }
 *       }
 *     };
 *   }
 * });
 * ```
 *
 * @example Both fields and custom logic
 * ```typescript
 * export default defineRule({
 *   meta: { id: "operation-docs", number: 101, type: "problem", description: "..." },
 *   fields: {
 *     Operation: { required: { summary: "Operations must have a summary" } },
 *   },
 *   check(ctx) {
 *     return {
 *       Operation(op) {
 *         // Additional custom validation beyond required fields
 *         const desc = op.description();
 *         if (desc && desc.length < 20) {
 *           ctx.reportAt(op, "description", {
 *             message: "Description should be at least 20 characters",
 *             severity: "warning"
 *           });
 *         }
 *       }
 *     };
 *   }
 * });
 * ```
 */
export interface Rule<S = unknown> {
	/** Metadata describing the rule */
	meta: RuleMeta;
	/**
	 * Optional state factory - called once per lint run to initialize rule state.
	 * Use for rules that need to track information across multiple visitors.
	 */
	state?: () => S;
	/**
	 * Declarative field validation per visitor type.
	 * The engine auto-generates visitors that check for required/suggested/recommended fields.
	 *
	 * - For strings: checks non-empty after trim
	 * - For arrays: checks length > 0
	 * - For other types: checks !== undefined
	 *
	 * If both `fields` and `check()` are provided, both run.
	 */
	fields?: RuleFieldsDeclaration;
	/**
	 * Create visitors for this rule.
	 * Optional if `fields` is provided and covers all validation needs.
	 *
	 * @param ctx - The rule context providing access to documents and utilities
	 * @param state - The state object (if state factory was provided)
	 * @returns Visitor functions for OpenAPI elements
	 */
	check?(ctx: RuleContext, state: S): Visitors;
}

/**
 * Options for running the rule engine.
 *
 * @see {@link runEngine} - Function that accepts these options
 */
export interface EngineRunOptions {
	/** Array of rules to run */
	rules: Rule[];
}

/**
 * Result of running the rule engine.
 *
 * @see {@link runEngine} - Function that returns this result
 */
export interface EngineRunResult {
	/** All diagnostics reported by rules */
	diagnostics: Diagnostic[];
	/** All fixes registered by rules */
	fixes: FilePatch[];
}
