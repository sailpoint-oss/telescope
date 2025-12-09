/**
 * Rule Authoring API
 *
 * This module provides the core utilities for authoring OpenAPI validation rules.
 *
 * @example Simple rule using visitor node directly
 * ```typescript
 * import { defineRule, type Rule } from "aperture-server";
 *
 * export default defineRule({
 *   meta: {
 *     id: "require-description",
 *     number: 1000,
 *     type: "problem",
 *     description: "Operations must have descriptions",
 *   },
 *   check(ctx) {
 *     return {
 *       Operation(op) {
 *         const operation = op.node as Record<string, unknown>;
 *         if (!operation.description) {
 *           const range = ctx.locate(op.uri, op.pointer);
 *           if (range) {
 *             ctx.report({
 *               message: "Missing description",
 *               severity: "error",
 *               uri: op.uri,
 *               range,
 *             });
 *           }
 *         }
 *       },
 *     };
 *   },
 * });
 * ```
 *
 * @example Rule with state for aggregate checks
 * ```typescript
 * import { defineRule, type Rule } from "aperture-server";
 *
 * export default defineRule({
 *   meta: {
 *     id: "unique-operation-ids",
 *     number: 1001,
 *     type: "problem",
 *     description: "Operation IDs must be unique across the workspace",
 *   },
 *   state: () => ({
 *     seen: new Map<string, { uri: string; pointer: string }>(),
 *   }),
 *   check(ctx, state) {
 *     return {
 *       Operation(op) {
 *         const operation = op.node as { operationId?: string };
 *         if (!operation.operationId) return;
 *
 *         if (state.seen.has(operation.operationId)) {
 *           const range = ctx.locate(op.uri, op.pointer);
 *           if (range) {
 *             ctx.report({
 *               message: `Duplicate operationId: ${operation.operationId}`,
 *               severity: "error",
 *               uri: op.uri,
 *               range,
 *             });
 *           }
 *         }
 *         state.seen.set(operation.operationId, { uri: op.uri, pointer: op.pointer });
 *       },
 *       // Project visitor runs once after all files are processed
 *       Project({ index }) {
 *         // Use for aggregate reporting or cleanup
 *       },
 *     };
 *   },
 * });
 * ```
 */
import type { Range } from "vscode-languageserver-protocol";
import type { Rule, RuleContext } from "./types.js";

// Re-export engine for testing
export { createRuleContext, runEngine } from "../execution/runner.js";
// Re-export index types commonly used in rules
export type {
	ApiKeyLocation,
	CallbackRef,
	ComponentRef,
	ComponentType,
	ExampleRef,
	ExternalDocsNode,
	HeaderRef,
	HttpMethod,
	ItemRef,
	LinkRef,
	MediaTypeRef,
	OAuthFlowNode,
	OAuthFlowRef,
	OAuthFlowsNode,
	OAuthFlowType,
	OperationRef,
	ParameterLocation,
	ParameterRef,
	PathItemRef,
	RequestBodyRef,
	ResponseRef,
	RootRef,
	SchemaLocation,
	SchemaRef,
	SchemaType,
	SecuritySchemeRef,
	SecuritySchemeType,
	ServerNode,
	TagRef,
} from "../indexes/types.js";
// Re-export utilities needed by rules
export {
	decodePointerSegment,
	encodePointerSegment,
	getValueAtPointer,
	joinPointer,
	splitPointer,
} from "../utils/pointer-utils.js";
// Re-export types for rule authors
export type {
	Diagnostic,
	FilePatch,
	OpenAPIVersion,
	ProjectContext,
	Rule,
	RuleContext,
	RuleMeta,
	RuleFieldsDeclaration,
	VisitorFieldConstraints,
	VisitorName,
	Visitors,
} from "./types.js";

// Re-export new DX utilities
export {
	NodeAccessor,
	FieldMissingError,
	accessor,
	withAccessor,
	type WithAccessor,
} from "./node-accessor.js";

export {
	FixBuilder,
	fix,
	addFieldFix,
	setFieldFix,
	removeFieldFix,
} from "./fix-builder.js";

export {
	validators,
	validateField,
	createFieldValidator,
	type Validator,
	type ValidationResult,
	type Severity,
	type RefInfo,
} from "./validators.js";

