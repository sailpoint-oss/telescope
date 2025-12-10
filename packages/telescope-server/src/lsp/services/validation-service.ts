/**
 * Validation Service Plugin
 *
 * This module provides the Volar language service plugin for generic rule
 * validation. It runs custom validation rules for any file type matching
 * configured patterns.
 *
 * **Note**: Schema validation (Zod/JSON Schema) is handled by the JSON/YAML
 * language services, NOT this service. This service is exclusively for
 * generic rules that operate on file content.
 *
 * @module lsp/services/validation
 *
 * @see {@link GenericRule} - Generic rule interface
 *
 * @example
 * ```typescript
 * import { createValidationPlugin } from "telescope-server";
 *
 * // Create the plugin with shared context
 * const plugin = createValidationPlugin(sharedContext);
 *
 * // Register with Volar
 * languageService.installPlugin(plugin);
 * ```
 */

import type { Diagnostic } from "@volar/language-server";
import type {
	LanguageServiceContext,
	LanguageServicePlugin,
	LanguageServicePluginInstance,
} from "@volar/language-service";
import type { Disposable } from "vscode-languageserver-protocol";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import { runGenericRules } from "../../engine/index.js";
import type { Diagnostic as LensDiagnostic } from "../../engine/rules/types.js";
import { normalizeBaseUri } from "../../engine/utils/document-utils.js";
import { DataVirtualCode } from "../languages/virtualCodes/data-virtual-code.js";
import { isConfigFile } from "../utils.js";
import type { telescopeVolarContext } from "../workspace/context.js";
import { DiagnosticsCache } from "./shared/diagnostics-cache.js";

/**
 * Convert an engine Diagnostic to a Volar/LSP Diagnostic.
 *
 * Since engine diagnostics now use LSP-compatible field names,
 * this is mostly a pass-through with minor defaults.
 *
 * @param diag - The engine diagnostic to convert
 * @returns A Volar/LSP Diagnostic
 */
export function toLspDiagnostic(diag: LensDiagnostic): Diagnostic {
	return {
		range: diag.range,
		message: diag.message,
		severity: diag.severity ?? DiagnosticSeverity.Error,
		source: diag.source ?? "telescope",
		code: diag.code,
		codeDescription: diag.codeDescription,
		relatedInformation: diag.relatedInformation,
	};
}

/**
 * Create the validation service plugin for Volar.
 *
 * This plugin provides validation for files using generic rules.
 * Generic rules are custom validation functions that can validate any
 * file matching configured patterns.
 *
 * **Note**: Schema validation (Zod/JSON Schema) is handled by the
 * JSON/YAML language services, NOT this plugin.
 *
 * @param shared - The shared telescope context with configuration and rules
 * @returns Volar LanguageServicePlugin instance
 *
 * @example
 * ```typescript
 * // Configuration in .telescope/config.yaml:
 * // additionalValidation:
 * //   my-configs:
 * //     patterns:
 * //       - "config/*.yaml"
 * //     rules:
 * //       - rule: my-custom-rule.ts
 *
 * const shared = new telescopeVolarContext(config);
 * const plugin = createValidationPlugin(shared);
 *
 * // Plugin provides:
 * // - provideDiagnostics(document, token) -> Diagnostic[]
 * ```
 */
export function createValidationPlugin({
	shared,
}: {
	shared: telescopeVolarContext;
}): LanguageServicePlugin {
	const logger = shared.getLogger("Validation Service");
	logger.log("Creating validation service plugin");
	return {
		name: "telescope-validation",
		capabilities: {
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: true,
			},
		},
		create(context: LanguageServiceContext): LanguageServicePluginInstance {
			// Initialize diagnostics cache for incremental updates
			const cache = new DiagnosticsCache();

			// Subscribe to file changes for cache invalidation
			let fileWatcherDisposable: Disposable | undefined;
			try {
				fileWatcherDisposable = context.env.onDidChangeWatchedFiles?.(
					({ changes }) => {
						for (const change of changes) {
							const uri = normalizeBaseUri(change.uri);
							// Invalidate cache for validation files
							if (shared.isValidationFile(uri)) {
								logger.log(`File changed, invalidating cache: ${uri}`);
								cache.invalidate(uri);
							}
						}
					},
				);
			} catch (e) {
				logger.warn(`Failed to subscribe to file watcher: ${e}`);
			}

			// Clear cache on configuration change
			let configDisposable: Disposable | undefined;
			try {
				configDisposable = context.env.onDidChangeConfiguration?.(() => {
					logger.log("Configuration changed, clearing validation cache");
					cache.clear();
				});
			} catch (e) {
				logger.warn(`Failed to subscribe to config changes: ${e}`);
			}

			return {
				/**
				 * Dispose of resources when plugin is destroyed.
				 */
				dispose(): void {
					fileWatcherDisposable?.dispose();
					configDisposable?.dispose();
					cache.clear();
				},
				/**
				 * Provide diagnostics for a single document.
				 *
				 * Runs only generic rules for files matching configured patterns.
				 * Schema validation (Zod/JSON Schema) is handled by JSON/YAML services.
				 */
				async provideDiagnostics(document, token) {
					if (token?.isCancellationRequested) {
						return [];
					}

					// Ensure rules are loaded before running diagnostics
					await shared.rulesLoadPromise;

					if (
						document.languageId !== "yaml" &&
						document.languageId !== "json"
					) {
						return [];
					}

					const decoded = context.decodeEmbeddedDocumentUri(
						URI.parse(document.uri),
					);
					if (!decoded) {
						// This is not a virtual code document
						return null;
					}

					const [sourceUri, embeddedCodeId] = decoded;

					const normalizedSourceUri = normalizeBaseUri(sourceUri.toString());
					if (isConfigFile(normalizedSourceUri)) {
						return [];
					}

					// Get generic rules for this file
					const genericRules =
						shared.getGenericRulesForUri(normalizedSourceUri);

					// If no generic rules, nothing to do
					if (genericRules.length === 0) {
						return [];
					}

					logger.log(
						`Embedded code ID: ${embeddedCodeId} Decoded source URI: ${normalizedSourceUri}`,
					);

					// Get source script
					const sourceScript = context.language.scripts.get(sourceUri);
					if (!sourceScript) {
						logger.warn(`Source script not found for ${normalizedSourceUri}`);
						return null;
					}

					// Get VirtualCode
					const virtualCode =
						sourceScript.generated?.embeddedCodes.get(embeddedCodeId);
					if (!virtualCode) {
						logger.warn(`Virtual code not found for ${normalizedSourceUri}`);
						return null;
					}

					if (!(virtualCode instanceof DataVirtualCode)) {
						logger.warn(
							`Virtual code is not a DataVirtualCode for ${normalizedSourceUri}`,
						);
						return null;
					}

					const diagnostics: Diagnostic[] = [];

					// Run Generic Rules only (schema validation is in JSON/YAML services)
					logger.log(
						`Running ${genericRules.length} generic rules on ${normalizedSourceUri}`,
					);
					const genericResult = runGenericRules(
						normalizedSourceUri,
						virtualCode.parsedObject,
						virtualCode.getRawText(),
						{ rules: genericRules },
					);

					// Convert engine diagnostics to LSP diagnostics
					for (const diag of genericResult.diagnostics) {
						diagnostics.push(toLspDiagnostic(diag));
					}

					logger.log(
						`Generic rules produced ${genericResult.diagnostics.length} diagnostics`,
					);

					return diagnostics;
				},
			};
		},
	};
}
