/**
 * Selection Ranges Handler
 *
 * Provides expanding selection ranges for YAML/JSON OpenAPI documents by
 * delegating to the yaml-language-server.
 *
 * @module lsp/handlers/selection-ranges
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { SelectionRange } from "vscode-languageserver-protocol";

import { getYAMLService } from "../services/yaml-service.js";
import type { TelescopeContext } from "../context.js";

/**
 * Register selection range handlers on the connection.
 */
export function registerSelectionRangeHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	ctx: TelescopeContext,
): void {
	const logger = ctx.getLogger("SelectionRanges");
	const yamlService = getYAMLService();

	connection.onSelectionRanges(async (params): Promise<SelectionRange[]> => {
		try {
			const doc = documents.get(params.textDocument.uri);
			if (!doc) {
				return [];
			}

			// Delegate to YAML service for selection ranges
			const ranges = await yamlService.getSelectionRanges(doc, params.positions);
			return ranges;
		} catch (error) {
			logger.error(
				`Failed to compute selection ranges: ${error instanceof Error ? error.message : String(error)}`,
			);
			return [];
		}
	});
}

