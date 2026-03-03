/**
 * Structural Zod Validation for OpenAPI Documents
 *
 * This module performs structural validation of OpenAPI documents using Zod schemas.
 * It validates the structure of documents (root + all $ref-reachable documents)
 * and converts Zod validation errors into engine diagnostics with precise ranges.
 *
 * @module engine/validation/zod-structural
 */

import { z } from "zod";
import type { Diagnostic as EngineDiagnostic } from "../rules/types.js";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import type { ParsedDocument } from "../types.js";
import { identifyDocumentType } from "../utils/document-type-utils.js";
import { findNodeByPointer } from "../ir/index.js";
import { buildLineOffsets, getLineCol } from "../utils/line-offset-utils.js";
import type { Range } from "vscode-languageserver-protocol";
import {
	OpenAPI2Schema,
	OpenAPI30Schema,
	OpenAPI31Schema,
	OpenAPI32Schema,
	Operation30Schema,
	Operation31Schema,
	Operation32Schema,
	PathItem30Schema,
	PathItem31Schema,
	PathItem32Schema,
	Parameter30Schema,
	Parameter31Schema,
	Parameter32Schema,
	RequestBody30Schema,
	RequestBody31Schema,
	RequestBody32Schema,
	Response30Schema,
	Response31Schema,
	Response32Schema,
	Header30Schema,
	Header31Schema,
	Header32Schema,
	SecurityScheme30Schema,
	SecurityScheme31Schema,
	SecurityScheme32Schema,
	Example30Schema,
	Example31Schema,
	Example32Schema,
	Link30Schema,
	Link31Schema,
	Link32Schema,
	Callback30Schema,
	Callback31Schema,
	Callback32Schema,
	Components30Schema,
	Components31Schema,
	Components32Schema,
	SchemaObject2Schema,
	SchemaObject30Schema,
	SchemaObject31Schema,
	SchemaObject32Schema,
} from "../schemas/index.js";

/**
 * Zod issue structure (matches Zod v4 error format)
 */
interface ZodIssue {
	code: string;
	message: string;
	path: (string | number)[];
	expected?: string;
	keys?: string[];
	// Zod v4 `invalid_key` uses `issues: ZodIssue[]` (not nested). Keep flexible.
	issues?: unknown;
	errors?: ZodIssue[][];
	discriminator?: string;
	note?: string;
}

/**
 * Recursively strip x-* extension keys from an object before Zod validation.
 * OpenAPI allows x-* extensions on virtually every object, but our Zod schemas
 * use strictObject for unrecognized-key detection, so we strip them first.
 */
export function stripXExtensions(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(stripXExtensions);
	}
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (k.startsWith("x-")) continue;
			out[k] = stripXExtensions(v);
		}
		return out;
	}
	return value;
}

/**
 * Get the appropriate Zod schema for a document based on its version and type.
 */
