/**
 * Additional Validation Service Plugin - validates non-OpenAPI YAML/JSON files
 * with custom schemas and generic rules.
 *
 * Uses createPatternBasedYamlService for YAML files and a custom JSON service for JSON files.
 */

import { resolve } from "node:path";
import type {
	LanguageServiceContext,
	LanguageServicePlugin,
	LanguageServicePluginInstance,
} from "@volar/language-service";
import type { GenericRule } from "lens";
import { loadDocument, loadGenericRule, runGenericRules } from "lens";
import { normalizeBaseUri } from "shared/document-utils";
import { globFiles, readFileWithMetadata } from "shared/file-system-utils";
import type {
	Diagnostic as VsDiagnostic,
	WorkspaceDocumentDiagnosticReport,
} from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import * as yaml from "yaml";
import type { z } from "zod";
import type { ApertureVolarContext } from "../../workspace/context.js";
import { isConfigFile } from "../config/config.js";
import { toLspDiagnostic } from "../shared/diagnostic-converter.js";
import {
	createPatternBasedJsonService,
	type ProvideJson,
} from "../shared/json-language-service.js";
import {
	createPatternBasedYamlService,
	type ProvideYaml,
} from "../shared/yaml-language-service.js";
import { zodErrorsToDiagnostics } from "../shared/zod-to-diag.js";
import { loadSchema } from "./schema-loader.js";

// Helper to load generic rules
async function loadGroupRules(
	groupRules: Array<{ rule: string; pattern?: string }>,
	workspaceRoot?: string,
): Promise<Array<{ rule: GenericRule; pattern?: string }>> {
	const rules: Array<{ rule: GenericRule; pattern?: string }> = [];
	for (const ruleConfig of groupRules) {
		const rule = await loadGenericRule(ruleConfig.rule, workspaceRoot);
		if (rule) {
			rules.push({ rule, pattern: ruleConfig.pattern });
		}
	}
	return rules;
}

// Helper to match file pattern for Generic Rules (since LS handles schema matching internally)
function fileMatchesPattern(
	uri: string,
	pattern: string,
	workspaceRoots: string[],
): boolean {
	const uriPath = URI.parse(uri).fsPath;
	const normalizedUri = uriPath.replace(/\\/g, "/");

	// Check against workspace roots for relative path matching
	for (const root of workspaceRoots) {
		try {
			const resolvedPath = resolve(root, pattern);
			const normalizedPattern = resolvedPath.replace(/\\/g, "/");
			if (
				normalizedUri === normalizedPattern ||
				normalizedUri.endsWith(normalizedPattern)
			) {
				return true;
			}
		} catch {
			// Continue
		}
	}

	// Fallback to simple string match or glob check (basic implementation)
	const globStarPlaceholder = "___GLOBSTAR___";
	const regexPattern = pattern
		.replace(/\*\*/g, globStarPlaceholder)
		.replace(/\*/g, "[^/]*")
		.replace(new RegExp(globStarPlaceholder, "g"), ".*")
		.replace(/\?/g, ".");
	const regex = new RegExp(`^${regexPattern}$`);
	return regex.test(uri) || uri.includes(pattern);
}

/**
 * Create Additional Validation service plugin.
 */
