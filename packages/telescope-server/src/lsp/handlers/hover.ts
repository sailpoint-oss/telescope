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
import * as jsonc from "jsonc-parser";
import * as yaml from "yaml";
import type { ParsedDocument } from "../../engine/types.js";
import { specLink, type SpecVersion } from "../../engine/schemas/spec-meta.js";
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

type OpenApiScope = Pick<TelescopeContext, "isOpenApiInScope">;

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

			const project = getProject ? getProject() : undefined;
			const allowHover = await shouldAllowHoverForUri(
				doc.uri,
				ctx,
				project,
			);
			if (!allowHover) {
				// Per scoping: do not provide any hover for out-of-scope standalone/root docs.
				return null;
			}

			const cached = cache.get(doc);
			const openapiHoverAllowed =
				isOpenAPIDocument(cached) ||
				// If we're here and the file is out-of-scope, allow OpenAPI hover only when
				// it is connected to an in-scope root (e.g., referenced fragment).
				(!ctx.isOpenApiInScope(doc.uri) &&
					(await isReferencedFromInScopeRoot(doc.uri, ctx, project)));

			if (isOpenAPIDocument(cached)) {
				// Ensure YAML service hover/completions are driven by the correct schema for this doc.
				yamlService.configureForDocument(cached);
			}

			// 1. YAML service hover:
			// - Only for in-scope OpenAPI docs (so out-of-scope files never get schema-driven hover).
			const yamlHover = ctx.isOpenApiInScope(doc.uri)
				? await yamlService.getHover(doc, params.position)
				: null;

			// 2. Get OpenAPI-specific hover (if OpenAPI doc or referenced from in-scope root)
			const openapiHover = openapiHoverAllowed
				? await provideOpenAPIHover(
						cached,
						params.position,
						cache,
						project,
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

async function shouldAllowHoverForUri(
	uri: string,
	ctx: OpenApiScope,
	project?: WorkspaceProject,
): Promise<boolean> {
	if (ctx.isOpenApiInScope(uri)) return true;
	// Out-of-scope: only allow hover if it is connected to an in-scope root.
	return await isReferencedFromInScopeRoot(uri, ctx, project);
}

async function isReferencedFromInScopeRoot(
	uri: string,
	ctx: OpenApiScope,
	project?: WorkspaceProject,
): Promise<boolean> {
	if (!project) return false;
	try {
		const lintingContext = await project.resolveLintingContext(
			uri,
			project.getFileSystem(),
			{ useProjectCache: true },
		);
		const roots = lintingContext.rootUris ?? [];
		return roots.some((r) => ctx.isOpenApiInScope(r));
	} catch {
		return false;
	}
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

	// Both have content - prefer OpenAPI first (richer), but preserve YAML as extra context.
	const openMd = hoverContentsToMarkdown(openapiHover?.contents);
	const yamlMd = hoverContentsToMarkdown(yamlHover?.contents);
	const combined = [openMd, yamlMd].filter(Boolean).join("\n\n---\n\n");
	if (!combined) return null;

	return {
		contents: { kind: "markdown", value: combined },
		range: openapiHover?.range ?? yamlHover?.range,
	};
}

type MarkdownHover = { kind: "markdown"; value: string };

function hoverContentsToMarkdown(contents: Hover["contents"] | undefined): string {
	if (!contents) return "";
	if (typeof contents === "string") return contents;
	if (Array.isArray(contents)) {
		return contents
			.map((c) => (typeof c === "string" ? c : c.value))
			.filter(Boolean)
			.join("\n\n");
	}
	if (typeof contents === "object" && "kind" in contents && "value" in contents) {
		return (contents as MarkdownHover).value ?? "";
	}
	return "";
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
		// Not a $ref hover; attempt key hover spec link.
		const keyAtPos = findKeyAtPosition(cached, position, cache);
		if (!keyAtPos) return null;
		const spec = resolveSpecLinkForKey(cached, keyAtPos.path);
		if (!spec) return null;
		return {
			contents: { kind: "markdown", value: renderSpecLinkMarkdown(spec) },
			range: keyAtPos.range,
		};
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

type KeyAtPosition = {
	path: (string | number)[];
	range: import("vscode-languageserver-protocol").Range;
};

function findKeyAtPosition(
	cached: CachedDocument,
	position: Position,
	cache: DocumentCache,
): KeyAtPosition | null {
	const offset = cache.positionToOffset(cached, position);

	if (cached.format === "json") {
		const loc = jsonc.getLocation(cached.content, offset);
		if (!loc.isAtPropertyKey) return null;
		const path = loc.path as (string | number)[];
		const range = cache.getKeyRange(cached, path);
		if (!range) return null;
		return { path, range };
	}

	// YAML
	if (!(cached.ast instanceof yaml.Document)) return null;
	const root = cached.ast.contents as yaml.Node | null;
	const path = findYamlKeyPathAtOffset(root, offset, []);
	if (!path) return null;
	const range = cache.getKeyRange(cached, path);
	if (!range) return null;
	return { path, range };
}

function findYamlKeyPathAtOffset(
	node: yaml.Node | null,
	offset: number,
	path: (string | number)[],
): (string | number)[] | null {
	if (!node) return null;

	if (yaml.isMap(node)) {
		for (const pair of node.items) {
			const keyNode = pair.key;
			if (yaml.isScalar(keyNode) && Array.isArray(keyNode.range)) {
				const [start, end] = keyNode.range;
				if (
					typeof start === "number" &&
					typeof end === "number" &&
					offset >= start &&
					offset <= end
				) {
					return [...path, String(keyNode.value)];
				}
			}

			if (yaml.isScalar(keyNode)) {
				const nextPath = [...path, String(keyNode.value)];
				const found = findYamlKeyPathAtOffset(
					pair.value as yaml.Node | null,
					offset,
					nextPath,
				);
				if (found) return found;
			} else {
				const found = findYamlKeyPathAtOffset(
					pair.value as yaml.Node | null,
					offset,
					path,
				);
				if (found) return found;
			}
		}
		return null;
	}

	if (yaml.isSeq(node)) {
		for (let i = 0; i < node.items.length; i++) {
			const child = node.items[i] as yaml.Node | null;
			const found = findYamlKeyPathAtOffset(child, offset, [...path, i]);
			if (found) return found;
		}
		return null;
	}

	return null;
}

type SpecLinkInfo = {
	version: SpecVersion;
	anchor: string;
	url: string;
	label: string;
};

function resolveSpecLinkForKey(
	cached: CachedDocument,
	keyPath: (string | number)[],
): SpecLinkInfo | null {
	if (keyPath.length === 0) return null;
	const key = keyPath[keyPath.length - 1];
	if (typeof key !== "string") return null;

	const version = detectSpecVersion(cached.parsedObject, cached.openapiVersion);

	if (key.startsWith("x-")) {
		const { url } = specLink(version, "specification-extensions");
		return {
			version,
			anchor: "specification-extensions",
			url,
			label: version === "2.0" ? "Vendor Extensions" : "Specification Extensions",
		};
	}

	if (key === "$ref") {
		const { url } = specLink(version, "reference-object");
		return { version, anchor: "reference-object", url, label: "Reference Object" };
	}

	// Value-aware: when hovering a map-entry key (like `components.schemas.Pet`),
	// prefer identifying the type of the value at that path.
	const valueAtPath = getValueAtPath(cached.parsedObject, keyPath);
	const valueKind = identifyDocumentType(valueAtPath);
	if (valueKind !== "root" && valueKind !== "unknown") {
		const anchor = anchorForKindAndKey(valueKind, key, version);
		if (anchor) {
			const { url } = specLink(version, anchor);
			return { version, anchor, url, label: labelForAnchor(anchor, version) };
		}
	}

	for (let i = keyPath.length - 1; i >= 0; i--) {
		const containerPath = keyPath.slice(0, i);
		const containerValue =
			containerPath.length === 0
				? cached.parsedObject
				: getValueAtPath(cached.parsedObject, containerPath);
		const kind = identifyDocumentType(containerValue);
		const anchor = anchorForKindAndKey(kind, key, version);
		if (anchor) {
			const { url } = specLink(version, anchor);
			return { version, anchor, url, label: labelForAnchor(anchor, version) };
		}
	}

	const rootAnchor = version === "2.0" ? "swagger-object" : "openapi-object";
	const { url } = specLink(version, rootAnchor);
	return { version, anchor: rootAnchor, url, label: labelForAnchor(rootAnchor, version) };
}

function anchorForKindAndKey(
	kind: ReturnType<typeof identifyDocumentType>,
	key: string,
	version: SpecVersion,
): string | null {
	if (kind === "root") {
		if (key === "paths") return "paths-object";
		if (key === "components") return "components-object";
		if (key === "tags") return "tag-object";
		if (key === "security") return "security-requirement-object";
		return version === "2.0" ? "swagger-object" : "openapi-object";
	}

	switch (kind) {
		case "path-item":
			return "path-item-object";
		case "operation":
			return "operation-object";
		case "schema":
		case "json-schema":
			return "schema-object";
		case "parameter":
			return "parameter-object";
		case "response":
			return "response-object";
		case "request-body":
			return "request-body-object";
		case "header":
			return "header-object";
		case "security-scheme":
			return "security-scheme-object";
		case "example":
			return "example-object";
		case "link":
			return "link-object";
		case "callback":
			return "callback-object";
		case "components":
			return "components-object";
		default:
			return null;
	}
}

function detectSpecVersion(obj: unknown, fallbackOpenapiVersion: string): SpecVersion {
	if (obj && typeof obj === "object") {
		const rec = obj as Record<string, unknown>;
		if (typeof rec.swagger === "string" && rec.swagger.startsWith("2.")) return "2.0";
		if (typeof rec.openapi === "string") {
			const m = rec.openapi.match(/^(\d+)\.(\d+)/);
			const mm = m ? `${m[1]}.${m[2]}` : "";
			if (mm === "3.0" || mm === "3.1" || mm === "3.2") return mm as SpecVersion;
		}
	}

	const m = fallbackOpenapiVersion.match(/^(\d+)\.(\d+)/);
	const mm = m ? `${m[1]}.${m[2]}` : "";
	if (mm === "2.0" || mm === "3.0" || mm === "3.1" || mm === "3.2") return mm as SpecVersion;
	return "3.1";
}

function labelForAnchor(anchor: string, version: SpecVersion): string {
	switch (anchor) {
		case "swagger-object":
			return "Swagger Object";
		case "openapi-object":
			return "OpenAPI Object";
		case "paths-object":
			return "Paths Object";
		case "path-item-object":
			return "Path Item Object";
		case "operation-object":
			return "Operation Object";
		case "components-object":
			return "Components Object";
		case "schema-object":
			return "Schema Object";
		case "parameter-object":
			return "Parameter Object";
		case "response-object":
			return "Response Object";
		case "request-body-object":
			return "Request Body Object";
		case "header-object":
			return "Header Object";
		case "security-scheme-object":
			return "Security Scheme Object";
		case "security-requirement-object":
			return "Security Requirement Object";
		case "tag-object":
			return "Tag Object";
		case "example-object":
			return "Example Object";
		case "link-object":
			return "Link Object";
		case "callback-object":
			return "Callback Object";
		case "reference-object":
			return "Reference Object";
		case "specification-extensions":
			return version === "2.0" ? "Vendor Extensions" : "Specification Extensions";
		default:
			return anchor;
	}
}

function renderSpecLinkMarkdown(link: SpecLinkInfo): string {
	return `**Spec**: [${link.label}](${link.url})`;
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

export function __testProvideSpecLinkHover(
	cached: CachedDocument,
	position: Position,
	cache: DocumentCache,
): Hover | null {
	const keyAtPos = findKeyAtPosition(cached, position, cache);
	if (!keyAtPos) return null;
	const spec = resolveSpecLinkForKey(cached, keyAtPos.path);
	if (!spec) return null;
	return {
		contents: { kind: "markdown", value: renderSpecLinkMarkdown(spec) },
		range: keyAtPos.range,
	};
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------
export async function __testShouldAllowHoverForUri(
	uri: string,
	ctx: OpenApiScope,
	project?: WorkspaceProject,
): Promise<boolean> {
	return await shouldAllowHoverForUri(uri, ctx, project);
}
