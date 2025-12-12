/**
 * Code Lens Handler
 *
 * Provides code lenses for OpenAPI documents showing reference counts, etc.
 *
 * @module lsp/handlers/code-lens
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { CodeLens } from "vscode-languageserver-protocol";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { TelescopeContext } from "../context.js";
import type { CachedDocument, DocumentCache } from "../document-cache.js";
import type { ReferencesIndex } from "../services/references-index.js";
import { isOpenAPIDocument } from "./shared.js";

/**
 * Register code lens handlers on the connection.
 */
export function registerCodeLensHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
	getReferencesIndex: () => ReferencesIndex,
): void {
	connection.onCodeLens(async (params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return [];

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return [];

		return await provideCodeLenses(cached, cache, ctx, getReferencesIndex());
	});
}

/**
 * Provide code lenses for a document.
 */
async function provideCodeLenses(
	cached: CachedDocument,
	cache: DocumentCache,
	_ctx: TelescopeContext,
	referencesIndex: ReferencesIndex,
): Promise<CodeLens[]> {
	const lenses: CodeLens[] = [];
	const ast = cached.parsedObject as Record<string, unknown>;

	// -----------------------------------------------------------------------
	// File header (identity + external usage) - rendered above first line
	// -----------------------------------------------------------------------
	const headerRange = {
		start: { line: 0, character: 0 },
		end: { line: 0, character: 0 },
	};
	const kind = formatKindLabel(cached.documentType);
	const version =
		typeof ast?.openapi === "string" && ast.openapi
			? `OpenAPI ${ast.openapi}`
			: `OpenAPI ${cached.openapiVersion}`;

	lenses.push({
		range: headerRange,
		command: { title: `${kind} - ${version}`, command: "" },
	});

	// Only count refs from other files for the file header usage lens.
	const externalInbound = await referencesIndex.getInboundRefsWithOptions(
		cached.uri,
		{
			excludeSelf: true,
		},
	);
	const externalRefs = externalInbound.locations.length;
	const externalFiles = externalInbound.byFile.size;
	if (externalRefs > 0) {
		lenses.push({
			range: headerRange,
			command: {
				title: `Used by: ${externalRefs} refs (${externalFiles} files)`,
				command: "telescope.showReferences",
				arguments: [cached.uri, headerRange.start, externalInbound.locations],
			},
		});
	}

	// Add reference counts for components
	const components = ast?.components as Record<string, unknown> | undefined;
	if (components) {
		// Count refs for schemas
		const schemas = components.schemas as Record<string, unknown> | undefined;
		if (schemas) {
			for (const [name, _schema] of Object.entries(schemas)) {
				const pointer = `/components/schemas/${name}`;
				const range = cache.getRange(cached, ["components", "schemas", name]);

				if (!range) continue;

				// Required summary (codelens)
				const schemaObj = schemas[name] as Record<string, unknown> | undefined;
				const required =
					schemaObj && typeof schemaObj === "object"
						? (schemaObj.required as string[] | undefined)
						: undefined;
				if (required && required.length > 0) {
					const preview = required.slice(0, 5).join(", ");
					const suffix = required.length > 5 ? ", …" : "";
					lenses.push({
						range,
						command: {
							title: `Required: ${required.length}${preview ? ` (${preview}${suffix})` : ""}`,
							command: "",
						},
					});
				}

				const inbound = await referencesIndex.getInboundRefsToPointer(
					cached.uri,
					pointer,
				);
				const refsCount = inbound.locations.length;
				const filesCount = inbound.byFile.size;
				if (refsCount <= 0) continue;

				const internalRefs = inbound.internalLocations.length;
				const internalFiles = inbound.internalByFile.size;
				const externalRefs = inbound.externalLocations.length;
				const externalFiles = inbound.externalByFile.size;
				lenses.push({
					range,
					command: {
						title: `Internal: ${internalRefs} (${internalFiles} files) • External: ${externalRefs} (${externalFiles} files)`,
						command: "",
					},
				});

				lenses.push({
					range,
					command: {
						title: `${refsCount} refs (${filesCount} files)`,
						command: "telescope.showReferences",
						arguments: [cached.uri, range.start, inbound.locations],
					},
				});
			}
		}

		// Count refs for parameters
		const parameters = components.parameters as
			| Record<string, unknown>
			| undefined;
		if (parameters) {
			for (const [name, _param] of Object.entries(parameters)) {
				const pointer = `/components/parameters/${name}`;
				const range = cache.getRange(cached, [
					"components",
					"parameters",
					name,
				]);

				if (!range) continue;

				const inbound = await referencesIndex.getInboundRefsToPointer(
					cached.uri,
					pointer,
				);
				const refsCount = inbound.locations.length;
				const filesCount = inbound.byFile.size;
				if (refsCount <= 0) continue;

				const internalRefs = inbound.internalLocations.length;
				const internalFiles = inbound.internalByFile.size;
				const externalRefs = inbound.externalLocations.length;
				const externalFiles = inbound.externalByFile.size;
				lenses.push({
					range,
					command: {
						title: `Internal: ${internalRefs} (${internalFiles} files) • External: ${externalRefs} (${externalFiles} files)`,
						command: "",
					},
				});

				lenses.push({
					range,
					command: {
						title: `${refsCount} refs (${filesCount} files)`,
						command: "telescope.showReferences",
						arguments: [cached.uri, range.start, inbound.locations],
					},
				});
			}
		}
	}

	// Standalone schema file required summary as CodeLens (file-level atom)
	if (cached.documentType === "schema") {
		const required = (ast.required as string[] | undefined) ?? [];
		if (required.length > 0) {
			const preview = required.slice(0, 5).join(", ");
			const suffix = required.length > 5 ? ", …" : "";
			lenses.push({
				range: headerRange,
				command: {
					title: `Required: ${required.length}${preview ? ` (${preview}${suffix})` : ""}`,
					command: "",
				},
			});
		}
	}

	// Add response summary for operations
	const paths = ast?.paths as Record<string, unknown> | undefined;
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

			for (const method of methods) {
				const operation = (pathItem as Record<string, unknown>)[method] as
					| Record<string, unknown>
					| undefined;
				if (!operation) continue;

				const responses = operation.responses as
					| Record<string, unknown>
					| undefined;
				if (responses) {
					const allCodes = Object.keys(responses);
					const hasDefault = allCodes.includes("default");
					const codes = allCodes.filter((c) => c !== "default");
					const range = cache.getRange(cached, ["paths", path, method]);

					if (range && codes.length > 0) {
						const summary = formatResponseSummary(codes, hasDefault);
						lenses.push({
							range,
							command: {
								title: summary,
								command: "",
							},
						});
					}
				}

				// Add params lens
				const paramsSummary = formatParamsSummary(
					pathItem as Record<string, unknown>,
					operation,
				);
				if (paramsSummary) {
					const range = cache.getRange(cached, ["paths", path, method]);
					if (range) {
						lenses.push({
							range,
							command: { title: paramsSummary, command: "" },
						});
					}
				}

				// Add request body lens
				const bodySummary = formatBodySummary(operation);
				if (bodySummary) {
					const range = cache.getRange(cached, ["paths", path, method]);
					if (range) {
						lenses.push({
							range,
							command: { title: bodySummary, command: "" },
						});
					}
				}

				// Add security lens
				const security = operation.security as
					| Array<Record<string, unknown>>
					| undefined;
				if (security && security.length > 0) {
					const schemes = security
						.flatMap((s) => Object.keys(s))
						.filter((v, i, a) => a.indexOf(v) === i);
					const range = cache.getRange(cached, ["paths", path, method]);

					if (range && schemes.length > 0) {
						lenses.push({
							range,
							command: {
								title: `Security: ${schemes.join(", ")}`,
								command: "",
							},
						});
					}
				}
			}
		}
	}

	return lenses;
}

