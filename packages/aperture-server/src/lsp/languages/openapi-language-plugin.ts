/**
 * OpenAPI Language Plugin - Handles openapi-yaml and openapi-json documents.
 *
 * This plugin creates OpenAPIVirtualCode instances which include:
 * - Embedded DataVirtualCode for format-specific language services (yaml/json)
 * - Embedded MarkdownVirtualCode for description fields (YAML only)
 * - IR (Intermediate Representation) for rule execution
 * - Atoms extraction for operations, components, etc.
 *
 * @module lsp/languages/openapi-language-plugin
 */

import type { IScriptSnapshot, LanguagePlugin } from "@volar/language-core";
import type * as jsonc from "jsonc-parser";
import type { URI } from "vscode-uri";
import * as yaml from "yaml";
import type { ApertureVolarContext } from "../workspace/context";
import {
	buildJsonStringMapping,
	type JsonStringMapping,
	MarkdownVirtualCode,
	type OpenAPILanguageId,
	OpenAPIVirtualCode,
} from "./virtualCodes";

/**
 * Create the OpenAPI language plugin for openapi-yaml and openapi-json documents.
 *
 * This plugin handles only the dedicated OpenAPI languageIds. It creates
 * OpenAPIVirtualCode instances with embedded codes for format-specific
 * language services and markdown descriptions.
 *
 * @param shared - The shared Aperture context
 * @returns LanguagePlugin instance
 */
export function createOpenAPILanguagePlugin(
	shared: ApertureVolarContext,
): LanguagePlugin<URI, OpenAPIVirtualCode> {
	const logger = shared.getLogger("OpenAPI-Plugin");
	logger.log("Creating OpenAPI Language Plugin");

	function createVirtualCode(
		uri: URI,
		languageId: string,
		snapshot: IScriptSnapshot,
	): OpenAPIVirtualCode | undefined {
		// Only handle OpenAPI languageIds
		if (languageId !== "openapi-yaml" && languageId !== "openapi-json") {
			return undefined;
		}

		const path = uri.toString();

		const vc = new OpenAPIVirtualCode(
			snapshot,
			languageId as OpenAPILanguageId,
		);

		// Register with workspace index for cross-document features
		shared.workspaceIndex.registerVirtualCode(path, vc);

		// Add embedded markdown codes for description fields
		const rawText = snapshot.getText(0, snapshot.getLength());

		// Use the AST to find descriptions accurately
		const descriptions = findDescriptionsUsingAst(vc.ast, vc.format, rawText);

		for (const desc of descriptions) {
			const mdVC = new MarkdownVirtualCode(`desc_${desc.offset}`, desc.lines);
			vc.embeddedCodes.push(mdVC);
		}

		return vc;
	}

	return {
		getLanguageId(_uri) {
			// This is rarely called since the client provides the languageId.
			// For OpenAPI files, the client classifies them on open.
			return undefined;
		},
		createVirtualCode,
		updateVirtualCode(
			uri: URI,
			virtualCode: OpenAPIVirtualCode,
			newSnapshot: IScriptSnapshot,
		) {
			// Try incremental update first
			if (virtualCode.update(newSnapshot)) {
				const path = uri.toString();

				// Re-register with workspace index (may need to update refs)
				shared.workspaceIndex.registerVirtualCode(path, virtualCode);

				// If markdown codes couldn't be updated incrementally, regenerate them
				if (virtualCode.markdownCodesDirty) {
					regenerateMarkdownCodes(virtualCode, newSnapshot);
					virtualCode.clearMarkdownCodesDirty();
				}

				return virtualCode;
			}

			// Fall back to full recreation if incremental update fails
			return createVirtualCode(uri, virtualCode.languageId, newSnapshot);
		},
	};
}

/**
 * Regenerate markdown codes for description fields after incremental update.
 * Called when markdown codes couldn't be updated in place.
 */
