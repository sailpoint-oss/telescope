import type {
	LanguageServiceContext,
	LanguageServicePlugin,
	LanguageServicePluginInstance,
} from "@volar/language-service";
import { type GenericRule, matchesPattern, runGenericRules } from "lens";
import { normalizeBaseUri } from "shared/document-utils";
import { globFiles, readFileWithMetadata } from "shared/file-system-utils";
import type {
	Diagnostic as VsDiagnostic,
	WorkspaceDocumentDiagnosticReport,
} from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import * as yaml from "yaml";
import type { ParsedContent, SchemaResolver } from "../../types.js";
import type { ApertureVolarContext } from "../../workspace/context.js";
import { isConfigFile } from "../config/config.js";
import { toLspDiagnostic } from "../shared/diagnostic-converter.js";
import {
	createCustomJsonService,
	type ProvideJson,
} from "../shared/json-language-service.js";
import {
	createCustomYamlService,
	type ProvideYaml,
} from "../shared/yaml-language-service.js";
import { zodErrorsToDiagnostics } from "../shared/zod-to-diag.js";

// Helper to load generic rules
async function loadGroupRules(
	groupRules: Array<{ rule: string; pattern?: string }>,
	workspaceRoot?: string,
): Promise<Array<{ rule: GenericRule; pattern?: string }>> {
	// Dynamic import to avoid circular deps or just use what we have
	const { loadGenericRule } = await import("lens");
	const rules: Array<{ rule: GenericRule; pattern?: string }> = [];
	for (const ruleConfig of groupRules) {
		const rule = await loadGenericRule(ruleConfig.rule, workspaceRoot);
		if (rule) {
			rules.push({ rule, pattern: ruleConfig.pattern });
		}
	}
	return rules;
}