function getSchemaForDocument(
	version: string,
	docType: string,
): z.ZodType | null {
	// Root documents: validate against full OpenAPI schemas
	if (docType === "root") {
		if (version.startsWith("2.")) {
			return OpenAPI2Schema;
		}
		if (version.startsWith("3.2")) {
			return OpenAPI32Schema;
		}
		if (version.startsWith("3.1")) {
			return OpenAPI31Schema;
		}
		if (version.startsWith("3.0")) {
			return OpenAPI30Schema;
		}
		return null;
	}

	// Non-root documents reachable via $ref:
	// Treat JSON-Schema-like fragments as OpenAPI Schema Objects, so structural issues
	// (like extra keys) are still reported with locations.
	if (docType === "json-schema" || docType === "schema") {
		if (version.startsWith("2.")) return SchemaObject2Schema;
		if (version.startsWith("3.2")) return SchemaObject32Schema;
		if (version.startsWith("3.1")) return SchemaObject31Schema;
		if (version.startsWith("3.0")) return SchemaObject30Schema;
		return null;
	}

	if (docType === "path-item") {
		if (version.startsWith("3.2")) return PathItem32Schema;
		if (version.startsWith("3.1")) return PathItem31Schema;
		if (version.startsWith("3.0")) return PathItem30Schema;
		// Swagger 2.0 path items exist, but we currently only validate them when the doc is detected as `path-item`
		// and the inferred version is 2.x (schema module already includes PathItem2Schema at the value level of `paths`).
		return null;
	}

	if (docType === "operation") {
		if (version.startsWith("3.2")) return Operation32Schema;
		if (version.startsWith("3.1")) return Operation31Schema;
		if (version.startsWith("3.0")) return Operation30Schema;
		return null;
	}

	if (docType === "parameter") {
		if (version.startsWith("3.2")) return Parameter32Schema;
		if (version.startsWith("3.1")) return Parameter31Schema;
		if (version.startsWith("3.0")) return Parameter30Schema;
		return null;
	}

	if (docType === "request-body") {
		if (version.startsWith("3.2")) return RequestBody32Schema;
		if (version.startsWith("3.1")) return RequestBody31Schema;
		if (version.startsWith("3.0")) return RequestBody30Schema;
		return null;
	}

	if (docType === "response") {
		if (version.startsWith("3.2")) return Response32Schema;
		if (version.startsWith("3.1")) return Response31Schema;
		if (version.startsWith("3.0")) return Response30Schema;
		return null;
	}

	if (docType === "header") {
		if (version.startsWith("3.2")) return Header32Schema;
		if (version.startsWith("3.1")) return Header31Schema;
		if (version.startsWith("3.0")) return Header30Schema;
		return null;
	}

	if (docType === "security-scheme") {
		if (version.startsWith("3.2")) return SecurityScheme32Schema;
		if (version.startsWith("3.1")) return SecurityScheme31Schema;
		if (version.startsWith("3.0")) return SecurityScheme30Schema;
		return null;
	}

	if (docType === "example") {
		if (version.startsWith("3.2")) return Example32Schema;
		if (version.startsWith("3.1")) return Example31Schema;
		if (version.startsWith("3.0")) return Example30Schema;
		return null;
	}

	if (docType === "link") {
		if (version.startsWith("3.2")) return Link32Schema;
		if (version.startsWith("3.1")) return Link31Schema;
		if (version.startsWith("3.0")) return Link30Schema;
		return null;
	}

	if (docType === "callback") {
		if (version.startsWith("3.2")) return Callback32Schema;
		if (version.startsWith("3.1")) return Callback31Schema;
		if (version.startsWith("3.0")) return Callback30Schema;
		return null;
	}

	if (docType === "components") {
		if (version.startsWith("3.2")) return Components32Schema;
		if (version.startsWith("3.1")) return Components31Schema;
		if (version.startsWith("3.0")) return Components30Schema;
		return null;
	}

	return null;
}

/**
 * Convert a JSON pointer path to a range in the document.
 * Uses IR for precise key-level ranges when available.
 */
