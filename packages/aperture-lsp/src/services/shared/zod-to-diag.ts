import type { Diagnostic } from "@volar/language-server";
import { closest } from "fastest-levenshtein";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import type { Document, Node } from "yaml";
import * as yaml from "yaml";
import { z } from "zod";

/**
 * Convert Zod schema parsing errors into Volar diagnostic events.
 * Maps Zod error paths (e.g., ["OpenAPI", "rules", 0, "rule"]) to actual
 * line/character positions in the YAML document using the YAML CST.
 *
 * @param zodError - The ZodError from schema validation
 * @param ast - The parsed YAML AST/Document
 * @param lineCounter - The LineCounter used when parsing the document
 * @param source - Optional source identifier for the diagnostics (default: "zod-schema")
 * @param schema - Optional Zod schema to use for "Did you mean..." suggestions
 * @returns Array of Volar Diagnostic objects with proper ranges and messages
 */
export function zodErrorsToDiagnostics(
	zodError: z.ZodError,
	ast: Document,
	lineCounter: yaml.LineCounter,
	source: string = "zod-schema",
	schema?: z.ZodType,
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	if (!ast || !ast.contents) {
		// If we can't access AST contents, return a single diagnostic at the start
		return [
			{
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
				},
				message: zodError.message,
				severity: DiagnosticSeverity.Error,
				source,
			},
		];
	}

	for (const issue of zodError.issues) {
		const issues = zodIssueToDiagnostic(
			issue,
			ast,
			lineCounter,
			source,
			schema,
		);
		diagnostics.push(...issues);
	}

	return diagnostics;
}

/**
 * Convert a single Zod issue to a Volar diagnostic.
 */
function zodIssueToDiagnostic(
	issue: z.core.$ZodIssue,
	ast: Document,
	lineCounter: yaml.LineCounter,
	source: string,
	schema?: z.ZodType,
): Diagnostic[] {
	// Convert Zod path (PropertyKey[]) to (string | number)[]
	const path = issue.path.map((p: PropertyKey) =>
		typeof p === "symbol" ? String(p) : p,
	) as (string | number)[];

	// Find the node in the YAML CST that corresponds to this path
	const node = findNodeByPath(ast.contents, path);

	if (issue.code === "invalid_type") {
		console.log(issue);
		// Handle missing required keys logic
		const parentPath = path.slice(0, -1);
		const parentNode = findNodeByPath(ast.contents, parentPath);

		// If it's a missing property on an object, mark the parent object
		if (parentNode) {
			const range = getNodeRange(parentNode, lineCounter);
			if (range) {
				return [
					{
						range,
						message: formatZodIssueMessage(issue, false),
						severity: DiagnosticSeverity.Error,
						source,
						code: String(issue.code),
					},
				];
			}
		}
	}

	if (issue.code === "unrecognized_keys" && node && yaml.isMap(node)) {
		const diagnostics: Diagnostic[] = [];

		// Get valid keys for the path if schema is provided
		let validKeys: string[] = [];
		if (schema) {
			validKeys = getValidKeysForPath(schema, path);
		}

		for (const key of issue.keys) {
			// Find specific key node in the map
			const keyNode = node.items.find(
				(pair) => yaml.isScalar(pair.key) && pair.key.value === key,
			)?.key as Node | undefined;

			if (keyNode) {
				const range = getNodeRange(keyNode, lineCounter);
				if (range) {
					// Check for suggestions
					let suggestion = "";
					if (validKeys.length > 0) {
						console.log(key, validKeys);
						const match = closest(key, validKeys);
						suggestion = `. Did you mean "${match}"?`;
					}

					diagnostics.push({
						range,
						message: `Unrecognized key: "${key}"${suggestion}`,
						severity: DiagnosticSeverity.Error,
						source,
						code: String(issue.code),
					});
				}
			}
		}

		// If we found specific keys, return them
		if (diagnostics.length > 0) {
			return diagnostics;
		}
	}

	if (!node) {
		// Fallback: create diagnostic at document start with path info
		return [
			{
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
				},
				message: formatZodIssueMessage(issue, true),
				severity: DiagnosticSeverity.Error,
				source,
				code: String(issue.code),
			},
		];
	}

	// Get position from the YAML node
	const range = getNodeRange(node, lineCounter);
	if (!range) {
		return [];
	}

	return [
		{
			range,
			message: formatZodIssueMessage(issue, false),
			severity: DiagnosticSeverity.Error,
			source,
			code: String(issue.code),
		},
	];
}

