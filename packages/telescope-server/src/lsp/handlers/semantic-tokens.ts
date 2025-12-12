/**
 * Semantic Tokens Handler
 *
 * Provides semantic highlighting for OpenAPI documents.
 *
 * @module lsp/handlers/semantic-tokens
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type {
	Range,
	SemanticTokens,
	SemanticTokensLegend,
} from "vscode-languageserver-protocol";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { TelescopeContext } from "../context.js";
import type { CachedDocument, DocumentCache } from "../document-cache.js";
import { findAllRefNodes, isOpenAPIDocument } from "./shared.js";

/**
 * Semantic token types.
 */
export const SEMANTIC_TOKEN_TYPES = [
	"namespace", // 0: paths
	"type", // 1: schemas
	"class", // 2: components
	"enum", // 3: status codes
	"interface", // 4: parameters
	"struct", // 5: request bodies
	"typeParameter", // 6: path parameters
	"parameter", // 7: query parameters
	"variable", // 8: $ref values
	"property", // 9: properties
	"function", // 10: operationId
	"method", // 11: HTTP methods
	"macro", // 12: security schemes
	"keyword", // 13: schema types
	"modifier", // 14: deprecated
	"string", // 15: media types
];

/**
 * Semantic token modifiers.
 */
export const SEMANTIC_TOKEN_MODIFIERS = [
	"declaration", // 0
	"definition", // 1
	"readonly", // 2
	"deprecated", // 3
	"modification", // 4
];

/**
 * Get the semantic tokens legend.
 */
export function getSemanticTokensLegend(): SemanticTokensLegend {
	return {
		tokenTypes: SEMANTIC_TOKEN_TYPES,
		tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
	};
}

/**
 * Register semantic token handlers on the connection.
 */
export function registerSemanticTokenHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
): void {
	connection.languages.semanticTokens.on((params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return { data: [] };

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return { data: [] };

		return provideSemanticTokens(cached, cache, ctx);
	});

	connection.languages.semanticTokens.onRange((params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return { data: [] };

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return { data: [] };

		return provideSemanticTokens(cached, cache, ctx, params.range);
	});
}

/**
 * Test hook: expose semantic token generation for unit tests.
 */
export function __testProvideSemanticTokens(
	cached: CachedDocument,
	cache: DocumentCache,
	ctx: TelescopeContext,
	range?: Range,
): SemanticTokens {
	return provideSemanticTokens(cached, cache, ctx, range);
}

interface TokenData {
	line: number;
	char: number;
	length: number;
	tokenType: number;
	tokenModifiers: number;
}

/**
 * Provide semantic tokens for a document.
 */
function provideSemanticTokens(
	cached: CachedDocument,
	cache: DocumentCache,
	_ctx: TelescopeContext,
	range?: Range,
): SemanticTokens {
	const tokens: TokenData[] = [];
	const ast = cached.parsedObject as Record<string, unknown>;

	// Add tokens for paths
	const paths = ast.paths as Record<string, unknown> | undefined;
	if (paths) {
		const methods = [
			"get",
			"post",
			"put",
			"patch",
			"delete",
			"options",
			"head",
		];

		for (const [path, pathItem] of Object.entries(paths)) {
			if (!pathItem || typeof pathItem !== "object") continue;

			// Path string (key) - namespace
			addPathToken(cached, cache, ["paths", path], 0, tokens, range);

			// Path parameters in the path string
			addPathParameterTokens(
				cached,
				cache,
				path,
				["paths", path],
				tokens,
				range,
			);

			for (const method of methods) {
				const operation = (pathItem as Record<string, unknown>)[method] as
					| Record<string, unknown>
					| undefined;
				if (!operation) continue;

				// HTTP method (key) - method type
				addKeyToken(cached, cache, ["paths", path, method], 11, tokens, range);

				// operationId (value) - function
				if (operation.operationId) {
					addValueToken(
						cached,
						cache,
						["paths", path, method, "operationId"],
						10,
						tokens,
						range,
					);
				}

				// Response status codes (keys) - enum
				const responses = operation.responses as
					| Record<string, unknown>
					| undefined;
				if (responses) {
					for (const code of Object.keys(responses)) {
						addKeyToken(
							cached,
							cache,
							["paths", path, method, "responses", code],
							3,
							tokens,
							range,
						);
					}
				}

				// Security - macro
				const security = operation.security as
					| Array<Record<string, unknown>>
					| undefined;
				if (security) {
					for (let i = 0; i < security.length; i++) {
						const secReq = security[i];
						for (const _scheme of Object.keys(secReq)) {
							// The security scheme name would need a more specific range lookup
							// For now, skip this complex case
						}
					}
				}

				// Deprecated - modifier
				if (operation.deprecated === true) {
					const deprecatedKeyRange = cache.getKeyRange(cached, [
						"paths",
						path,
						method,
						"deprecated",
					]);
					if (!deprecatedKeyRange) continue;
					if (!isInRange(deprecatedKeyRange, range)) continue;
					if (deprecatedKeyRange.start.line !== deprecatedKeyRange.end.line)
						continue;
					const length =
						deprecatedKeyRange.end.character -
						deprecatedKeyRange.start.character;
					if (length <= 0) continue;

					tokens.push({
						line: deprecatedKeyRange.start.line,
						char: deprecatedKeyRange.start.character,
						length,
						tokenType: 14,
						tokenModifiers: 0,
					});
				}
			}
		}
	}

	// Add tokens for $ref values
	const refs = findAllRefNodes(cached.ir.root);
	for (const { node } of refs) {
		if (node.loc) {
			const nodeRange = cache.locToRange(cached, node.loc);
			if (nodeRange && isInRange(nodeRange, range)) {
				tokens.push({
					line: nodeRange.start.line,
					char: nodeRange.start.character,
					length:
						nodeRange.end.character - nodeRange.start.character ||
						(typeof node.value === "string" ? node.value.length : 0),
					tokenType: 8, // variable
					tokenModifiers: 0,
				});
			}
		}
	}

	// Add tokens for component schemas
	const components = ast.components as Record<string, unknown> | undefined;
	if (components?.schemas) {
		const schemas = components.schemas as Record<string, unknown>;
		for (const [name, schema] of Object.entries(schemas)) {
			// Schema name (key) - type
			addKeyToken(
				cached,
				cache,
				["components", "schemas", name],
				1,
				tokens,
				range,
			);

			// Schema type keyword (value)
			if (schema && typeof schema === "object") {
				const schemaObj = schema as Record<string, unknown>;
				if (schemaObj.type) {
					addValueToken(
						cached,
						cache,
						["components", "schemas", name, "type"],
						13,
						tokens,
						range,
					);
				}
			}
		}
	}

	// Add tokens for security schemes
	if (components?.securitySchemes) {
		const schemes = components.securitySchemes as Record<string, unknown>;
		for (const name of Object.keys(schemes)) {
			addKeyToken(
				cached,
				cache,
				["components", "securitySchemes", name],
				12,
				tokens,
				range,
			);
		}
	}

	// Sort tokens by position
	tokens.sort((a, b) => {
		if (a.line !== b.line) return a.line - b.line;
		return a.char - b.char;
	});

	// Convert to delta encoding
	return {
		data: encodeTokens(tokens),
	};
}

