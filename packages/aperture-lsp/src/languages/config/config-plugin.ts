import type { LanguagePlugin } from "@volar/language-core";
import type { URI } from "vscode-uri";
import type { ApertureVolarContext } from "../../workspace/context.js";
import { ConfigVirtualCode } from "./config-virtual-code.js";

/**
 * Create a LanguagePlugin for Telescope config files.
 * This plugin handles .telescope/config.yaml files and creates VirtualCode
 * with languageId "yaml" so that YAML language service plugins can handle them.
 *
 * The actual YAML language service features (validation, completion, hover, etc.)
 * are provided by the LanguageServicePlugin (createConfigServicePlugin).
 */
export function createConfigLanguagePlugin(
	shared: ApertureVolarContext,
): LanguagePlugin<URI, ConfigVirtualCode> {
	const logger = shared.getLogger("Config Plugin");
	return {
		getLanguageId(scriptId) {
			const uri = scriptId.toString();
			if (uri.endsWith(".telescope/config.yaml")) {
				return "yaml";
			}
			return undefined;
		},

		createVirtualCode(scriptId, languageId, snapshot) {
			const uri = scriptId.toString();

			if (languageId !== "yaml" || !uri.endsWith(".telescope/config.yaml")) {
				return undefined;
			}

			// Create ConfigVirtualCode with cached AST
			return new ConfigVirtualCode(snapshot);
		},

		updateVirtualCode(_scriptId, virtualCode, snapshot) {
			logger.log("updateVirtualCode", virtualCode.languageId);

			// Efficiently update the existing instance
			// This ensures we reuse the same instance and can cache the AST
			virtualCode.update(snapshot);
			return virtualCode;
		},
	};
}
