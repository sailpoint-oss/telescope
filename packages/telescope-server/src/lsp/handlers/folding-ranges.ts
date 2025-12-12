/**
 * Folding Ranges Handler
 *
 * Provides folding ranges for YAML/JSON OpenAPI documents by delegating
 * to the yaml-language-server.
 *
 * @module lsp/handlers/folding-ranges
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { FoldingRange } from "vscode-languageserver-protocol";

import { getYAMLService } from "../services/yaml-service.js";
import type { TelescopeContext } from "../context.js";

/**
 * Register folding range handlers on the connection.
 */
export function registerFoldingRangeHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	ctx: TelescopeContext,
): void {
	const logger = ctx.getLogger("FoldingRanges");
	const yamlService = getYAMLService();

	connection.onFoldingRanges((params): FoldingRange[] => {
		try {
			const doc = documents.get(params.textDocument.uri);
			if (!doc) {
				return [];
			}

			// Delegate to YAML service for folding ranges
			const ranges = yamlService.getFoldingRanges(doc);
			return ranges;
		} catch (error) {
			logger.error(
				`Failed to compute folding ranges: ${error instanceof Error ? error.message : String(error)}`,
			);
			return [];
		}
	});
}

