/**
 * Hover Handler
 *
 * Provides hover information for OpenAPI documents by combining:
 * 1. YAML language service hover (base YAML structure info)
 * 2. OpenAPI-specific hover ($ref previews, schema info)
 *
 * @module lsp/handlers/hover
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { Hover, Position } from "vscode-languageserver-protocol";
import type { TextDocument } from "vscode-languageserver-textdocument";
import * as yaml from "yaml";
import type { ParsedDocument } from "../../engine/types.js";
import { identifyDocumentType } from "../../engine/utils/document-type-utils.js";
import { parseJsonPointer } from "../../engine/utils/pointer-utils.js";
import type { TelescopeContext } from "../context.js";
import type { CachedDocument, DocumentCache } from "../document-cache.js";
import { getYAMLService } from "../services/yaml-service.js";
import type { WorkspaceProject } from "../workspace/workspace-project.js";
import {
	findRefNodeAtOffset,
	getValueAtPath,
	isOpenAPIDocument,
	resolveRefTarget,
} from "./shared.js";

/**
 * Register hover handler on the connection.
 */
export function registerHoverHandler(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
	getProject?: () => WorkspaceProject,
): void {
	const logger = ctx.getLogger("Hover");
	const yamlService = getYAMLService();

	connection.onHover(async (params): Promise<Hover | null> => {
		try {
			const doc = documents.get(params.textDocument.uri);
			if (!doc) return null;

			// 1. Get YAML service hover (base - always try)
			const yamlHover = await yamlService.getHover(doc, params.position);

			// 2. Get OpenAPI-specific hover (if OpenAPI document)
			const cached = cache.get(doc);
			const openapiHover = isOpenAPIDocument(cached)
				? await provideOpenAPIHover(
						cached,
						params.position,
						cache,
						getProject ? getProject() : undefined,
					)
				: null;

			// 3. Merge results - OpenAPI takes priority but YAML is fallback
			return mergeHoverResults(yamlHover, openapiHover);
		} catch (error) {
			logger.error(
				`Hover failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return null;
		}
	});
}

/**
 * Merge YAML and OpenAPI hover results.
 * OpenAPI hover takes priority if it has content.
 * If both have content, combine them.
 */
function mergeHoverResults(
	yamlHover: Hover | null,
	openapiHover: Hover | null,
): Hover | null {
	// If only one has content, return it
	if (!openapiHover && yamlHover) return yamlHover;
	if (!yamlHover && openapiHover) return openapiHover;
	if (!yamlHover && !openapiHover) return null;

	// Both have content - prefer OpenAPI but could combine
	// For now, OpenAPI takes priority since it has richer $ref info
	if (openapiHover) return openapiHover;

	return yamlHover;
}

/**
 * Provide OpenAPI-specific hover information at a position.
 * This handles $ref previews and other OpenAPI-specific info.
 */
async function provideOpenAPIHover(
	cached: CachedDocument,
	position: Position,
	cache: DocumentCache,
	project?: WorkspaceProject,
): Promise<Hover | null> {
	// Convert position to offset
	const offset = cache.positionToOffset(cached, position);

	// Find $ref node at this position
	const refNode = findRefNodeAtOffset(cached.ir.root, offset, cache, cached);

	if (!refNode || typeof refNode.value !== "string") {
		return null;
	}

	const refValue = refNode.value;
	const refRange = cache.locToRange(cached, refNode.loc);
	if (!refRange) return null;

	// Get preview content
	const preview = await getRefPreview(cached, refValue, cache, project);
	if (!preview) return null;

	return {
		contents: {
			kind: "markdown",
			value: preview,
		},
		range: refRange,
	};
}

/**
 * Get a preview of the referenced content.
 */
async function getRefPreview(
	cached: CachedDocument,
	refValue: string,
	cache: DocumentCache,
	project?: WorkspaceProject,
): Promise<string | null> {
	// Don't preview external URLs
	if (/^https?:/i.test(refValue)) {
		return `**External Reference**\n\n\`${refValue}\``;
	}

	const { targetUri, pointer } = resolveRefTarget(cached.uri, refValue);

	// Try to get content from cache
	let targetDoc: CachedDocument | undefined;
	if (targetUri === cached.uri) {
		targetDoc = cached;
	} else {
		targetDoc = cache.getByUri(targetUri);
	}

	const path = parseJsonPointer(pointer);

	if (!targetDoc && project) {
		const loaded = await project
			.getDocumentTypeCache()
			.getDocument(targetUri, project.getFileSystem());
		if (loaded) {
			const value = getValueAtPointerInParsedDoc(loaded, path);
			if (value === undefined) {
				return `**Reference**\n\n\`${refValue}\`\n\n*Target not found*`;
			}
			return formatPreview(value, pointer, targetUri, loaded.format);
		}
	}

	if (!targetDoc) {
		return `**Reference**\n\n\`${refValue}\`\n\n*Target file not loaded*`;
	}

	const value = getValueAtPointerInDoc(targetDoc, path);

	if (value === undefined) {
		return `**Reference**\n\n\`${refValue}\`\n\n*Target not found*`;
	}

	return formatPreview(value, pointer, targetUri, targetDoc.format);
}

/**
 * Get value at a pointer path in a cached document.
 */
function getValueAtPointerInDoc(
	doc: CachedDocument,
	path: (string | number)[],
): unknown {
	if (doc.format === "yaml" && doc.ast instanceof yaml.Document) {
		const node = doc.ast.getIn(path, true);
		if (node && typeof node === "object" && "toJSON" in node) {
			return (node as yaml.Node).toJSON();
		}
		return node;
	}

	// JSON - use parsed object
	return getValueAtPath(doc.parsedObject, path);
}

function getValueAtPointerInParsedDoc(
	doc: ParsedDocument,
	path: (string | number)[],
): unknown {
	return getValueAtPath(doc.ast, path);
}

/**
 * Format the preview as markdown.
 */
function formatPreview(
	value: unknown,
	pointer: string,
	filePath: string,
	format: "yaml" | "json",
): string {
	const fileName = filePath.split("/").pop() || filePath;

	const header = pointer
		? `**${fileName}** \`#${pointer}\``
		: `**${fileName}**`;
	const details = formatRefDetails(value);

	const lang = format;
	let serialized =
		format === "yaml"
			? yaml.stringify(value, { indent: 2 }).trim()
			: JSON.stringify(value, null, 2);

	// Keep excerpt short and readable
	const maxLines = 12;
	const lines = serialized.split("\n");
	if (lines.length > maxLines) {
		serialized = lines.slice(0, maxLines).join("\n") + "\n# … truncated";
	}

	return `${header}\n\n${details}\n\n\`\`\`${lang}\n${serialized}\n\`\`\``;
}

function formatRefDetails(value: unknown): string {
	if (!value || typeof value !== "object") {
		return `Type: \`${typeof value}\``;
	}

	const obj = value as Record<string, unknown>;
	const kind = identifyDocumentType(obj);

	const lines: string[] = [];

	// High-level kind / type
	lines.push(`**Kind**: ${kind}`);

	const desc =
		typeof obj.description === "string" ? obj.description : undefined;
	if (desc) {
		lines.push("", `**Description**: ${escapeInline(desc)}`);
	}

	// Key fields (rich but compact)
	const bullets: string[] = [];

	// Parameter-ish fields
	if (kind === "parameter") {
		const name = typeof obj.name === "string" ? obj.name : undefined;
		const loc = typeof obj.in === "string" ? obj.in : undefined;
		if (name) bullets.push(`- **name**: \`${name}\``);
		if (loc) bullets.push(`- **in**: \`${loc}\``);
		if (typeof obj.required === "boolean") {
			bullets.push(`- **required**: \`${String(obj.required)}\``);
		}
	}

	// Schema-ish fields
	const schemaType = typeof obj.type === "string" ? obj.type : undefined;
	if (schemaType) bullets.push(`- **type**: \`${schemaType}\``);
	if (typeof obj.format === "string")
		bullets.push(`- **format**: \`${obj.format}\``);

	if (schemaType === "array" && obj.items && typeof obj.items === "object") {
		const items = obj.items as Record<string, unknown>;
		const itemType = typeof items.type === "string" ? items.type : undefined;
		bullets.push(`- **items**: \`${itemType ?? identifyDocumentType(items)}\``);
	}

	const required = Array.isArray(obj.required)
		? (obj.required.filter((v) => typeof v === "string") as string[])
		: [];
	if (required.length > 0) {
		const preview = required.slice(0, 5).join(", ");
		const suffix = required.length > 5 ? ", …" : "";
		bullets.push(
			`- **required**: ${required.length} (\`${preview}${suffix}\`)`,
		);
	}

	const props = obj.properties;
	if (props && typeof props === "object") {
		const count = Object.keys(props as object).length;
		bullets.push(`- **properties**: ${count}`);
	}

	const en = obj.enum;
	if (Array.isArray(en)) {
		const preview = en
			.slice(0, 5)
			.map((v) => JSON.stringify(v))
			.join(", ");
		const suffix = en.length > 5 ? ", …" : "";
		bullets.push(`- **enum**: ${en.length} (${preview}${suffix})`);
	}

	if (bullets.length > 0) {
		lines.push("", bullets.join("\n"));
	}

	return lines.join("\n");
}

function escapeInline(text: string): string {
	// Keep markdown reasonably safe; avoid accidental formatting from backticks.
	return text.replace(/`/g, "\\`");
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

export function __testFormatRefDetails(value: unknown): string {
	return formatRefDetails(value);
}

export function __testFormatPreview(
	value: unknown,
	pointer: string,
	filePath: string,
	format: "yaml" | "json",
): string {
	return formatPreview(value, pointer, filePath, format);
}