function pathToRange(
	doc: ParsedDocument,
	path: (string | number)[],
	preferKey = false,
): Range | null {
	// Build JSON pointer from path
	const pointer =
		"#" +
		path
			.map((segment) => {
				const str = String(segment);
				return "/" + str.replace(/~/g, "~0").replace(/\//g, "~1");
			})
			.join("");

	// Try IR first for precise ranges
	if (doc.ir) {
		const node = findNodeByPointer(doc.ir, pointer);
		if (node?.loc) {
			const lineOffsets = doc._lineOffsets ?? buildLineOffsets(doc.rawText);
			const maxOffset = doc.rawText.length;

			const clampOffset = (v: number | undefined): number => {
				if (typeof v !== "number" || !Number.isFinite(v)) return 0;
				if (v <= 0) return 0;
				if (v >= maxOffset) return maxOffset;
				return v;
			};

			// Use key range if preferKey and available
			const rawStart =
				preferKey && node.loc.keyStart !== undefined
					? node.loc.keyStart
					: node.loc.start;
			const rawEnd =
				preferKey && node.loc.keyEnd !== undefined
					? node.loc.keyEnd
					: node.loc.end;

			const start = clampOffset(rawStart);
			let end = clampOffset(rawEnd);
			if (end < start) end = start;

			const startPos = getLineCol(start, lineOffsets);
			const endPos = getLineCol(end, lineOffsets);

			return {
				start: { line: startPos.line - 1, character: startPos.col - 1 },
				end: { line: endPos.line - 1, character: endPos.col - 1 },
			};
		}
	}

	// Fallback to sourceMap
	const range = doc.sourceMap.pointerToRange(pointer);
	if (range) {
		return range;
	}

	// Final fallback: document start
	return {
		start: { line: 0, character: 0 },
		end: { line: 0, character: 0 },
	};
}

/**
 * Extract the most actionable error from a union validation failure.
 * Prioritizes unrecognized_keys errors as they're most actionable.
 */
function extractBestUnionError(issue: ZodIssue): ZodIssue | null {
	if (issue.discriminator && issue.note) {
		return issue;
	}

	if (!issue.errors || issue.errors.length === 0) {
		return null;
	}

	// Flatten all errors from all union variants
	const allErrors = issue.errors.flat();
	if (allErrors.length === 0) {
		return null;
	}

	// Priority order for specificity:
	// 1. unrecognized_keys - User added an unknown field
	const unrecognized = allErrors.filter((e) => e.code === "unrecognized_keys");
	if (unrecognized.length > 0) {
		// Prefer the most actionable unrecognized_keys:
		// - Prefer fewer keys
		// - Prefer not blaming `$ref` when a sibling key is the real problem
		let best = unrecognized[0] as ZodIssue;
		let bestScore = Number.POSITIVE_INFINITY;
		for (const e of unrecognized) {
			const keys = e.keys ?? [];
			const includesRef = keys.includes("$ref");
			const score = keys.length + (includesRef ? 1000 : 0);
			if (score < bestScore) {
				best = e;
				bestScore = score;
			}
		}
		return best;
	}

	// 2. invalid_format - Clear format validation failure
	const invalidFormat = allErrors.find((e) => e.code === "invalid_format");
	if (invalidFormat) return invalidFormat;

	// 3. invalid_type - Type mismatch
	const invalidType = allErrors.find((e) => e.code === "invalid_type");
	if (invalidType) return invalidType;

	// 4. Return first error as fallback
	return allErrors[0] ?? null;
}

/**
 * Convert a Zod issue to an engine diagnostic.
 */
function zodIssueToDiagnostic(
	issue: ZodIssue,
	doc: ParsedDocument,
	rootSchema?: z.ZodType,
): EngineDiagnostic[] {
	const diagnostics: EngineDiagnostic[] = [];

	// Handle unrecognized_keys: create one diagnostic per key
	if (issue.code === "unrecognized_keys" && issue.keys) {
		for (const key of issue.keys) {
			if (key.startsWith("x-")) continue;
			const keyPath = [...issue.path, key];
			const range = pathToRange(doc, keyPath, true); // preferKey = true to highlight just the key

			// Build a clear message with best-effort suggestion
			const pathStr = keyPath.length > 0 ? ` at ${keyPath.join(".")}` : "";
			const suggestion =
				rootSchema ? suggestClosestKey(rootSchema, issue.path, key) : undefined;

			const message = suggestion
				? `Invalid key "${key}"${pathStr}. Did you mean "${suggestion}"?`
				: `Invalid key "${key}"${pathStr}.`;

			diagnostics.push({
				code: "structural-validation",
				source: "telescope",
				message,
				uri: doc.uri,
				range: range ?? {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
				},
				severity: DiagnosticSeverity.Error,
				data: suggestion
					? {
							kind: "invalid_key",
							from: key,
							to: suggestion,
					  }
					: undefined,
			});
		}
		return diagnostics;
	}

	// Handle record key validation failures (e.g. `paths` map keys)
	if (issue.code === "invalid_key") {
		const key = issue.path.length > 0 ? String(issue.path[issue.path.length - 1]) : "";
		let nestedMsg: string | undefined;
		if (Array.isArray(issue.issues) && issue.issues.length > 0) {
			const first = (issue.issues as unknown[])[0];
			if (Array.isArray(first)) {
				nestedMsg = (first[0] as { message?: string } | undefined)?.message;
			} else {
				nestedMsg = (first as { message?: string } | undefined)?.message;
			}
		}
		const message = nestedMsg
			? `Invalid key "${key}": ${nestedMsg}`
			: issue.message || `Invalid key "${key}"`;

		const range = pathToRange(doc, issue.path, true);
		diagnostics.push({
			code: "structural-validation",
			source: "telescope",
			message,
			uri: doc.uri,
			range: range ?? {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 0 },
			},
			severity: DiagnosticSeverity.Error,
		});
		return diagnostics;
	}

	// Handle invalid_union: extract best error
	if (issue.code === "invalid_union") {
		const bestError = extractBestUnionError(issue);
		if (bestError) {
			// Union branch errors are often reported with paths relative to the union input.
			// Preserve the full location by prefixing the parent union path.
			const merged: ZodIssue = {
				...bestError,
				path: [...issue.path, ...(bestError.path ?? [])],
			};
			return zodIssueToDiagnostic(merged, doc, rootSchema);
		}
	}

	// For other error types, create a single diagnostic
	const range = pathToRange(doc, issue.path);
	const message = issue.message || "Validation error";

	diagnostics.push({
		code: "structural-validation",
		source: "telescope",
		message,
		uri: doc.uri,
		range: range ?? {
			start: { line: 0, character: 0 },
			end: { line: 0, character: 0 },
		},
		severity: DiagnosticSeverity.Error,
	});

	return diagnostics;
}