export function createAdditionalValidationPlugin(
	shared: ApertureVolarContext,
): LanguageServicePlugin<ProvideYaml & ProvideJson> {
	const logger = shared.getLogger("Validation Service");
	logger.log(`Creating validation service plugin`);

	// 1. Prepare Schema Patterns from Config
	const groups = shared.getAdditionalValidationGroups();
	const workspaceRoots = shared.getWorkspaceFolders().map((uri) => {
		try {
			return URI.parse(uri).fsPath;
		} catch {
			return uri.replace(/^file:\/\//, "");
		}
	});
	const workspaceRoot = workspaceRoots[0];

	// Define a getter for schema patterns to support lazy loading
	const getSchemaPatterns = async () => {
		const groups = shared.getAdditionalValidationGroups();
		// preloadedSchemas are the JSON ones loaded by context (legacy/json support)
		const preloadedSchemas = shared.getJsonSchemas();
		const patterns: Array<{
			schema: Record<string, unknown>;
			pattern: string;
			zodSchema?: z.ZodType<unknown>;
			label?: string;
		}> = [];

		for (const {
			schema,
			groupLabel,
			schemaPattern,
			zodSchema,
		} of preloadedSchemas) {
			const group = groups[groupLabel];
			if (group) {
				// If specific pattern on schema, use it.
				// Else use all group patterns.
				const p = schemaPattern ? [schemaPattern] : group.patterns || [];

				for (const pattern of p) {
					// Exclude patterns start with '!' - skip them for schema association
					if (!pattern.startsWith("!")) {
						patterns.push({
							schema: schema as Record<string, unknown>,
							pattern,
							zodSchema,
							label: groupLabel,
						});
					}
				}
			}
		}

		// Load TS schemas from config
		for (const [label, group] of Object.entries(groups)) {
			if (group.schemas) {
				for (const schemaConfig of group.schemas) {
					let schemaPath = schemaConfig.schema;
					// Check if it is likely a TS file (or JS) and not already loaded (preloaded ones are from context loadRules which handles JSON)
					// Actually context loadRules loads everything that ends with .json or .yaml or .yml?
					// context.ts loadRules filters files ending with .json for jsonSchemas.
					// So here we specifically target .ts or .js files or anything not caught by context.
					// Or we can just blindly try to load everything that looks like a file path if we want to unify.
					// But to avoid double loading JSONs, let's check extension.
					if (
						schemaPath &&
						(schemaPath.endsWith(".ts") ||
							schemaPath.endsWith(".js") ||
							schemaPath.endsWith(".mts") ||
							schemaPath.endsWith(".mjs"))
					) {
						if (!schemaPath.startsWith("/") && !/^[a-zA-Z]:/.test(schemaPath)) {
							schemaPath = resolve(workspaceRoot || "", schemaPath);
						}

						const loaded = await loadSchema(schemaPath);
						if (loaded) {
							const p = schemaConfig.pattern
								? [schemaConfig.pattern]
								: group.patterns || [];
							for (const pattern of p) {
								if (!pattern.startsWith("!")) {
									patterns.push({
										schema: loaded.jsonSchema,
										pattern,
										zodSchema: loaded.zodSchema,
										label,
									});
								}
							}
						}
					}
				}
			}
		}

		return patterns;
	};

	// 2. Initialize Base Services
	const yamlService = createPatternBasedYamlService({
		name: "telescope-additional-yaml",
		// biome-ignore lint/suspicious/noExplicitAny: Schema pattern types need update
		schemaPatterns: getSchemaPatterns as any,
		documentSelector: [
			{ language: "yaml", pattern: "**/*.yaml" },
			{ language: "yaml", pattern: "**/*.yml" },
		],
	});

	const jsonService = createPatternBasedJsonService({
		name: "telescope-additional-json",
		// biome-ignore lint/suspicious/noExplicitAny: Schema pattern types need update
		schemaPatterns: getSchemaPatterns as any,
		documentSelector: [{ language: "json", pattern: "**/*.json" }],
	});

	return {
		name: "telescope-additional-validation",
		capabilities: {
			// Merge capabilities from both
			...yamlService.capabilities,
			...jsonService.capabilities,
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: true,
			},
		},
		create(
			context: LanguageServiceContext,
		): LanguageServicePluginInstance<ProvideYaml & ProvideJson> {
			const yamlInstance = yamlService.create(context);
			const jsonInstance = jsonService.create(context);

			return {
				...yamlInstance,
				...jsonInstance,
				provide: {
					...yamlInstance.provide,
					...jsonInstance.provide,
				},

				// Unified Diagnostic Provider
				async provideDiagnostics(document, token) {
					if (token?.isCancellationRequested) {
						return [];
					}

					const sourceUri = normalizeBaseUri(document.uri);

					// Skip config files
					if (isConfigFile(sourceUri)) {
						return [];
					}

					const diagnostics: VsDiagnostic[] = [];

					// 1. Run Base Validation (Schema)
					if (document.languageId === "yaml") {
						let baseDiagnostics =
							(await yamlInstance.provideDiagnostics?.(document, token)) ?? [];
						// Filter out unwanted warnings
						baseDiagnostics = baseDiagnostics.filter(
							(d) => d.code !== "DisallowedExtraPropWarning" && d.code !== 513,
						);
						diagnostics.push(...baseDiagnostics);
					} else if (document.languageId === "json") {
						const baseDiagnostics =
							(await jsonInstance.provideDiagnostics?.(document, token)) ?? [];
						diagnostics.push(...baseDiagnostics);
					} else {
						return [];
					}

					// 2. Run Zod Validation (if applicable)
					try {
						const patterns = await getSchemaPatterns();
						for (const { pattern, zodSchema, label } of patterns) {
							if (
								zodSchema &&
								fileMatchesPattern(sourceUri, pattern, workspaceRoots)
							) {
								const text = document.getText();
								let docObject: unknown;
								let ast: any;
								let lineCounter: any;

								try {
									if (document.languageId === "yaml") {
										const lc = new yaml.LineCounter();
										const d = yaml.parseDocument(text, { lineCounter: lc });
										docObject = d.toJS();
										// biome-ignore lint/suspicious/noExplicitAny: YAML AST type
										ast = d as any;
										// biome-ignore lint/suspicious/noExplicitAny: LineCounter type
										lineCounter = lc as any;
									} else {
										docObject = JSON.parse(text);
									}

									const result = zodSchema.safeParse(docObject);
									if (!result.success) {
										// Only map errors if we have YAML AST (for now)
										if (document.languageId === "yaml" && ast && lineCounter) {
											const zodDiags = zodErrorsToDiagnostics(
												result.error,
												ast,
												lineCounter,
												label || "zod-schema",
												zodSchema,
											);
											// biome-ignore lint/suspicious/noExplicitAny: Diagnostics type mismatch
											diagnostics.push(...(zodDiags as any));
										} else {
											// Basic error reporting for JSON (or fallback)
											// TODO: Improve JSON location mapping
											diagnostics.push({
												range: {
													start: { line: 0, character: 0 },
													end: { line: 0, character: 0 },
												},
												message: `Validation failed: ${result.error.message}`,
												severity: 1, // Error
												source: label || "zod-schema",
											});
										}
									}
								} catch (_e) {
									// Ignore parse errors here, already caught
								}
							}
						}
					} catch (e) {
						logger.warn?.(`Zod validation failed: ${e}`);
					}

					// 3. Run Generic Rules
					try {
						// Find applicable rules for this file
						for (const [_label, group] of Object.entries(groups)) {
							// Check excludes
							const isExcluded = group.patterns?.some(
								(p: string) =>
									p.startsWith("!") &&
									fileMatchesPattern(sourceUri, p.slice(1), workspaceRoots),
							);
							if (isExcluded) continue;

							// Check matches
							const matchesGroup = group.patterns?.some(
								(p: string) =>
									!p.startsWith("!") &&
									fileMatchesPattern(sourceUri, p, workspaceRoots),
							);
							if (!matchesGroup) continue;

							if (group.rules) {
								const groupRules = await loadGroupRules(
									group.rules,
									workspaceRoot,
								);
								for (const { rule, pattern } of groupRules) {
									// If specific pattern exists, must match it. Else it matches because group matched.
									if (
										pattern &&
										!fileMatchesPattern(sourceUri, pattern, workspaceRoots)
									) {
										continue;
									}

									// Pass the document text directly to loadDocument
									// This ensures we parse the current content in the editor, not what's on disk
									const parsedDoc = await loadDocument(
										{
											fileSystem: shared.getFileSystem(),
											uri: sourceUri,
											// Pass content from the document object provided by Volar/LSP
											text: document.getText(),
										},
										true, // allowNonOpenAPI
									);

									const result = runGenericRules(
										sourceUri,
										parsedDoc.ast,
										parsedDoc.rawText,
										{ rules: [rule] },
									);

									for (const diag of result.diagnostics) {
										diagnostics.push(toLspDiagnostic(diag));
									}
								}
							}
						}
					} catch (error) {
						logger.warn?.(`Failed to run rules on ${sourceUri}: ${error}`);
					}

					return diagnostics;
				},

				// Maintain workspace diagnostics capability
				async provideWorkspaceDiagnostics(token) {
					// Re-using the logic from previous implementation or delegating?
					// Since we now have a proper LSP service, we can rely on the client asking for diagnostics
					// OR we can implement a lightweight scanner if needed.
					// For now, to keep parity, we can iterate files and call provideDiagnostics.

					if (token?.isCancellationRequested) {
						return null;
					}

					const workspaceFolders = shared.getWorkspaceFolders();
					// Gather all relevant files
					const allFiles = new Set<string>();
					for (const group of Object.values(groups)) {
						if (!group.patterns) continue;
						const includePatterns = group.patterns.filter(
							(p: string) => !p.startsWith("!"),
						);
						const files = await globFiles(
							shared.getFileSystem(),
							includePatterns,
							workspaceFolders.map((u) => URI.parse(u)),
						);
						for (const f of files) {
							allFiles.add(f);
						}
					}

					const reports: WorkspaceDocumentDiagnosticReport[] = [];

					for (const uri of allFiles) {
						if (token.isCancellationRequested) break;
						const sourceUri = normalizeBaseUri(uri);

						// Mock a document for validation
						// Note: This is expensive if we read all files.
						// Ideally, we trust the client to open files or request diagnostics.
						// But 'workspaceDiagnostics' implies we report on everything.
						try {
							const fileContent = await readFileWithMetadata(
								shared.getFileSystem(),
								sourceUri,
							);
							if (!fileContent) continue;

							const isYaml =
								sourceUri.endsWith(".yaml") || sourceUri.endsWith(".yml");
							const languageId = isYaml ? "yaml" : "json";

							// Create a simple text document interface
							const document = {
								uri: sourceUri,
								languageId,
								version: 0, // Version 0 for file-on-disk
								getText: () => fileContent.text,
								positionAt: (offset: number) => {
									const lines = fileContent.text
										.substring(0, offset)
										.split("\n");
									return {
										line: lines.length - 1,
										character: lines[lines.length - 1]?.length ?? 0,
									};
								},
								offsetAt: (_position: { line: number; character: number }) => 0, // Simplified
								lineCount: fileContent.text.split("\n").length,
							};

							// Call our unified provider
							const items =
								(await this.provideDiagnostics?.(document, token)) ?? [];

							reports.push({
								kind: "full",
								uri: sourceUri,
								version: null, // null for file on disk
								items: items,
							});
						} catch {
							// ignore errors reading files
						}
					}

					return reports;
				},
			};
		},
	};
}
