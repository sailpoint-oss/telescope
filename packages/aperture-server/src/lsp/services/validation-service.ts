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
 * import { createValidationPlugin } from "aperture-server";
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
import type { ApertureVolarContext } from "../workspace/context.js";
import {
	DiagnosticsCache,
	type DiagnosticsCacheEntry,
	computeContentHash,
} from "./shared/diagnostics-cache.js";

/**
 * Cache entry for validation diagnostics.
 * Stores the result ID and diagnostics for a single file.
 * @public Exported for testing
 * @deprecated Use DiagnosticsCacheEntry from shared/diagnostics-cache.ts instead
 */
export interface ValidationCacheEntry {
	/** Unique identifier for this diagnostic state */
	resultId: string;
	/** The computed diagnostics */
	diagnostics: Diagnostic[];
	/** Content hash for change detection */
	contentHash: string;
	/** Timestamp when computed */
	computedAt: number;
}

/**
 * Cache for validation diagnostics with change tracking.
 * Enables incremental updates by tracking which files have changed
 * and returning cached results for unchanged files.
 * @public Exported for testing
 * @deprecated Use DiagnosticsCache from shared/diagnostics-cache.ts instead
 */
export class ValidationDiagnosticsCache {
	private cache = new DiagnosticsCache();

	/**
	 * Get cached entry for a URI.
	 */
	get(uri: string): ValidationCacheEntry | undefined {
		const entry = this.cache.get(uri);
		if (!entry) return undefined;
		return {
			resultId: entry.resultId,
			diagnostics: entry.diagnostics,
			contentHash: entry.contentHash,
			computedAt: entry.timestamp,
		};
	}

	/**
	 * Store a diagnostic result in the cache.
	 */
	set(uri: string, entry: ValidationCacheEntry): void {
		this.cache.set(uri, entry.diagnostics, entry.contentHash);
	}

	/**
	 * Mark a file as changed (requires revalidation).
	 */
	markChanged(uri: string): void {
		this.cache.markChanged(uri);
	}

	/**
	 * Check if a file needs revalidation.
	 */
	hasChanged(uri: string): boolean {
		return this.cache.needsRevalidation(uri);
	}

	/**
	 * Get the result ID for a cached file.
	 */
	getResultId(uri: string): string | undefined {
		return this.cache.getResultId(uri);
	}

	/**
	 * Clear all cached data.
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Invalidate a specific URI from the cache.
	 */
	invalidate(uri: string): void {
		this.cache.invalidate(uri);
	}
}

/**
 * Compute a deterministic result ID for validation diagnostics.
 * The ID changes when diagnostics change, stays the same when they don't.
 *
 * @param uri - Document URI
 * @param diagnostics - Array of diagnostics
 * @param contentHash - Hash of the file content
 * @returns Unique result ID string
 * @public Exported for testing
 * @deprecated Use computeDiagnosticsResultId from shared/diagnostics-cache.ts instead
 */
export { computeDiagnosticsResultId as computeValidationResultId } from "./shared/diagnostics-cache.js";

// Re-export computeContentHash for backwards compatibility
export { computeContentHash } from "./shared/diagnostics-cache.js";

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
 * @param shared - The shared Aperture context with configuration and rules
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
 * const shared = new ApertureVolarContext(config);
 * const plugin = createValidationPlugin(shared);
 *
 * // Plugin provides:
 * // - provideDiagnostics(document, token) -> Diagnostic[]
 * ```
 */
export function createValidationPlugin({
	shared,
}: {
	shared: ApertureVolarContext;
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
			const cache = new ValidationDiagnosticsCache();

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
