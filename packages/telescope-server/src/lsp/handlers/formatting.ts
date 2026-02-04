/**
 * Formatting Handler
 *
 * Provides document and range formatting for YAML/JSON documents by delegating
 * to the yaml-language-server (via YAMLService).
 *
 * @module lsp/handlers/formatting
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { TextEdit } from "vscode-languageserver-protocol";

import { getYAMLService } from "../services/yaml-service.js";
import type { TelescopeContext } from "../context.js";

export function registerFormattingHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	ctx: TelescopeContext,
): void {
	const logger = ctx.getLogger("Formatting");
	const yamlService = getYAMLService(logger);

	connection.onDocumentFormatting(async (params): Promise<TextEdit[]> => {
		try {
			const doc = documents.get(params.textDocument.uri);
			if (!doc) return [];
			return await yamlService.format(doc, params.options);
		} catch (error) {
			logger.error(
				`Document formatting failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return [];
		}
	});

	connection.onDocumentRangeFormatting(async (params): Promise<TextEdit[]> => {
		try {
			const doc = documents.get(params.textDocument.uri);
			if (!doc) return [];
			// yaml-language-server formatting is whole-document; apply it as-is.
			return await yamlService.format(doc, params.options);
		} catch (error) {
			logger.error(
				`Range formatting failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return [];
		}
	});
}


