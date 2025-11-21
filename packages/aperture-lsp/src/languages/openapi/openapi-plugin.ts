import { extname } from "node:path";
import type { LanguagePlugin } from "@volar/language-core";
import { matchesPattern } from "lens";
import type { URI } from "vscode-uri";
import type { ApertureVolarContext } from "../../workspace/context.js";
import { OpenAPIVirtualCode } from "./openapi-virtual-code.js";

export function createOpenAPILanguagePlugin(
	context: ApertureVolarContext,
): LanguagePlugin<URI, OpenAPIVirtualCode> {
	const logger = context.getLogger("OpenAPI Language");
	logger.log("Creating OpenAPI Language Plugin");
	const store = context.documents;
	const core = context.core;
	return {
		getLanguageId(scriptId) {
			const uri = scriptId.toString();

			// Check if file matches OpenAPI patterns from configuration
			const config = context.getConfig();
			const openApiPatterns = config.openapi?.patterns;

			if (
				openApiPatterns &&
				openApiPatterns.length > 0 &&
				matchesPattern(uri, openApiPatterns, [], context.getWorkspaceFolders())
			) {
				logger.log(
					`[Language Plugin] getLanguageId(${uri}) = openapi (matches OpenAPI patterns)`,
				);
				return "openapi";
			}

			return undefined;
		},
		createVirtualCode(scriptId, languageId, snapshot) {
			const uri = scriptId.toString();
			logger.log(`[Language Plugin] createVirtualCode(${uri}, ${languageId})`);

			if (languageId !== "openapi") {
				return undefined;
			}

			// Determine type based on extension
			const fileExtension = extname(uri).toLowerCase();
			const type = fileExtension === ".json" ? "json" : "yaml";

			const virtualCode = new OpenAPIVirtualCode(snapshot, type);

			// Update Store and Core
			// Note: Core might re-parse for IR, but we are ensuring ParsedContent is available for generic validation
			// Using the virtual code's parsed content which was just updated in constructor
			const record = store.updateFromSnapshot(uri, languageId, snapshot);
			core.updateDocument(uri, record.text, record.languageId, record.version);

			return virtualCode;
		},
		updateVirtualCode(scriptId, virtualCode, snapshot) {
			const uri = scriptId.toString();

			// Re-check patterns to ensure we still own this file
			const config = context.getConfig();
			const openApiPatterns = config.openapi?.patterns;

			if (
				!openApiPatterns ||
				openApiPatterns.length === 0 ||
				!matchesPattern(uri, openApiPatterns, [], context.getWorkspaceFolders())
			) {
				// If we no longer own it, return undefined (dispose)
				core.removeDocument(uri);
				return undefined;
			}

			if (virtualCode.languageId !== "openapi") {
				return undefined;
			}

			// Update the existing virtual code instance
			virtualCode.update(snapshot);

			const record = store.updateFromSnapshot(
				uri,
				virtualCode.languageId,
				snapshot,
			);
			core.updateDocument(uri, record.text, record.languageId, record.version);

			return virtualCode;
		},
		disposeVirtualCode(scriptId) {
			const uri = scriptId.toString();
			store.delete(uri);
			core.removeDocument(uri);
		},
	};
}