/**
 * Find a YAML node by traversing the path array.
 * Path format: ["OpenAPI", "rules", 0, "rule"]
 */
function findNodeByPath(
	node: Node | null | undefined,
	path: (string | number)[],
): Node | null {
	if (!node || path.length === 0) {
		return node || null;
	}

	const [key, ...rest] = path;

	if (yaml.isMap(node)) {
		// Find the key in the map
		for (const item of node.items) {
			if (yaml.isScalar(item.key) && item.key.value === key) {
				// If rest is empty, we found the target node
				if (rest.length === 0) {
					// For simple scalars, return the value node for better range
					// For objects/arrays, return the value node which contains the structure
					// If the value is null/undefined (implicit), return the key node?
					// Zod "invalid_type" with received "undefined" implies missing key IF we are looking for it?
					// But findNodeByPath is traversing EXISTING nodes.
					// If a key exists but value is missing/null, item.value is null or a Null node.
					return item.value || item.key || (item as any);
				}
				return findNodeByPath(item.value as Node, rest);
			}
		}
	} else if (yaml.isSeq(node)) {
		// Access array by index
		if (typeof key === "number" && key >= 0 && key < node.items.length) {
			const item = node.items[key];
			// If rest is empty, we found the target item
			if (rest.length === 0) {
				return item as Node;
			}
			return findNodeByPath(item as Node, rest);
		}
	} else if (yaml.isPair(node)) {
		// Handle pair nodes
		if (yaml.isScalar(node.key) && node.key.value === key) {
			if (rest.length === 0) {
				return (node.value || node.key || node) as Node;
			}
			return findNodeByPath(node.value as Node, rest);
		}
	}

	return null;
}

/**
 * Get the range (line/character positions) for a YAML node.
 */
function getNodeRange(
	node: Node,
	lineCounter: yaml.LineCounter,
): {
	start: { line: number; character: number };
	end: { line: number; character: number };
} | null {
	// Get the range from the node's CST
	const range = node.range;
	if (!range) {
		return null;
	}

	const [startOffset, endOffset] = range;

	// Convert byte offsets to line/character positions
	const startPos = lineCounter.linePos(startOffset);
	const endPos = lineCounter.linePos(endOffset);

	if (!startPos || !endPos) {
		return null;
	}

	return {
		start: {
			line: startPos.line - 1, // Convert to 0-based
			character: startPos.col - 1, // Convert to 0-based
		},
		end: {
			line: endPos.line - 1,
			character: endPos.col - 1,
		},
	};
}

/**
 * Format a Zod issue into a user-friendly diagnostic message.
 */