// =============================================================================
// Suggestion helpers (schema-driven; no document walking)
// =============================================================================

function unwrapSchema(schema: z.ZodType): z.ZodType {
	// Peel common wrappers across Zod builds.
	// biome-ignore lint/suspicious/noExplicitAny: zod internals are untyped
	let current: any = schema;
	for (let i = 0; i < 10; i++) {
		const def = current?._def;
		const t: string | undefined = def?.type;
		if (t === "optional" || t === "default" || t === "nullable") {
			current = def?.innerType ?? current;
			continue;
		}
		if (t === "effects") {
			current = def?.schema ?? current;
			continue;
		}
		break;
	}
	return current as z.ZodType;
}

function getObjectShapeKeys(schema: z.ZodType): string[] {
	const unwrapped = unwrapSchema(schema);
	// biome-ignore lint/suspicious/noExplicitAny: tolerant access across zod versions
	const defType: string | undefined = (unwrapped as any)?._def?.type;
	if (defType !== "object") return [];
	// biome-ignore lint/suspicious/noExplicitAny: shape getter differs across versions
	const shape: Record<string, unknown> =
		typeof (unwrapped as any).shape === "function"
			? (unwrapped as any).shape()
			: (unwrapped as any).shape;
	return Object.keys(shape ?? {});
}

// NOTE: Zod v4 exposes both `$ZodType` and `ZodType` in typings depending on import style.
// For suggestion traversal we only need runtime introspection, so we keep the types loose.
// biome-ignore lint/suspicious/noExplicitAny: runtime-only schema traversal
function traverseSchemaToPath(schema: any, path: (string | number)[]): any | null {
	// biome-ignore lint/suspicious/noExplicitAny: runtime-only schema traversal
	let current: any = schema;
	for (const seg of path) {
		if (typeof seg !== "string") {
			// Only support object-key traversal for suggestion purposes.
			return null;
		}
		const unwrapped = unwrapSchema(current as z.ZodType);
		// biome-ignore lint/suspicious/noExplicitAny: tolerant access across zod versions
		const defType: string | undefined = (unwrapped as any)?._def?.type;

		if (defType === "object") {
			// biome-ignore lint/suspicious/noExplicitAny: shape getter differs across versions
			const shape: Record<string, z.ZodType> =
				typeof (unwrapped as any).shape === "function"
					? (unwrapped as any).shape()
					: (unwrapped as any).shape;
			const next = shape?.[seg];
			if (!next) return null;
			current = next;
			continue;
		}

		if (defType === "record") {
			// biome-ignore lint/suspicious/noExplicitAny: zod internals
			const rec: any = unwrapped as any;
			current = (rec.valueType ?? rec._def?.valueType ?? z.any()) as z.ZodType;
			continue;
		}

		if (unwrapped instanceof z.ZodUnion) {
			// Choose an option that can progress.
			let advanced: z.ZodType | null = null;
			// biome-ignore lint/suspicious/noExplicitAny: zod union options are runtime-only
			for (const opt of (unwrapped as any).options ?? []) {
				const candidate = traverseSchemaToPath(opt, [seg]);
				if (candidate) {
					advanced = candidate;
					break;
				}
			}
			if (!advanced) return null;
			current = advanced;
			continue;
		}

		// Unsupported for suggestion traversal.
		return null;
	}
	return current;
}

