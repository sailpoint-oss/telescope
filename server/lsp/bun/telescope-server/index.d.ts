export function splitPointer(pointer: string): string[];
export function joinPointer(parts: string[]): string;
export function getValueAtPointer(root: unknown, pointer: string): unknown;

export interface RuleContext {
	document: {
		uri: string;
		ast: Record<string, unknown>;
		rawText: string;
		format: string;
		version: string;
		pointers: Record<string, [number, number, number, number]>;
	};
	report(descriptor: {
		message: string;
		pointer?: string;
		range?: { startLine: number; startChar: number; endLine: number; endChar: number };
		severity?: number;
		code?: string;
	}): void;
}

export interface GenericRuleContext extends RuleContext {
	document: RuleContext["document"];
}

export interface RuleDefinition {
	meta?: { id?: string; description?: string };
	check(ctx: RuleContext): void;
}

export interface GenericRuleDefinition {
	meta?: { id?: string; description?: string };
	create(ctx: GenericRuleContext): void;
}

export function defineRule(definition: RuleDefinition): RuleDefinition;
export function defineGenericRule(definition: GenericRuleDefinition): GenericRuleDefinition;

/**
 * Define a Zod schema for additional validation.
 *
 * The returned schema must have a `.parse()` method compatible with Zod.
 * Documents matching the configured patterns will be validated against this
 * schema, with Zod errors converted into LSP diagnostics.
 *
 * @example
 * ```ts
 * import { z } from "zod";
 * import { defineSchema } from "@sailpoint-oss/telescope";
 *
 * export default defineSchema(
 *   z.object({
 *     name: z.string(),
 *     version: z.string(),
 *   })
 * );
 * ```
 */
export function defineSchema<T extends { parse(data: unknown): unknown }>(schema: T): T;
