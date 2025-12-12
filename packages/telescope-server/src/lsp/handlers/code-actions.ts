/**
 * Code Actions Handler
 *
 * Provides quick fixes and refactorings for OpenAPI documents.
 *
 * @module lsp/handlers/code-actions
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type {
	CodeAction,
	CodeActionKind,
	CodeActionParams,
	Range,
	TextEdit,
} from "vscode-languageserver-protocol";

import type { DocumentCache, CachedDocument } from "../document-cache.js";
import type { TelescopeContext } from "../context.js";
import { isOpenAPIDocument } from "./shared.js";

/**
 * Register code action handlers on the connection.
 */
export function registerCodeActionHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
): void {
	connection.onCodeAction((params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return [];

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return [];

		return provideCodeActions(cached, params, cache, ctx);
	});
}

/**
 * Provide code actions for diagnostics.
 */
function provideCodeActions(
	cached: CachedDocument,
	params: CodeActionParams,
	cache: DocumentCache,
	ctx: TelescopeContext,
): CodeAction[] {
	const actions: CodeAction[] = [];
	const text = cached.content;
	const isYaml = cached.format === "yaml";

	// Process each diagnostic
	for (const diagnostic of params.context.diagnostics) {
		const code = String(diagnostic.code ?? "");

		// Add missing description
		if (
			code.includes("description") ||
			diagnostic.message.toLowerCase().includes("description")
		) {
			actions.push(
				createAddFieldAction(
					"Add description",
					cached.uri,
					params.range.start,
					"description",
					"TODO: Add description",
					isYaml,
					text,
					diagnostic,
				),
			);
		}

		// Add missing summary
		if (
			code.includes("summary") ||
			diagnostic.message.toLowerCase().includes("summary")
		) {
			actions.push(
				createAddFieldAction(
					"Add summary",
					cached.uri,
					params.range.start,
					"summary",
					"TODO: Add summary",
					isYaml,
					text,
					diagnostic,
				),
			);
		}

		// Add missing operationId
		if (
			code.includes("operationId") ||
			code.includes("operation-id") ||
			diagnostic.message.toLowerCase().includes("operationid")
		) {
			const suggestedId = generateOperationId(cached, params.range.start);
			actions.push(
				createAddFieldAction(
					`Add operationId: "${suggestedId}"`,
					cached.uri,
					params.range.start,
					"operationId",
					suggestedId,
					isYaml,
					text,
					diagnostic,
				),
			);
		}

		// Convert to kebab-case
		if (
			code.includes("kebab") ||
			diagnostic.message.toLowerCase().includes("kebab")
		) {
			const kebabAction = createKebabCaseAction(
				cached.uri,
				diagnostic.range,
				text,
				diagnostic,
			);
			if (kebabAction) {
				actions.push(kebabAction);
			}
		}
	}

	return actions;
}

/**
 * Create an action to add a field.
 */
function createAddFieldAction(
	title: string,
	uri: string,
	position: { line: number; character: number },
	fieldName: string,
	fieldValue: string,
	isYaml: boolean,
	text: string,
	diagnostic: any,
): CodeAction {
	// Calculate indentation
	const lines = text.split("\n");
	const line = lines[position.line] ?? "";
	const indent = line.match(/^(\s*)/)?.[1] ?? "";

	let insertText: string;
	if (isYaml) {
		insertText = `${indent}${fieldName}: "${fieldValue}"\n`;
	} else {
		insertText = `${indent}"${fieldName}": "${fieldValue}",\n`;
	}

	const edit: TextEdit = {
		range: {
			start: { line: position.line + 1, character: 0 },
			end: { line: position.line + 1, character: 0 },
		},
		newText: insertText,
	};

	return {
		title,
		kind: "quickfix" as CodeActionKind,
		diagnostics: [diagnostic],
		edit: {
			changes: {
				[uri]: [edit],
			},
		},
	};
}

/**
 * Generate an operationId from context.
 */
function generateOperationId(
	cached: CachedDocument,
	position: { line: number; character: number },
): string {
	// Try to find the HTTP method and path from context
	const lines = cached.content.split("\n");
	const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

	let method = "unknown";
	let path = "unknown";

	// Look backwards for method
	for (let i = position.line; i >= Math.max(0, position.line - 10); i--) {
		const line = lines[i]?.trim().toLowerCase() ?? "";
		for (const m of methods) {
			if (line.startsWith(`${m}:`) || line === m) {
				method = m;
				break;
			}
		}
		if (method !== "unknown") break;
	}

	// Look further back for path
	for (let i = position.line; i >= Math.max(0, position.line - 20); i--) {
		const line = lines[i] ?? "";
		const pathMatch = line.match(/^(\s*)['"]?(\/[^'":\s]+)['"]?:/);
		if (pathMatch) {
			path = pathMatch[2];
			break;
		}
	}

	// Convert path to camelCase identifier
	const pathParts = path
		.split("/")
		.filter((p) => p && !p.startsWith("{"))
		.map((p) => p.replace(/[^a-zA-Z0-9]/g, ""));

	const pathName = pathParts
		.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
		.join("");

	return `${method}${pathName.charAt(0).toUpperCase()}${pathName.slice(1)}`;
}

/**
 * Create an action to convert to kebab-case.
 */
function createKebabCaseAction(
	uri: string,
	range: Range,
	text: string,
	diagnostic: any,
): CodeAction | null {
	// Extract the path from the range
	const lines = text.split("\n");
	const line = lines[range.start.line];
	if (!line) return null;

	const pathMatch = line.match(/['"]?(\/[^'":\s]+)['"]?/);
	if (!pathMatch) return null;

	const originalPath = pathMatch[1];
	const kebabPath = toKebabCase(originalPath);

	if (originalPath === kebabPath) return null;

	const newLine = line.replace(originalPath, kebabPath);

	return {
		title: `Convert to kebab-case: ${kebabPath}`,
		kind: "quickfix" as CodeActionKind,
		diagnostics: [diagnostic],
		edit: {
			changes: {
				[uri]: [
					{
						range: {
							start: { line: range.start.line, character: 0 },
							end: { line: range.start.line, character: line.length },
						},
						newText: newLine,
					},
				],
			},
		},
	};
}

/**
 * Convert a path to kebab-case.
 */
function toKebabCase(path: string): string {
	return path
		.split("/")
		.map((segment) => {
			if (segment.startsWith("{") && segment.endsWith("}")) {
				// Keep path parameters as-is
				return segment;
			}
			// Convert camelCase/PascalCase to kebab-case
			return segment
				.replace(/([a-z])([A-Z])/g, "$1-$2")
				.replace(/_/g, "-")
				.toLowerCase();
		})
		.join("/");
}