function formatZodIssueMessage(
	issue: z.core.$ZodIssue,
	includePath: boolean,
): string {
	const pathStr =
		includePath && issue.path.length > 0
			? ` at ${issue.path.map((p) => String(p)).join(".")}`
			: "";

	const appendMessage = (base: string) => {
		if (
			!issue.message ||
			issue.message === "Invalid input" ||
			issue.message === "Required"
		) {
			return base;
		}
		return `${base}. ${issue.message}`;
	};

	switch (issue.code) {
		case "invalid_type": {
			const expected = issue.expected || "unknown type";
			const received = getType(issue.input);
			return appendMessage(
				`Expected ${expected}, received ${received}${pathStr}`,
			);
		}

		case "unrecognized_keys": {
			const keys = (issue.keys || []).join(", ");
			const keyWord = issue.keys?.length === 1 ? "key" : "keys";
			return appendMessage(`Unrecognized ${keyWord}: ${keys}${pathStr}`);
		}

		case "invalid_value": {
			const options = (issue.values || []).join(", ") || "valid options";
			return appendMessage(
				`Invalid value. Expected one of: ${options}${pathStr}`,
			);
		}

		case "invalid_format": {
			const format = issue.format;
			if (format === "email") {
				return appendMessage(`Invalid email format${pathStr}`);
			}
			if (format === "url") {
				return appendMessage(`Invalid URL format${pathStr}`);
			}
			if (format === "uuid") {
				return appendMessage(`Invalid UUID format${pathStr}`);
			}
			if (format === "regex") {
				return appendMessage(
					`String does not match required pattern${pathStr}`,
				);
			}
			return appendMessage(`Invalid format: ${format}${pathStr}`);
		}

		case "too_small": {
			const origin = issue.origin || "value";
			const min = issue.minimum;
			const inclusive = issue.inclusive !== false;
			const minStr =
				min !== undefined
					? `${inclusive ? "at least" : "more than"} ${min}`
					: "";
			return appendMessage(
				`${
					origin.charAt(0).toUpperCase() + origin.slice(1)
				} is too small${pathStr}. Expected ${minStr}`,
			);
		}

		case "too_big": {
			const origin = issue.origin || "value";
			const max = issue.maximum;
			const inclusive = issue.inclusive !== false;
			const maxStr =
				max !== undefined
					? `${inclusive ? "at most" : "less than"} ${max}`
					: "";
			return appendMessage(
				`${
					origin.charAt(0).toUpperCase() + origin.slice(1)
				} is too large${pathStr}. Expected ${maxStr}`,
			);
		}

		case "custom": {
			return issue.message || `Validation failed${pathStr}`;
		}

		case "invalid_union": {
			return appendMessage(`Invalid value${pathStr}`);
		}

		case "not_multiple_of": {
			const multipleOf = issue.divisor;
			return appendMessage(
				`Number must be a multiple of ${multipleOf}${pathStr}`,
			);
		}

		default: {
			return issue.message || `Validation error${pathStr}`;
		}
	}
}

/**
 * Get the type of a value as a string (similar to Zod's util.getParsedType)
 */
function getType(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (typeof value === "string") return "string";
	if (typeof value === "number") return Number.isNaN(value) ? "nan" : "number";
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "symbol") return "symbol";
	if (Array.isArray(value)) return "array";
	if (value instanceof Date) return "date";
	if (value instanceof Error) return "error";
	if (typeof value === "object") return "object";
	if (typeof value === "function") return "function";
	return "unknown";
}

/**
 * Traverse a Zod schema to find valid keys for a specific path.
 */
function getValidKeysForPath(
	schema: z.core.$ZodType,
	path: (string | number)[],
): string[] {
	if (!schema) return [];

	if (path.length === 0) {
		if (schema instanceof z.ZodObject) {
			return Object.keys(schema.shape);
		}
		if (schema instanceof z.ZodUnion) {
			const allKeys = new Set<string>();
			for (const option of schema.options) {
				const keys = getValidKeysForPath(option, []);
				keys.forEach((k) => {
					allKeys.add(k);
				});
			}
			return Array.from(allKeys);
		}
		if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
			return getValidKeysForPath(schema.unwrap(), []);
		}
		return [];
	}

	const [head, ...tail] = path;

	if (schema instanceof z.ZodObject) {
		const shape = schema.shape;
		if (typeof head === "string" && shape[head]) {
			return getValidKeysForPath(shape[head], tail);
		}
		return [];
	}

	if (schema instanceof z.ZodArray) {
		return getValidKeysForPath(schema.element, tail);
	}

	if (schema instanceof z.ZodUnion) {
		const allKeys = new Set<string>();
		for (const option of schema.options) {
			const keys = getValidKeysForPath(option, path);
			keys.forEach((k) => {
				allKeys.add(k);
			});
		}
		return Array.from(allKeys);
	}

	if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
		return getValidKeysForPath(schema.unwrap(), path);
	}

	if (schema instanceof z.ZodRecord) {
		return getValidKeysForPath(schema.valueType, tail);
	}

	return [];
}
