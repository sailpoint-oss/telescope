/**
 * Execute Commands Handler
 *
 * Implements workspace/executeCommand for larger refactors.
 *
 * Note: These refactors currently operate by rewriting the full document text
 * (tradeoff: simple and robust, but may drop comments/formatting).
 *
 * @module lsp/handlers/execute-commands
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { ExecuteCommandParams, TextEdit, WorkspaceEdit } from "vscode-languageserver-protocol";
import type { TextDocument } from "vscode-languageserver-textdocument";
import * as yaml from "yaml";

import type { TelescopeContext } from "../context.js";
import type { DocumentCache } from "../document-cache.js";
import { isOpenAPIDocument } from "./shared.js";

export const TELECOPE_EXEC_COMMANDS = [
	"telescope.sortTags",
	"telescope.sortPaths",
	"telescope.generateResponseSkeletons",
] as const;

export type TelescopeExecuteCommand = (typeof TELECOPE_EXEC_COMMANDS)[number];

export function registerExecuteCommandHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
): void {
	const logger = ctx.getLogger("ExecuteCommand");

	connection.onExecuteCommand(async (params: ExecuteCommandParams) => {
		try {
			const command = params.command as TelescopeExecuteCommand;
			const [uri] = (params.arguments ?? []) as [string | undefined];
			if (!uri) return null;

			const doc = documents.get(uri);
			if (!doc) return null;

			const cached = cache.get(doc);
			if (!isOpenAPIDocument(cached)) return null;

			switch (command) {
				case "telescope.sortTags":
					await applyFullDocumentRewrite(
						connection,
						doc,
						cached.format,
						sortTags(cached.parsedObject),
						"Sort Tags",
					);
					return null;
				case "telescope.sortPaths":
					await applyFullDocumentRewrite(
						connection,
						doc,
						cached.format,
						sortPaths(cached.parsedObject),
						"Sort Paths",
					);
					return null;
				case "telescope.generateResponseSkeletons":
					await applyFullDocumentRewrite(
						connection,
						doc,
						cached.format,
						generateResponseSkeletons(cached.parsedObject),
						"Generate Response Skeletons",
					);
					return null;
				default:
					return null;
			}
		} catch (error) {
			logger.error(
				`executeCommand failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return null;
		}
	});
}

async function applyFullDocumentRewrite(
	connection: Connection,
	doc: TextDocument,
	format: "yaml" | "json",
	obj: unknown,
	label: string,
): Promise<void> {
	const newText =
		format === "yaml"
			? `${yaml.stringify(obj, { indent: 2 }).trimEnd()}\n`
			: `${JSON.stringify(obj, null, 2)}\n`;

	const end = doc.positionAt(doc.getText().length);
	const edit: TextEdit = {
		range: { start: { line: 0, character: 0 }, end },
		newText,
	};

	const workspaceEdit: WorkspaceEdit = { changes: { [doc.uri]: [edit] } };
	await connection.workspace.applyEdit({ label, edit: workspaceEdit });
}

function sortTags(root: unknown): unknown {
	if (!root || typeof root !== "object") return root;
	const doc = structuredClone(root as any);

	// Root tags (array of objects with name)
	if (Array.isArray(doc.tags)) {
		doc.tags = [...doc.tags].sort((a: any, b: any) =>
			String(a?.name ?? "").localeCompare(String(b?.name ?? "")),
		);
	}

	// Operation tags (array of strings)
	if (doc.paths && typeof doc.paths === "object") {
		for (const pathItem of Object.values(doc.paths as Record<string, any>)) {
			if (!pathItem || typeof pathItem !== "object") continue;
			for (const method of Object.keys(pathItem)) {
				const op = (pathItem as any)[method];
				if (!op || typeof op !== "object") continue;
				if (Array.isArray(op.tags)) {
					op.tags = [...op.tags].sort((a: any, b: any) =>
						String(a).localeCompare(String(b)),
					);
				}
			}
		}
	}

	return doc;
}

function sortPaths(root: unknown): unknown {
	if (!root || typeof root !== "object") return root;
	const doc = structuredClone(root as any);

	if (doc.paths && typeof doc.paths === "object" && !Array.isArray(doc.paths)) {
		const entries = Object.entries(doc.paths as Record<string, any>).sort((a, b) =>
			String(a[0]).localeCompare(String(b[0])),
		);
		doc.paths = Object.fromEntries(entries);
	}

	return doc;
}

function generateResponseSkeletons(root: unknown): unknown {
	if (!root || typeof root !== "object") return root;
	const doc = structuredClone(root as any);

	if (!doc.paths || typeof doc.paths !== "object") return doc;
	const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

	for (const pathItem of Object.values(doc.paths as Record<string, any>)) {
		if (!pathItem || typeof pathItem !== "object") continue;
		for (const method of methods) {
			const op = (pathItem as any)[method];
			if (!op || typeof op !== "object") continue;
			if (!op.responses || typeof op.responses !== "object") {
				op.responses = { "200": { description: "OK" } };
				continue;
			}
			const keys = Object.keys(op.responses);
			const has2xx = keys.some((k) => /^\d\d\d$/.test(k) && k.startsWith("2"));
			if (!has2xx) {
				op.responses["200"] = op.responses["200"] ?? { description: "OK" };
			}
			op.responses["400"] = op.responses["400"] ?? { description: "Bad Request" };
			op.responses["500"] = op.responses["500"] ?? { description: "Internal Server Error" };
		}
	}

	return doc;
}