function formatKindLabel(kind: string): string {
	switch (kind) {
		case "root":
			return "Root";
		case "schema":
			return "Schema";
		case "parameter":
			return "Parameter";
		case "operation":
			return "Operation";
		case "path-item":
			return "Path Item";
		default:
			return kind
				.split("-")
				.map((p) => p.slice(0, 1).toUpperCase() + p.slice(1))
				.join(" ");
	}
}

function formatResponseSummary(codes: string[], hasDefault: boolean): string {
	const buckets = new Map<string, string[]>();
	const other: string[] = [];

	for (const code of codes) {
		const n = Number.parseInt(code, 10);
		if (Number.isFinite(n)) {
			const bucket = `${Math.floor(n / 100)}xx`;
			const list = buckets.get(bucket) ?? [];
			list.push(code);
			buckets.set(bucket, list);
		} else {
			other.push(code);
		}
	}

	const orderedBuckets = Array.from(buckets.entries()).sort((a, b) =>
		a[0].localeCompare(b[0]),
	);

	const parts: string[] = [];
	for (const [bucket, list] of orderedBuckets) {
		list.sort((a, b) => a.localeCompare(b));
		const preview = list.slice(0, 3).join(",");
		const suffix = list.length > 3 ? `,+${list.length - 3}` : "";
		parts.push(`${bucket}(${preview}${suffix})`);
	}

	if (other.length > 0) {
		other.sort();
		const preview = other.slice(0, 3).join(",");
		const suffix = other.length > 3 ? `,+${other.length - 3}` : "";
		parts.push(`other(${preview}${suffix})`);
	}

	if (hasDefault) parts.push("default");

	return parts.length > 0 ? `Responses: ${parts.join(" ")}` : "Responses";
}

function formatParamsSummary(
	pathItem: Record<string, unknown>,
	operation: Record<string, unknown>,
): string | null {
	const all: Array<Record<string, unknown>> = [];
	const pathParams = pathItem.parameters as
		| Array<Record<string, unknown>>
		| undefined;
	const opParams = operation.parameters as
		| Array<Record<string, unknown>>
		| undefined;
	if (Array.isArray(pathParams)) all.push(...pathParams);
	if (Array.isArray(opParams)) all.push(...opParams);
	if (all.length === 0) return null;

	const counts = new Map<string, number>();
	for (const p of all) {
		const loc = typeof p.in === "string" ? p.in : "unknown";
		counts.set(loc, (counts.get(loc) ?? 0) + 1);
	}

	const parts = Array.from(counts.entries())
		.filter(([k]) => k !== "unknown")
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([k, v]) => `${k}(${v})`);

	if (parts.length === 0) return null;
	return `Params: ${parts.join(" ")}`;
}

function formatBodySummary(operation: Record<string, unknown>): string | null {
	const requestBody = operation.requestBody as
		| Record<string, unknown>
		| undefined;
	if (!requestBody) return null;
	if (typeof requestBody.$ref === "string") return "Body: $ref";
	const content = requestBody.content as Record<string, unknown> | undefined;
	if (!content) return null;
	const mediaTypes = Object.keys(content);
	if (mediaTypes.length === 0) return null;
	mediaTypes.sort();
	const preview = mediaTypes.slice(0, 3).join(" | ");
	const suffix = mediaTypes.length > 3 ? ` | +${mediaTypes.length - 3}` : "";
	return `Body: ${preview}${suffix}`;
}