/**
 * Define an OpenAPI validation rule.
 *
 * Rules can use:
 * - **Declarative field validation** via `fields` - specify required/suggested fields
 * - **Custom validation** via `check()` with typed accessor methods on refs
 * - **Both** - field validation runs first, then custom logic
 *
 * Available visitors: Document (all files), Root (root documents only), PathItem,
 * Operation, Component, Schema, Parameter, Response, RequestBody, Header, MediaType,
 * SecurityRequirement, Example, Link, Callback, Reference, Project.
 *
 * @param rule - The rule definition
 * @returns The rule with ruleType set to "openapi"
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
 * @example Custom validation with typed accessors
 * ```typescript
 * export default defineRule({
 *   meta: { id: "deprecated-description", number: 152, type: "suggestion", description: "..." },
 *   check(ctx) {
 *     return {
 *       Operation(op) {
 *         // Use typed accessor methods - no more casting!
 *         if (!op.deprecated()) return;
 *         const description = op.description();
 *         if (!description?.includes("deprecated")) {
 *           ctx.reportAt(op, "description", {
 *             message: "Deprecated operations should mention deprecation in description",
 *             severity: "info",
 *           });
 *         }
 *       },
 *       Schema(schema) {
 *         if (schema.isRef()) return;  // Skip $ref schemas
 *         if (schema.isComposition()) return;  // Skip allOf/oneOf/anyOf
 *         // Use typed iteration with auto-constructed refs
 *         schema.eachProperty((name, propSchema, propRef) => {
 *           if (!propRef.description()) {
 *             ctx.reportAt(propRef, "description", { ... });
 *           }
 *         });
 *       },
 *     };
 *   },
 * });
 * ```
 */
export const defineRule = <S = unknown>(rule: Rule<S>): Rule<S> => {
	// Automatically set ruleType to "openapi" if not already set
	if (!rule.meta.ruleType) {
		rule.meta.ruleType = "openapi";
	}
	return rule;
};

/**
 * Helper to report at a specific field within an entity.
 *
 * This is a convenience function that combines pointer building
 * with range location in a single call.
 *
 * @param ctx - The rule context
 * @param uri - Document URI
 * @param basePointer - The base pointer (e.g., operation pointer)
 * @param field - The field name to report on
 * @returns The range for the field, or null if not found
 *
 * @example
 * ```typescript
 * // Instead of:
 * const pointer = joinPointer([...splitPointer(op.pointer), "operationId"]);
 * const range = ctx.locate(op.uri, pointer);
 *
 * // You can use:
 * const range = locateField(ctx, op.uri, op.pointer, "operationId");
 * ```
 */
export function locateField(
	ctx: RuleContext,
	uri: string,
	basePointer: string,
	field: string,
): Range | null {
	const { joinPointer, splitPointer } = require("../utils/pointer-utils.js");
	const fieldPointer = joinPointer([...splitPointer(basePointer), field]);
	return ctx.locate(uri, fieldPointer);
}

/**
 * Helper to get a field value from a document.
 *
 * @param ctx - The rule context
 * @param uri - Document URI
 * @param basePointer - The base pointer
 * @param field - The field name
 * @returns The field value, or undefined if not found
 */
export function getField<T = unknown>(
	ctx: RuleContext,
	uri: string,
	basePointer: string,
	field: string,
): T | undefined {
	const {
		getValueAtPointer,
		joinPointer,
		splitPointer,
	} = require("../utils/pointer-utils.js");
	const doc = ctx.project.docs.get(uri);
	if (!doc) return undefined;
	const fieldPointer = joinPointer([...splitPointer(basePointer), field]);
	return getValueAtPointer(doc.ast, fieldPointer) as T | undefined;
}

/**
 * Helper to check if a field exists and has a non-empty string value.
 *
 * @param ctx - The rule context
 * @param uri - Document URI
 * @param basePointer - The base pointer
 * @param field - The field name
 * @returns True if the field is a non-empty string
 */
export function hasNonEmptyString(
	ctx: RuleContext,
	uri: string,
	basePointer: string,
	field: string,
): boolean {
	const value = getField<unknown>(ctx, uri, basePointer, field);
	return typeof value === "string" && value.trim().length > 0;
}

/**
 * Helper to report an issue at a field location with a fallback to the parent.
 *
 * This is useful when you want to point to a specific field if it exists,
 * or fall back to the parent entity if the field is missing.
 *
 * @param ctx - The rule context
 * @param opts - Report options including fallback behavior
 */
export function reportAtField(
	ctx: RuleContext,
	opts: {
		uri: string;
		basePointer: string;
		field: string;
		message: string;
		severity: "error" | "warning" | "info";
	},
): void {
	const range =
		locateField(ctx, opts.uri, opts.basePointer, opts.field) ??
		ctx.locate(opts.uri, opts.basePointer);

	if (!range) return;

	ctx.report({
		message: opts.message,
		severity: opts.severity,
		uri: opts.uri,
		range,
	});
}