function regenerateMarkdownCodes(
	vc: OpenAPIVirtualCode,
	snapshot: IScriptSnapshot,
): void {
	// Remove existing markdown codes (keep format code)
	vc.embeddedCodes = vc.embeddedCodes.filter(
		(code) => code.id === "format" || !(code instanceof MarkdownVirtualCode),
	);

	// Re-extract descriptions from AST and create new markdown codes
	const rawText = snapshot.getText(0, snapshot.getLength());
	const descriptions = findDescriptionsUsingAst(vc.ast, vc.format, rawText);

	for (const desc of descriptions) {
		const mdVC = new MarkdownVirtualCode(`desc_${desc.offset}`, desc.lines);
		vc.embeddedCodes.push(mdVC);
	}
}

// ============================================================================
// Description Field Extraction
// ============================================================================
//
// These functions extract "description" fields from YAML/JSON ASTs and map
// them back to precise source locations. This is used to create embedded
// Markdown virtual codes for description fields in OpenAPI documents.
//
// The challenge: YAML and JSON parsers give us the *decoded* string value,
// but we need the *source* byte offsets to create accurate mappings. This is
// complicated by:
//   - YAML block scalars (| and >) which strip indentation
//   - JSON escape sequences (\n, \", \\, etc.)
//   - Multi-line strings that span multiple source lines
// ============================================================================

/**
 * Represents a single line/segment of content within a description field,
 * mapped to its exact position in the source document.
 * This interface is compatible with MarkdownSegment.
 */
interface DescriptionLine {
	/** Byte offset in source where this line's content starts */
	start: number;
	/** Length of the content in source bytes (includes escape sequences for JSON) */
	sourceLength: number;
	/** The decoded content of this line */
	content: string;
	/** JSON string mapping for position translation (JSON only) */
	jsonMapping?: JsonStringMapping;
}

/**
 * Represents a complete description field found in the document,
 * with all its lines mapped to source positions.
 */
interface DescriptionResult {
	/** Byte offset where the description value starts in source */
	offset: number;
	/** Individual lines of the description with source mappings */
	lines: DescriptionLine[];
}

/**
 * Find all "description" fields in a YAML or JSON AST and map them to source positions.
 *
 * This is the main entry point that dispatches to format-specific implementations.
 * The results are used to create embedded Markdown virtual codes for rich
 * description editing with syntax highlighting and validation.
 *
 * @param ast - The parsed AST (yaml.Document for YAML, jsonc.Node for JSON)
 * @param format - Either "yaml" or "json"
 * @param sourceText - The complete source text of the document
 * @returns Array of description results with precise source mappings
 */
function findDescriptionsUsingAst(
	ast: jsonc.Node | yaml.Document,
	format: "yaml" | "json",
	sourceText: string,
): DescriptionResult[] {
	if (format === "yaml" && ast instanceof yaml.Document) {
		return findYamlDescriptions(ast, sourceText);
	}

	if (format === "json" && ast) {
		return findJsonDescriptions(ast as jsonc.Node, sourceText);
	}

	return [];
}

// ============================================================================
// YAML Description Extraction
// ============================================================================

/**
 * Extract all "description" fields from a YAML document.
 *
 * YAML has several string representations that need special handling:
 * - Plain scalars: `description: Hello world`
 * - Quoted scalars: `description: "Hello world"` or `description: 'Hello world'`
 * - Block literals: `description: |` (preserves newlines)
 * - Block folded: `description: >` (folds newlines to spaces)
 *
 * Block scalars are particularly tricky because the parser strips indentation,
 * so we must search the source text to find the actual content positions.
 *
 * @param ast - The parsed YAML document
 * @param sourceText - The complete source text
 * @returns Array of description results
 */
