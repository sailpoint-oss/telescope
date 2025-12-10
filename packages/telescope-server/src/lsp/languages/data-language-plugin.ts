/**
 * Data Language Plugin - Handles generic yaml and json documents.
 *
 * This plugin creates DataVirtualCode instances for non-OpenAPI YAML/JSON files.
 * OpenAPI files are handled by the OpenAPI language plugin using dedicated
 * languageIds (openapi-yaml, openapi-json).
 *
 * This plugin handles:
 * - Telescope config files (.telescope/config.yaml)
 * - Generic YAML/JSON files that match validation patterns
 *
 * @module lsp/languages/data-language-plugin
 */

import type { IScriptSnapshot, LanguagePlugin } from "@volar/language-core";
import type { URI } from "vscode-uri";
import type { telescopeVolarContext } from "../workspace/context";
import { DataVirtualCode } from "./virtualCodes";

/**
 * Create the data language plugin for generic yaml and json documents.
 *
 * This plugin handles only the generic yaml and json languageIds.
 * OpenAPI documents use dedicated languageIds and are handled by
 * the OpenAPI language plugin.
 *
 * @param shared - The shared telescope context
 * @returns LanguagePlugin instance
 */
export function createDataLanguagePlugin(
	shared: telescopeVolarContext,
): LanguagePlugin<URI, DataVirtualCode> {
	const logger = shared.getLogger("Data-Plugin");
	logger.log("Creating Data Language Plugin");

	function createVirtualCode(
		uri: URI,
		languageId: string,
		snapshot: IScriptSnapshot,
	): DataVirtualCode | undefined {
		// Only handle generic yaml and json languageIds
		if (languageId !== "yaml" && languageId !== "json") {
			return undefined;
		}

		const path = uri.toString();

		// Check if this file should be processed based on workspace config patterns
		const { shouldProcess, documentKind } = shared.shouldProcessFile(path);

		if (!shouldProcess) {
			return undefined;
		}

		// Determine the schema key based on document kind
		let schemaKey: string | undefined;
		if (documentKind === "config") {
			schemaKey = "telescope-config";
		}
		// Generic validation files don't have a specific schema key
		// They rely on pattern-based validation rules

		const format = languageId as "yaml" | "json";

		return new DataVirtualCode(snapshot, languageId, {
			format,
			schemaKey,
		});
	}

	return {
		getLanguageId(uri) {
			// Determine languageId from file extension
			const str = uri.toString();

			if (str.endsWith(".json") || str.endsWith(".jsonc")) return "json";
			if (str.endsWith(".yaml") || str.endsWith(".yml")) return "yaml";

			return undefined;
		},
		createVirtualCode,
		updateVirtualCode(
			uri: URI,
			virtualCode: DataVirtualCode,
			newSnapshot: IScriptSnapshot,
		) {
			// Try incremental update first
			if (virtualCode.update(newSnapshot)) {
				return virtualCode;
			}

			// Fall back to full recreation if incremental update fails
			return createVirtualCode(uri, virtualCode.languageId, newSnapshot);
		},
	};
}
