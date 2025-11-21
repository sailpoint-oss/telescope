import type { LanguagePlugin } from "@volar/language-core";
import { matchesPattern } from "lens";
import type { URI } from "vscode-uri";
import { isConfigFile } from "../../services/config/config.js";
import type { ApertureVolarContext } from "../../workspace/context.js";
import { UniversalVirtualCode } from "./universal-virtual-code.js";

export function createUniversalLanguagePlugin(
	shared: ApertureVolarContext,
): LanguagePlugin<URI, UniversalVirtualCode> {
	const logger = shared.getLogger("Universal Language");
	logger.log("Creating Universal Language Plugin");
	return {
		getLanguageId(uri) {
			const str = uri.toString();

			// Check if this file is claimed by OpenAPI plugin
			const config = shared.getConfig();
			const openApiPatterns = config.openapi?.patterns;

			if (
				openApiPatterns &&
				openApiPatterns.length > 0 &&
				matchesPattern(str, openApiPatterns, [], shared.getWorkspacePaths())
			) {
				return undefined; // Yield to OpenAPI plugin
			}

			if (str.endsWith(".json")) return "json";
			if (str.endsWith(".yaml") || str.endsWith(".yml")) return "yaml";
			return undefined;
		},
		createVirtualCode(uri, languageId, snapshot) {
			const strUri = uri.toString();
			if (isConfigFile(strUri)) {
				return undefined; // Let ConfigPlugin handle it
			}

			// Double check pattern in case config changed and languageId update is lagging
			// (though usually getLanguageId is called first)
			const config = shared.getConfig();
			const openApiPatterns = config.openapi?.patterns;
			if (
				openApiPatterns &&
				openApiPatterns.length > 0 &&
				matchesPattern(strUri, openApiPatterns, [], shared.getWorkspacePaths())
			) {
				return undefined;
			}

			if (languageId === "json" || languageId === "yaml") {
				return new UniversalVirtualCode(snapshot, languageId);
			}

			return undefined;
		},
		updateVirtualCode(uri, virtualCode, snapshot) {
			const strUri = uri.toString();
			if (isConfigFile(strUri)) return undefined;

			const config = shared.getConfig();
			const openApiPatterns = config.openapi?.patterns;
			if (
				openApiPatterns &&
				openApiPatterns.length > 0 &&
				matchesPattern(strUri, openApiPatterns, [], shared.getWorkspacePaths())
			) {
				return undefined;
			}

			if (
				virtualCode.languageId === "json" ||
				virtualCode.languageId === "yaml"
			) {
				virtualCode.update(snapshot);
				return virtualCode;
			}
			return undefined;
		},
	};
}