function findYamlDescriptions(
	ast: yaml.Document,
	sourceText: string,
): DescriptionResult[] {
	const results: DescriptionResult[] = [];

	yaml.visit(ast, {
		Pair(_, pair) {
			// Check if this is a "description" key with a string value
			if (!isDescriptionPair(pair)) return;

			const scalar = pair.value as yaml.Scalar;
			const value = scalar.value as string;
			const range = scalar.range; // [start, end, nodeEnd]

			if (!range) return;

			const result = processYamlScalar(scalar, value, range, sourceText);
			if (result) {
				results.push(result);
			}
		},
	});

	return results;
}

/**
 * Check if a YAML Pair node is a "description" key with a string value.
 */
function isDescriptionPair(pair: yaml.Pair): boolean {
	return (
		pair.key !== null &&
		typeof pair.key === "object" &&
		"value" in pair.key &&
		typeof pair.key.value === "string" &&
		pair.key.value === "description" &&
		yaml.isScalar(pair.value) &&
		typeof pair.value.value === "string"
	);
}

/**
 * Process a YAML scalar value and create source mappings for its content.
 *
 * @param scalar - The YAML scalar node
 * @param value - The decoded string value
 * @param range - The source range [start, end, nodeEnd]
 * @param sourceText - The complete source text
 * @returns A description result, or null if processing fails
 */
function processYamlScalar(
	scalar: yaml.Scalar,
	value: string,
	range: [number, number, number?],
	sourceText: string,
): DescriptionResult | null {
	// Block scalars (| or >) require line-by-line mapping
	if (scalar.type === "BLOCK_LITERAL" || scalar.type === "BLOCK_FOLDED") {
		return processYamlBlockScalar(value, range, sourceText);
	}

	// Plain and quoted scalars use simple mapping
	return processYamlSimpleScalar(value, range, sourceText);
}

/**
 * Process a YAML block scalar (| or >) with line-by-line source mapping.
 *
 * Block scalars are challenging because:
 * 1. The range starts at the | or > character
 * 2. Content starts on the next line with indentation
 * 3. The parser strips the indentation from the decoded value
 * 4. We must search for each line's content in the source
 *
 * @param value - The decoded string value (indentation stripped)
 * @param range - The source range [start, end, nodeEnd]
 * @param sourceText - The complete source text
 * @returns A description result with line-by-line mappings
 */
function processYamlBlockScalar(
	value: string,
	range: [number, number, number?],
	sourceText: string,
): DescriptionResult {
	const lines: DescriptionLine[] = [];
	let searchIndex = range[0];

	// Skip past the block indicator line (e.g., "|", "|-", ">+")
	while (searchIndex < range[1] && sourceText[searchIndex] !== "\n") {
		searchIndex++;
	}
	searchIndex++; // Skip the newline itself

	// Map each decoded line to its source position
	const valueLines = value.split("\n");

	for (const line of valueLines) {
		if (line.length === 0) {
			// Empty lines: skip to the next newline in source
			const nextNewline = sourceText.indexOf("\n", searchIndex);
			if (nextNewline !== -1 && nextNewline < range[1]) {
				searchIndex = nextNewline + 1;
			}
			continue;
		}

		// Find this line's content in the source (after indentation)
		const matchIndex = sourceText.indexOf(line, searchIndex);

		if (matchIndex !== -1 && matchIndex < range[1]) {
			// For YAML, sourceLength equals content length (1:1 mapping)
			lines.push({
				start: matchIndex,
				sourceLength: line.length,
				content: line,
			});
			searchIndex = matchIndex + line.length;
		}
	}

	return { offset: range[0], lines };
}

/**
 * Process a plain or quoted YAML scalar with simple source mapping.
 *
 * For these scalar types, the content is usually on a single line
 * and maps directly to the source (with quote adjustment if needed).
 *
 * @param value - The decoded string value
 * @param range - The source range [start, end, nodeEnd]
 * @param sourceText - The complete source text
 * @returns A description result
 */