/**
 * Add a token for a key at a JSON-pointer-ish path.
 *
 * For YAML, this correctly targets the mapping key (not the value node).
 */
function addKeyToken(
	cached: CachedDocument,
	cache: DocumentCache,
	path: (string | number)[],
	tokenType: number,
	tokens: TokenData[],
	filterRange?: Range,
): void {
	const keyRange = cache.getKeyRange(cached, path);
	if (!keyRange) return;
	if (!isInRange(keyRange, filterRange)) return;

	// Semantic tokens must not span lines.
	if (keyRange.start.line !== keyRange.end.line) return;

	const length = keyRange.end.character - keyRange.start.character;
	if (length <= 0) return;

	tokens.push({
		line: keyRange.start.line,
		char: keyRange.start.character,
		length,
		tokenType,
		tokenModifiers: 0,
	});
}

/**
 * Add a token for a value at a JSON-pointer-ish path.
 */
function addValueToken(
	cached: CachedDocument,
	cache: DocumentCache,
	path: (string | number)[],
	tokenType: number,
	tokens: TokenData[],
	filterRange?: Range,
): void {
	const valueRange = cache.getRange(cached, path);
	if (!valueRange) return;
	if (!isInRange(valueRange, filterRange)) return;

	// Semantic tokens must not span lines.
	if (valueRange.start.line !== valueRange.end.line) return;

	const length = valueRange.end.character - valueRange.start.character;
	if (length <= 0) return;

	tokens.push({
		line: valueRange.start.line,
		char: valueRange.start.character,
		length,
		tokenType,
		tokenModifiers: 0,
	});
}

/**
 * Add a token for a path string (key).
 */
function addPathToken(
	cached: CachedDocument,
	cache: DocumentCache,
	path: (string | number)[],
	tokenType: number,
	tokens: TokenData[],
	filterRange?: Range,
): void {
	addKeyToken(cached, cache, path, tokenType, tokens, filterRange);
}

/**
 * Add tokens for path parameters in a path string.
 */
function addPathParameterTokens(
	cached: CachedDocument,
	cache: DocumentCache,
	path: string,
	basePath: (string | number)[],
	tokens: TokenData[],
	filterRange?: Range,
): void {
	const keyRange = cache.getKeyRange(cached, basePath);
	if (!keyRange) return;
	if (!isInRange(keyRange, filterRange)) return;
	if (keyRange.start.line !== keyRange.end.line) return;

	// Find {param} patterns in the path
	const paramPattern = /\{([^}]+)\}/g;
	let match: RegExpExecArray | null = paramPattern.exec(path);

	while (match !== null) {
		const paramStart = match.index;
		const paramLength = match[0].length;

		tokens.push({
			line: keyRange.start.line,
			char: keyRange.start.character + paramStart,
			length: paramLength,
			tokenType: 6, // typeParameter
			tokenModifiers: 0,
		});

		match = paramPattern.exec(path);
	}
}

/**
 * Check if a range is within a filter range.
 */
function isInRange(nodeRange: Range, filterRange?: Range): boolean {
	if (!filterRange) return true;

	return (
		nodeRange.start.line >= filterRange.start.line &&
		nodeRange.end.line <= filterRange.end.line
	);
}

/**
 * Encode tokens to LSP delta format.
 */
function encodeTokens(tokens: TokenData[]): number[] {
	const data: number[] = [];
	let prevLine = 0;
	let prevChar = 0;

	for (const token of tokens) {
		const deltaLine = token.line - prevLine;
		const deltaChar = deltaLine === 0 ? token.char - prevChar : token.char;

		data.push(
			deltaLine,
			deltaChar,
			token.length,
			token.tokenType,
			token.tokenModifiers,
		);

		prevLine = token.line;
		prevChar = token.char;
	}

	return data;
}