export function createAdditionalValidationPlugin(
	shared: ApertureVolarContext,
): LanguageServicePlugin<ProvideYaml & ProvideJson> {
	const logger = shared.getLogger("Validation Service");
	logger.log("Creating validation service plugin");

	// Schema Resolver for Native Services
	const schemaResolver: SchemaResolver = async (document, _context) => {
		const rules = shared.getValidationRules();
		const matchingRules = [];
		const workspaceFolders = shared.getWorkspaceFolders();

		// Filter rules matching the document
		for (const rule of rules) {
			const matches = rule.patterns.some((p) =>
				matchesPattern(document.uri, [p], [], workspaceFolders),
			);

			if (matches && rule.jsonSchema) {
				matchingRules.push({
					uri: `telescope-${rule.id}`,
					fileMatch: [document.uri], // Bind explicitly to this document
					schema: rule.jsonSchema,
				});
			}
		}

		return matchingRules.length > 0 ? matchingRules : undefined;
	};

	// Initialize Services
	const yamlService = createCustomYamlService({
		name: "telescope-additional-yaml",
		schemaResolver,
		documentSelector: [
			{ language: "yaml", pattern: "**/*.yaml" },
			{ language: "yaml", pattern: "**/*.yml" },
		],
	});

	const jsonService = createCustomJsonService({
		name: "telescope-additional-json",
		schemaResolver,
		documentSelector: [{ language: "json", pattern: "**/*.json" }],
	});

	return {
		name: "telescope-additional-validation",
		capabilities: {
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

				async provideDiagnostics(document, token) {
					if (token?.isCancellationRequested) {
						return [];
					}

					const sourceUri = normalizeBaseUri(document.uri);
					if (isConfigFile(sourceUri)) {
						return [];
					}

					const diagnostics: VsDiagnostic[] = [];

					// 1. Native Validation
					if (document.languageId === "yaml") {
						let baseDiagnostics =
							(await yamlInstance.provideDiagnostics?.(document, token)) ?? [];
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

					// 2. Custom (Zod) & Generic Validation
					const rules = shared.getValidationRules();
					const workspaceFolders = shared.getWorkspaceFolders();
					const groups = shared.getAdditionalValidationGroups();

					// Attempt to get pre-parsed content from Universal Plugin
					let parsedContent: ParsedContent | undefined;
					try {
						// context.language is available in newer Volar versions.
						// Check if it exists on context
						if ("language" in context) {
							// biome-ignore lint/suspicious/noExplicitAny: Cast for Volar 2 compat
							const language = (context as any).language;
							const script = language.scripts.get(document.uri);
							if (script?.generated?.root) {
								const root = script.generated.root;
								if (root.parsedObject !== undefined && root.ast !== undefined) {
									parsedContent = root as ParsedContent;
								}
							}
						}
					} catch (_e) {
						// ignore
					}

					// If not found (e.g. excluded file), fallback to local parse
					if (!parsedContent) {
						const text = document.getText();
						if (document.languageId === "yaml") {
							const lineCounter = new yaml.LineCounter();
							const doc = yaml.parseDocument(text, { lineCounter });
							parsedContent = {
								id: "fallback-yaml",
								languageId: "yaml",
								snapshot: {
									getText: (start, end) => text.substring(start, end),
									getLength: () => text.length,
									getChangeRange: () => undefined,
								},
								mappings: [],
								embeddedCodes: [],
								type: "yaml",
								parsedObject: doc.toJS(),
								ast: { doc, lineCounter },
							};
						} else if (document.languageId === "json") {
							try {
								const obj = JSON.parse(text);
								parsedContent = {
									id: "fallback-json",
									languageId: "json",
									snapshot: {
										getText: (start, end) => text.substring(start, end),
										getLength: () => text.length,
										getChangeRange: () => undefined,
									},
									mappings: [],
									embeddedCodes: [],
									type: "json",
									parsedObject: obj,
									ast: undefined,
								};
							} catch {
								// Parse error
							}
						}
					}

					if (!parsedContent) return diagnostics;

					// Run Zod Validation
					for (const rule of rules) {
						const matches = rule.patterns.some((p) =>
							matchesPattern(document.uri, [p], [], workspaceFolders),
						);

						if (matches && rule.zodSchema) {
							try {
								const result = rule.zodSchema.safeParse(
									parsedContent.parsedObject,
								);
								if (!result.success) {
									if (parsedContent.type === "yaml" && parsedContent.ast) {
										const { doc, lineCounter } = parsedContent.ast as {
											doc: yaml.Document;
											lineCounter: yaml.LineCounter;
										};
										const zodDiags = zodErrorsToDiagnostics(
											result.error,
											doc,
											lineCounter,
											rule.label,
											rule.zodSchema,
										);
										// biome-ignore lint/suspicious/noExplicitAny: Diagnostics type mismatch
										diagnostics.push(...(zodDiags as any));
									} else {
										diagnostics.push({
											range: {
												start: { line: 0, character: 0 },
												end: { line: 0, character: 0 },
											},
											message: `Validation failed: ${result.error.message}`,
											severity: 1,
											source: rule.label,
										});
									}
								}
							} catch (e) {
								logger.warn?.(`Zod validation failed for ${rule.label}: ${e}`);
							}
						}
					}

					// Run Generic Rules
					try {
						for (const [_label, group] of Object.entries(groups)) {
							const isExcluded = group.patterns?.some(
								(p: string) =>
									p.startsWith("!") &&
									matchesPattern(
										document.uri,
										[p.slice(1)],
										[],
										workspaceFolders,
									),
							);
							if (isExcluded) continue;

							const matchesGroup = group.patterns?.some(
								(p: string) =>
									!p.startsWith("!") &&
									matchesPattern(document.uri, [p], [], workspaceFolders),
							);
							if (!matchesGroup) continue;

							if (group.rules) {
								const groupRules = await loadGroupRules(
									group.rules,
									shared.getWorkspaceFolders()[0],
								);

								for (const { rule, pattern } of groupRules) {
									if (
										pattern &&
										!matchesPattern(
											document.uri,
											[pattern],
											[],
											workspaceFolders,
										)
									) {
										continue;
									}

									const result = runGenericRules(
										sourceUri,
										undefined,
										document.getText(),
										{ rules: [rule] },
									);

									for (const diag of result.diagnostics) {
										diagnostics.push(toLspDiagnostic(diag));
									}
								}
							}
						}
					} catch (error) {
						logger.warn?.(`Failed to run generic rules: ${error}`);
					}

					return diagnostics;
				},

				async provideWorkspaceDiagnostics(token) {
					if (token?.isCancellationRequested) return null;

					const workspaceFolders = shared.getWorkspaceFolders();
					const groups = shared.getAdditionalValidationGroups();
					const allFiles = new Set<string>();

					// Collect files from validation rules
					const rules = shared.getValidationRules();
					for (const rule of rules) {
						const files = await globFiles(
							shared.getFileSystem(),
							rule.patterns,
							workspaceFolders.map((u) => URI.parse(u)),
						);
						for (const f of files) {
							allFiles.add(f);
						}
					}

					// Collect files from generic groups
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

						try {
							const fileContent = await readFileWithMetadata(
								shared.getFileSystem(),
								sourceUri,
							);
							if (!fileContent) continue;

							const isYaml =
								sourceUri.endsWith(".yaml") || sourceUri.endsWith(".yml");
							const languageId = isYaml ? "yaml" : "json";

							// Mock document
							// biome-ignore lint/suspicious/noExplicitAny: Mocking document
							const document: any = {
								uri: sourceUri,
								languageId,
								version: 0,
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
								offsetAt: (_position: { line: number; character: number }) => 0,
								lineCount: fileContent.text.split("\n").length,
							};

							const items =
								(await this.provideDiagnostics?.(document, token)) ?? [];

							reports.push({
								kind: "full",
								uri: sourceUri,
								version: null,
								items: items,
							});
						} catch {
							// ignore
						}
					}

					return reports;
				},
			};
		},
	};
}