function processYamlSimpleScalar(
	value: string,
	range: [number, number, number?],
	sourceText: string,
): DescriptionResult {
	// Check if the value starts with a quote character
	const startsWithQuote = ['"', "'"].includes(sourceText[range[0]] || "");
	const contentStart = range[0] + (startsWithQuote ? 1 : 0);

	// For YAML, sourceLength equals content length (1:1 mapping)
	return {
		offset: range[0],
		lines: [
			{
				start: contentStart,
				sourceLength: value.length,
				content: value,
			},
		],
	};
}

// ============================================================================
// JSON Description Extraction
// ============================================================================

/**
 * Extract all "description" fields from a JSON document.
 *
 * JSON strings always use double quotes and have well-defined escape sequences.
 * Multi-line content is represented as `\n` in the source, which we must
 * account for when calculating source positions.
 *
 * @param ast - The parsed JSON AST root node
 * @param sourceText - The complete source text
 * @returns Array of description results
 */
function findJsonDescriptions(
	ast: jsonc.Node,
	sourceText: string,
): DescriptionResult[] {
	const results: DescriptionResult[] = [];
	walkJsonNode(ast, sourceText, results);
	return results;
}

/**
 * Recursively walk a JSON AST node to find all "description" properties.
 *
 * JSON AST structure:
 * - Objects have children that are "property" nodes
 * - Property nodes have 2 children: [keyNode, valueNode]
 * - Arrays have children that are the array elements
 *
 * @param node - The current JSON AST node
 * @param sourceText - The complete source text
 * @param results - Array to collect results (mutated)
 */
function walkJsonNode(
	node: jsonc.Node,
	sourceText: string,
	results: DescriptionResult[],
): void {
	if (node.type === "object" && node.children) {
		for (const child of node.children) {
			processJsonProperty(child, sourceText, results);
		}
	} else if (node.type === "array" && node.children) {
		// Recurse into array items
		for (const child of node.children) {
			walkJsonNode(child, sourceText, results);
		}
	}
}

/**
 * Process a JSON property node, extracting description if applicable.
 *
 * @param property - The JSON property node
 * @param sourceText - The complete source text
 * @param results - Array to collect results (mutated)
 */
function processJsonProperty(
	property: jsonc.Node,
	sourceText: string,
	results: DescriptionResult[],
): void {
	// Property nodes must have exactly 2 children: [key, value]
	if (
		property.type !== "property" ||
		!property.children ||
		property.children.length !== 2
	) {
		return;
	}

	const keyNode = property.children[0];
	const valueNode = property.children[1];

	if (!keyNode || !valueNode) return;

	// Check if this is a "description" property with a string value
	if (
		keyNode.type === "string" &&
		keyNode.value === "description" &&
		valueNode.type === "string" &&
		typeof valueNode.value === "string"
	) {
		const result = processJsonStringValue(valueNode, sourceText);
		if (result) {
			results.push(result);
		}
	}

	// Always recurse into the value (it might contain nested descriptions)
	walkJsonNode(valueNode, sourceText, results);
}

/**
 * Process a JSON string value node and create source mappings.
 *
 * JSON strings are always quoted, so content starts at offset + 1.
 * We create a single segment for the entire string with a JsonStringMapping
 * attached for accurate position translation within escape sequences.
 *
 * @param valueNode - The JSON string value node
 * @param sourceText - The complete source text
 * @returns A description result with a single segment containing JsonStringMapping
 */
function processJsonStringValue(
	valueNode: jsonc.Node,
	sourceText: string,
): DescriptionResult {
	const value = valueNode.value as string;
	// JSON strings always have quotes, so content starts at offset + 1
	const contentStart = valueNode.offset + 1;
	// Length excludes the quotes
	const sourceLength = valueNode.length - 2;

	// Build JsonStringMapping for bidirectional position translation
	const jsonMapping = buildJsonStringMapping(
		sourceText,
		contentStart,
		sourceLength,
	);

	// Create a single segment for the entire description
	return {
		offset: valueNode.offset,
		lines: [
			{
				start: contentStart,
				sourceLength: sourceLength,
				content: value,
				jsonMapping: jsonMapping,
			},
		],
	};
}