function suggestClosestKey(
	// biome-ignore lint/suspicious/noExplicitAny: runtime-only schema traversal
	rootSchema: any,
	objectPath: (string | number)[],
	invalidKey: string,
): string | undefined {
	// We want keys for the object containing the invalid key; `objectPath` already
	// refers to that object for `unrecognized_keys` issues.
	const objSchema = traverseSchemaToPath(rootSchema, objectPath);
	if (!objSchema) return undefined;

	const candidates = getObjectShapeKeys(objSchema).filter((k) => !k.startsWith("x-"));
	if (candidates.length === 0) return undefined;

	let best: string | undefined;
	let bestDist = Number.POSITIVE_INFINITY;
	for (const c of candidates) {
		const d = levenshtein(invalidKey, c);
		if (d < bestDist) {
			bestDist = d;
			best = c;
		}
	}

	// Be conservative: avoid suggesting nonsense.
	if (!best) return undefined;
	const maxAcceptable = Math.max(1, Math.floor(best.length * 0.5));
	if (bestDist > maxAcceptable) return undefined;
	return best;
}

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	const prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
	const curr: number[] = new Array<number>(b.length + 1).fill(0);

	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		const ca = a.charCodeAt(i - 1);
		for (let j = 1; j <= b.length; j++) {
			const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
			curr[j] = Math.min(
				prev[j]! + 1,
				curr[j - 1]! + 1,
				prev[j - 1]! + cost,
			);
		}
		for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
	}
	return prev[b.length]!;
}

/**
 * Validate a single document structurally using Zod schemas.
 *
 * @param doc - The parsed document to validate
 * @returns Array of engine diagnostics for structural issues
 */
export function validateDocumentStructure(
	doc: ParsedDocument,
	defaultVersion?: string,
): EngineDiagnostic[] {
	const docType = identifyDocumentType(doc.ast);
	if (docType === "unknown") {
		return [];
	}

	const version =
		typeof doc.version === "string" && doc.version !== "" && doc.version !== "unknown"
			? doc.version
			: defaultVersion || "";
	const schema = getSchemaForDocument(version, docType);
	if (!schema) {
		return [];
	}

	// Validate the document AST against the schema
	const result = schema.safeParse(stripXExtensions(doc.ast));
	const diagnostics: EngineDiagnostic[] = [];

	if (!result.success) {
		// Convert Zod errors to diagnostics
		const issues = (result.error as { issues: ZodIssue[] }).issues;

		for (const issue of issues) {
			diagnostics.push(...zodIssueToDiagnostic(issue, doc, schema));
		}
	}

	return diagnostics;
}

/**
 * Validate all documents in a project context structurally.
 *
 * @param docs - Map of document URIs to parsed documents
 * @returns Array of engine diagnostics for all structural issues
 */
export function validateProjectStructure(
	docs: Map<string, ParsedDocument>,
	defaultVersion?: string,
): EngineDiagnostic[] {
	const diagnostics: EngineDiagnostic[] = [];

	const inferredVersion =
		defaultVersion ??
		[...docs.values()].find((d) => identifyDocumentType(d.ast) === "root")?.version;

	for (const doc of docs.values()) {
		diagnostics.push(...validateDocumentStructure(doc, inferredVersion));
	}

	return diagnostics;
}

