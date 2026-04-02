/**
 * Telescope VS Code Extension
 *
 * This extension provides language support for OpenAPI specifications.
 * It uses a per-workspace-folder LSP architecture where each workspace
 * folder gets its own language server instance for true isolation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { commands, type ExtensionContext, window, workspace } from "vscode";
import {
	DefinitionRequest,
	DocumentFormattingRequest,
	DocumentSymbolRequest,
} from "vscode-languageserver-protocol";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { SessionManager } from "./session-manager";
import { appendTraceEvent, summarizeForTrace } from "./trace";
import { classifyDocument, formatSetupLog } from "./utils";

const execFileAsync = promisify(execFile);

/** Global session manager instance */
let sessionManager: SessionManager | null = null;

function protocolRangeToCodeRange(range: {
	start: { line: number; character: number };
	end: { line: number; character: number };
}): vscode.Range {
	return new vscode.Range(
		range.start.line,
		range.start.character,
		range.end.line,
		range.end.character,
	);
}

function protocolDefinitionToCode(
	result:
		| { uri: string; range: { start: { line: number; character: number }; end: { line: number; character: number } } }
		| {
				targetUri: string;
				targetRange: {
					start: { line: number; character: number };
					end: { line: number; character: number };
				};
				targetSelectionRange: {
					start: { line: number; character: number };
					end: { line: number; character: number };
				};
				originSelectionRange?: {
					start: { line: number; character: number };
					end: { line: number; character: number };
				};
		  }
		| Array<
				| {
						uri: string;
						range: {
							start: { line: number; character: number };
							end: { line: number; character: number };
						};
				  }
				| {
						targetUri: string;
						targetRange: {
							start: { line: number; character: number };
							end: { line: number; character: number };
						};
						targetSelectionRange: {
							start: { line: number; character: number };
							end: { line: number; character: number };
						};
						originSelectionRange?: {
							start: { line: number; character: number };
							end: { line: number; character: number };
						};
				  }
		  >
		| null,
): (vscode.Location | vscode.LocationLink)[] | null {
	if (!result) {
		return null;
	}
	const entries = Array.isArray(result) ? result : [result];
	return entries.map((entry) => {
		if ("targetUri" in entry) {
			return {
				targetUri: vscode.Uri.parse(entry.targetUri),
				targetRange: protocolRangeToCodeRange(entry.targetRange),
				targetSelectionRange: protocolRangeToCodeRange(
					entry.targetSelectionRange,
				),
				originSelectionRange: entry.originSelectionRange
					? protocolRangeToCodeRange(entry.originSelectionRange)
					: undefined,
			} satisfies vscode.LocationLink;
		}
		return new vscode.Location(
			vscode.Uri.parse(entry.uri),
			protocolRangeToCodeRange(entry.range),
		);
	});
}

/**
 * Resolve the path to the Telescope Go language server binary.
 *
 * Checks in order:
 *  1. TELESCOPE_SERVER_PATH env var (for dev/test)
 *  2. telescope.serverPath VS Code setting (user override)
 *  3. "telescope" on PATH (system install via `go install`)
 *  4. Bundled binary at context.asAbsolutePath("bin/telescope")
 */
function resolveServerPath(context: ExtensionContext): string {
	const isWindows = process.platform === "win32";
	const binaryName = isWindows ? "telescope.exe" : "telescope";

	const envPath = process.env.TELESCOPE_SERVER_PATH;
	if (envPath && fs.existsSync(envPath)) {
		return envPath;
	}

	const settingPath = vscode.workspace
		.getConfiguration("telescope")
		.get<string>("serverPath", "");
	if (settingPath && fs.existsSync(settingPath)) {
		return settingPath;
	}

	const pathDirs = (process.env.PATH ?? "").split(path.delimiter);
	for (const dir of pathDirs) {
		const candidate = path.join(dir, binaryName);
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	const bundled = context.asAbsolutePath(path.join("bin", binaryName));
	if (fs.existsSync(bundled)) {
		return bundled;
	}

	throw new Error(
		"Could not find the Telescope language server binary. " +
			"Set the TELESCOPE_SERVER_PATH environment variable, the telescope.serverPath setting, " +
			`install it on your PATH, or ensure the bundled binary exists at bin/${binaryName}. ` +
			"If you installed the universal VSIX, you must provide the server binary separately.",
	);
}

export async function activate(context: ExtensionContext) {
	const activationFailedTestApi = (error: unknown) => {
		const msg = error instanceof Error ? error.message : String(error);
		const fail = async () => {
			throw new Error(`Telescope activation failed: ${msg}`);
		};
		return {
			async waitForSessionsRunning(): Promise<void> {
				await fail();
			},
			getSessionStates(): Array<{
				folder: string;
				state: string;
				error?: string;
			}> {
				return [];
			},
			getProjectInfo(
				_uri?: vscode.Uri,
			): { knownOpenAPIFiles: number; workspacePath: string | null } | null {
				return null;
			},
			getClientOpenApiFileCount(): number {
				throw new Error(`Telescope activation failed: ${msg}`);
			},
			async requestDocumentFormatting(
				_uri: vscode.Uri,
			): Promise<vscode.TextEdit[] | null> {
				await fail();
				return null; // unreachable; fail() always throws
			},
			async requestDefinition(
				_uri: vscode.Uri,
				_pos: vscode.Position,
			): Promise<(vscode.Location | vscode.LocationLink)[] | null> {
				await fail();
				return null; // unreachable; fail() always throws
			},
			async requestSidecarInfo(
				_uri?: vscode.Uri,
			): Promise<{ configured: boolean; available: boolean } | null> {
				await fail();
				return null; // unreachable; fail() always throws
			},
		};
	};

	try {
		const outputChannel = window.createOutputChannel(
			"Telescope Language Server",
			{ log: true },
		);
		const contractOutputChannel = window.createOutputChannel(
			"Telescope Contract Tests",
			{ log: true },
		);
		context.subscriptions.push(contractOutputChannel);
		const traceCommand = (
			command: string,
			phase: "start" | "end" | "error",
			extra: Record<string, unknown> = {},
		) => {
			appendTraceEvent(outputChannel, `command.${phase}`, {
				command,
				activeUri: window.activeTextEditor?.document.uri.toString() ?? "",
				...extra,
			});
		};
		const registerTracedCommand = (
			command: string,
			handler: (...args: any[]) => unknown | Promise<unknown>,
		): vscode.Disposable =>
			commands.registerCommand(command, async (...args: any[]) => {
				traceCommand(command, "start", {
					args: summarizeForTrace(args),
				});
				try {
					const result = await handler(...args);
					traceCommand(command, "end");
					return result;
				} catch (error) {
					traceCommand(command, "error", {
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				}
			});

		outputChannel.appendLine(
			formatSetupLog(`Telescope Language Server starting...`),
		);

		const serverPath = resolveServerPath(context);
		outputChannel.appendLine(
			formatSetupLog(`Server binary: ${serverPath}`),
		);

		const statusBarItem = window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100,
		);
		statusBarItem.command = "telescope.showOpenAPIFiles";
		context.subscriptions.push(statusBarItem);

		sessionManager = new SessionManager({
			serverPath,
			outputChannel,
			contractOutputChannel,
			statusBarItem,
			extensionContext: context,
		});

		context.subscriptions.push(sessionManager);

		// Deprecated element decorations: red italic "deprecated" label after the name
		const deprecatedDecorationType =
			vscode.window.createTextEditorDecorationType({
				after: {
					contentText: " deprecated",
					color: "rgba(255, 80, 80, 0.6)",
					fontStyle: "italic",
					margin: "0 0 0 0.5em",
				},
			});
		context.subscriptions.push(deprecatedDecorationType);

		// Track deprecated ranges per URI
		const deprecatedRangesMap = new Map<
			string,
			Array<{
				range: {
					start: { line: number; character: number };
					end: { line: number; character: number };
				};
				name: string;
				kind: string;
			}>
		>();

		function applyDeprecatedDecorations(editor: vscode.TextEditor): void {
			const key = vscode.Uri.parse(editor.document.uri.toString()).toString();
			const ranges = deprecatedRangesMap.get(key);
			if (!ranges || ranges.length === 0) {
				editor.setDecorations(deprecatedDecorationType, []);
				return;
			}
			const decorations = ranges.map((r) => ({
				range: new vscode.Range(
					new vscode.Position(r.range.end.line, r.range.end.character),
					new vscode.Position(r.range.end.line, r.range.end.character),
				),
				hoverMessage: `${r.name} (${r.kind}) is deprecated`,
			}));
			editor.setDecorations(deprecatedDecorationType, decorations);
		}

		// Apply decorations when visible editors change
		context.subscriptions.push(
			vscode.window.onDidChangeVisibleTextEditors((editors) => {
				for (const editor of editors) {
					applyDeprecatedDecorations(editor);
				}
			}),
		);

		// Wire the deprecated notification handler into the session manager
		sessionManager.onDeprecatedRanges = (params) => {
			const normalizedUri = vscode.Uri.parse(params.uri).toString();
			deprecatedRangesMap.set(normalizedUri, params.ranges);
			for (const editor of vscode.window.visibleTextEditors) {
				if (editor.document.uri.toString() === normalizedUri) {
					applyDeprecatedDecorations(editor);
				}
			}
		};

		sessionManager.initialize().then(
			() => {
				outputChannel.appendLine(formatSetupLog("All sessions initialized"));
			},
			(error) => {
				outputChannel.appendLine(
					formatSetupLog(`Session initialization had errors: ${error}`),
				);
			},
		);

		outputChannel.appendLine(
			formatSetupLog("Telescope extension activated"),
		);
		appendTraceEvent(outputChannel, "extension.activate", {
			workspaceFolders:
				workspace.workspaceFolders?.map((f) => f.uri.toString()) ?? [],
		});

		context.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				appendTraceEvent(outputChannel, "ui.activeEditorChanged", {
					uri: editor?.document.uri.toString() ?? "",
					languageId: editor?.document.languageId ?? "",
				});
			}),
		);
		context.subscriptions.push(
			vscode.window.onDidChangeTextEditorSelection((event) => {
				appendTraceEvent(outputChannel, "ui.selectionChanged", {
					uri: event.textEditor.document.uri.toString(),
					kind: event.kind ?? 0,
					active: {
						line: event.selections[0]?.active.line ?? -1,
						character: event.selections[0]?.active.character ?? -1,
					},
					selectionCount: event.selections.length,
				});
			}),
		);
		context.subscriptions.push(
			vscode.workspace.onDidOpenTextDocument((doc) => {
				appendTraceEvent(outputChannel, "ui.documentOpened", {
					uri: doc.uri.toString(),
					languageId: doc.languageId,
				});
			}),
		);

		// ====================================================================
		// Commands
		// ====================================================================

		context.subscriptions.push(
			registerTracedCommand("openapi-grammar.classifyDocument", async () => {
				const editor = window.activeTextEditor;
				if (editor) {
					await sessionManager?.handleDocument(editor.document);
					const languageId = classifyDocument(editor.document);
					if (languageId) {
						window.showInformationMessage("Document classified as: OpenAPI");
					} else {
						const currentLang = editor.document.languageId;
						if (
							currentLang !== "yaml" &&
							currentLang !== "json" &&
							currentLang !== "jsonc"
						) {
							window.showInformationMessage(
								"Only YAML and JSON files can be classified as OpenAPI",
							);
						} else {
							window.showInformationMessage(
								"Document is not an OpenAPI document",
							);
						}
					}
				}
			}),
		);

		context.subscriptions.push(
			registerTracedCommand("telescope.reclassifyDocument", async () => {
				const editor = window.activeTextEditor;
				if (editor) {
					const isOpenAPI = await sessionManager?.reclassifyDocument(
						editor.document,
					);
					if (!process.env.TELESCOPE_E2E_MODE) {
						if (isOpenAPI) {
							window.showInformationMessage("Document reclassified as: OpenAPI");
						} else {
							window.showInformationMessage(
								"Document is not recognized as an OpenAPI document",
							);
						}
					}
				}
			}),
		);

		context.subscriptions.push(
			registerTracedCommand("telescope.showOpenAPIFiles", async () => {
				const files = sessionManager?.getAllOpenAPIFiles() || [];
				if (files.length === 0) {
					window.showInformationMessage("No OpenAPI files found in workspace");
					return;
				}

				const seen = new Set<string>();
				const items: { label: string; description: string; uri: vscode.Uri }[] = [];
				for (const uri of files) {
					const parsedUri = vscode.Uri.parse(uri);
					const key = parsedUri.toString();
					if (seen.has(key)) continue;
					seen.add(key);
					items.push({
						label: path.basename(parsedUri.fsPath),
						description: workspace.asRelativePath(parsedUri),
						uri: parsedUri,
					});
				}

				const selected = await window.showQuickPick(items, {
					placeHolder: `${files.length} OpenAPI files found`,
					matchOnDescription: true,
				});

				if (selected) {
					const doc = await workspace.openTextDocument(selected.uri);
					await window.showTextDocument(doc);
				}
			}),
		);

		context.subscriptions.push(
			registerTracedCommand("telescope.rescanWorkspace", async () => {
				const totalFiles = await sessionManager?.rescanAll();
				window.showInformationMessage(
					`Scan complete: ${totalFiles || 0} OpenAPI files found`,
				);
			}),
		);

		context.subscriptions.push(
			registerTracedCommand("telescope.restartServer", async () => {
				await sessionManager?.restartAllSessions();
				window.showInformationMessage("Telescope language servers restarted");
			}),
		);

		context.subscriptions.push(
			registerTracedCommand("telescope.graphInfo", async () => {
				if (!sessionManager) return;
				const sessions = sessionManager.getRunningSessions();
				const results: string[] = [];
				for (const session of sessions) {
					const client = session.getClient();
					if (!client) continue;
					try {
						const info = await client.sendRequest("$/telescope/graphInfo");
						results.push(
							`**${session.workspaceFolder.name}**\n\`\`\`json\n${JSON.stringify(info, null, 2)}\n\`\`\``,
						);
					} catch {
						results.push(`**${session.workspaceFolder.name}**: Error fetching graph info`);
					}
				}
				if (results.length > 0) {
					const doc = await vscode.workspace.openTextDocument({
						content: results.join("\n\n---\n\n"),
						language: "markdown",
					});
					await vscode.window.showTextDocument(doc, { preview: true });
				} else {
					window.showWarningMessage("No running Telescope sessions");
				}
			}),
		);

		context.subscriptions.push(
			registerTracedCommand("telescope.rulePerf", async () => {
				if (!sessionManager) return;
				const sessions = sessionManager.getRunningSessions();
				const results: string[] = [];
				for (const session of sessions) {
					const client = session.getClient();
					if (!client) continue;
					try {
						const perf = (await client.sendRequest(
							"$/telescope/rulePerf",
						)) as {
							rules?: { ruleId: string; durationMs: number; count: number }[];
						};
						const rules = perf?.rules ?? [];
						rules.sort(
							(a: { durationMs: number }, b: { durationMs: number }) =>
								b.durationMs - a.durationMs,
						);
						const lines = rules.map(
							(r: { ruleId: string; durationMs: number; count: number }) =>
								`| ${r.ruleId} | ${r.durationMs}ms | ${r.count} |`,
						);
						results.push(
							`**${session.workspaceFolder.name}**\n\n| Rule | Duration | Diagnostics |\n|------|----------|-------------|\n${lines.join("\n")}`,
						);
					} catch {
						results.push(
							`**${session.workspaceFolder.name}**: Error fetching rule performance`,
						);
					}
				}
				if (results.length > 0) {
					const doc = await vscode.workspace.openTextDocument({
						content: results.join("\n\n---\n\n"),
						language: "markdown",
					});
					await vscode.window.showTextDocument(doc, { preview: true });
				} else {
					window.showWarningMessage("No running Telescope sessions");
				}
			}),
		);

		// --------------------------------------------------------------------
		// Server refactor commands (multi-root safe)
		// --------------------------------------------------------------------
		const refactorCommands = [
			"telescope.sortTags",
			"telescope.sortPaths",
			"telescope.generateResponseSkeletons",
		] as const;
		for (const cmd of refactorCommands) {
			context.subscriptions.push(
				registerTracedCommand(cmd, async (uri?: vscode.Uri) => {
					if (!sessionManager) return;
					const doc = await getDocument(uri);
					if (!doc) return;
					const session = sessionManager.getSessionForUri(doc.uri);
					if (!session) {
						window.showWarningMessage(
							`No Telescope session found for ${workspace.asRelativePath(doc.uri)}`,
						);
						return;
					}
					try {
						await session.executeServerCommand(cmd, [doc.uri.toString()]);
					} catch (error) {
						outputChannel.appendLine(
							formatSetupLog(
								`Command ${cmd} failed for ${doc.uri.toString()}: ${String(error)}`,
							),
						);
						window.showErrorMessage(`Telescope command failed: ${cmd}`);
					}
				}),
			);
		}

		context.subscriptions.push(
			registerTracedCommand(
				"telescope.bundlePreview",
				async (uriOrString?: vscode.Uri | string) => {
					const uri =
						typeof uriOrString === "string"
							? vscode.Uri.parse(uriOrString)
							: uriOrString;
					const document = await getDocument(uri);
					if (!document) return;

					try {
						const session = sessionManager?.getSessionForUri(document.uri);
						if (session) {
							const result = (await session.executeServerCommand(
								"telescope.bundlePreview",
								[document.uri.toString()],
							)) as
								| {
										content?: string;
										language?: string;
										warnings?: string[];
										source?: string;
								  }
								| null;
							const serverContent = result?.content?.trim();
							if (serverContent) {
								if (Array.isArray(result?.warnings)) {
									for (const warning of result.warnings) {
										outputChannel.appendLine(
											formatSetupLog(`Bundle preview warning: ${warning}`),
										);
									}
								}
								const previewDoc = await workspace.openTextDocument({
									content: serverContent,
									language:
										result?.language ??
										(document.languageId.includes("json") ? "json" : "yaml"),
								});
								await window.showTextDocument(previewDoc, { preview: true });
								return;
							}
						}

						const language = document.languageId.includes("json") ? "json" : "yaml";
						const { stdout, stderr } = await execFileAsync(
							serverPath,
							["bundle", document.uri.fsPath],
							{ maxBuffer: 20 * 1024 * 1024 },
						);
						const content = (stdout || stderr || "").trim();
						if (!content) {
							window.showWarningMessage("Bundle preview returned no content");
							return;
						}
						const previewDoc = await workspace.openTextDocument({ content, language });
						await window.showTextDocument(previewDoc, { preview: true });
					} catch (error) {
						outputChannel.appendLine(
							formatSetupLog(
								`Bundle preview failed for ${document.uri.toString()}: ${String(error)}`,
							),
						);
						window.showErrorMessage("Telescope bundle preview failed. See Telescope output for details.");
					}
				},
			),
		);

		context.subscriptions.push(
			registerTracedCommand(
				"telescope.validateExamples",
				async (uriOrString?: vscode.Uri | string) => {
					if (!sessionManager) return;
					const uri =
						typeof uriOrString === "string"
							? vscode.Uri.parse(uriOrString)
							: uriOrString;
					const document = await getDocument(uri);
					if (!document) return;
					const session = sessionManager.getSessionForUri(document.uri);
					if (!session) {
						window.showWarningMessage("No Telescope session found for this document");
						return;
					}
					try {
						const result = (await session.executeServerCommand(
							"telescope.validateExamples",
							[document.uri.toString()],
						)) as {
							checked?: number;
							invalid?: number;
							issues?: string[];
						} | null;
						const checked = result?.checked ?? 0;
						const invalid = result?.invalid ?? 0;
						const issues = result?.issues ?? [];
						if (invalid === 0) {
							window.showInformationMessage(
								`Example validation passed (${checked} checked).`,
							);
							return;
						}
						outputChannel.appendLine(
							formatSetupLog(
								`Example validation found ${invalid} issue(s) in ${document.uri.toString()}`,
							),
						);
						for (const issue of issues) {
							outputChannel.appendLine(`  - ${issue}`);
						}
						window.showWarningMessage(
							`Example validation found ${invalid} issue(s). See Telescope output for details.`,
						);
					} catch (error) {
						outputChannel.appendLine(
							formatSetupLog(
								`Example validation failed for ${document.uri.toString()}: ${String(error)}`,
							),
						);
						window.showErrorMessage(
							"Telescope example validation failed. See Telescope output for details.",
						);
					}
				},
			),
		);

		context.subscriptions.push(
			registerTracedCommand(
				"telescope.runContractTests",
				async (uriOrString?: vscode.Uri | string) => {
					if (!sessionManager) return;
					const uri =
						typeof uriOrString === "string"
							? vscode.Uri.parse(uriOrString)
							: uriOrString;
					const document = await getDocument(uri);
					if (!document) return;
					const session = sessionManager.getSessionForUri(document.uri);
					if (!session) {
						window.showWarningMessage("No Telescope session found for this document");
						return;
					}

					const config = workspace.getConfiguration("telescope");
					const configuredBaseUrl =
						config.get<string>("contractTestBaseUrl") || "http://localhost:8080";
					const baseUrl = await window.showInputBox({
						prompt: "Base URL for live contract tests",
						value: configuredBaseUrl,
						ignoreFocusOut: true,
					});
					if (baseUrl === undefined) {
						return;
					}

					try {
						const response = (await session.executeServerCommand(
							"telescope.runContractTests",
							[document.uri.toString(), { baseUrl }],
						)) as
							| {
									status?: string;
									runId?: string;
									baseUrl?: string;
									stderr?: string;
									result?: {
										pass?: boolean;
										openapi?: {
											passed?: number;
											total?: number;
											results?: Array<{
												method?: string;
												path?: string;
												status?: number;
												error?: string;
												pass?: boolean;
												operationId?: string;
											}>;
										};
										arazzo?: {
											passed?: number;
											total?: number;
											workflows?: Array<{
												workflowId?: string;
												error?: string;
												pass?: boolean;
											}>;
										};
									};
							  }
							| null;
						if (
							response &&
							typeof response === "object" &&
							response.status === "queued" &&
							response.runId
						) {
							contractOutputChannel.show(true);
							contractOutputChannel.appendLine(
								formatSetupLog(
									`Contract tests queued (${response.runId}). Progress and final summary appear in this channel.`,
								),
							);
							window.showInformationMessage(
								`Contract tests started (${response.runId}). See "Telescope Contract Tests" output for progress and results.`,
							);
							return;
						}
						const result = response?.result;
						const openapiResult = result?.openapi;
						const arazzoResult = result?.arazzo;
						const total =
							(openapiResult?.total ?? 0) + (arazzoResult?.total ?? 0);
						const passed =
							(openapiResult?.passed ?? 0) + (arazzoResult?.passed ?? 0);
						contractOutputChannel.appendLine(
							formatSetupLog(
								`Contract tests against ${response?.baseUrl ?? baseUrl}: ${passed}/${total} passed`,
							),
						);
						for (const item of openapiResult?.results ?? []) {
							const status =
								item.status !== undefined && item.status !== 0
									? ` status=${item.status}`
									: "";
							const detail = item.error ? ` ${item.error}` : "";
							contractOutputChannel.appendLine(
								`  - ${item.pass ? "PASS" : "FAIL"} ${item.method ?? "GET"} ${item.path ?? ""}${status}${detail}`,
							);
						}
						for (const workflow of arazzoResult?.workflows ?? []) {
							const detail = workflow.error ? ` ${workflow.error}` : "";
							contractOutputChannel.appendLine(
								`  - ${workflow.pass ? "PASS" : "FAIL"} workflow ${workflow.workflowId ?? ""}${detail}`,
							);
						}
						if (response?.stderr) {
							contractOutputChannel.appendLine(`  stderr: ${response.stderr}`);
						}
						if (result?.pass) {
							window.showInformationMessage(
								`Contract tests passed (${passed}/${total}).`,
							);
						} else {
							window.showWarningMessage(
								`Contract tests found failures (${passed}/${total} passed). See Telescope output for details.`,
							);
						}
					} catch (error) {
						contractOutputChannel.appendLine(
							formatSetupLog(
								`Contract tests failed for ${document.uri.toString()}: ${String(error)}`,
							),
						);
						window.showErrorMessage(
							"Telescope contract tests failed. See Telescope Contract Tests output for details.",
						);
					}
				},
			),
		);

		context.subscriptions.push(
			registerTracedCommand(
				"telescope.showReferences",
				async (
					arg1:
						| string
						| {
								uri: string;
								position: { line: number; character: number };
								locations: Array<{
									uri: string;
									range: {
										start: { line: number; character: number };
										end: { line: number; character: number };
									};
								}>;
						  },
					arg2?: { line: number; character: number },
					arg3?: Array<{
						uri: string;
						range: {
							start: { line: number; character: number };
							end: { line: number; character: number };
						};
					}>,
				) => {
					const payload =
						typeof arg1 === "string"
							? { uri: arg1, position: arg2, locations: arg3 ?? [] }
							: arg1;

					if (
						!payload ||
						typeof payload.uri !== "string" ||
						!payload.position ||
						!Array.isArray(payload.locations)
					) {
						throw new Error("telescope.showReferences: invalid arguments");
					}

					const targetUri = vscode.Uri.parse(payload.uri);
					const pos = new vscode.Position(
						payload.position.line,
						payload.position.character,
					);
					const locs = payload.locations.map((l) => {
						const uri = vscode.Uri.parse(l.uri);
						const range = new vscode.Range(
							new vscode.Position(l.range.start.line, l.range.start.character),
							new vscode.Position(l.range.end.line, l.range.end.character),
						);
						return new vscode.Location(uri, range);
					});

					await vscode.commands.executeCommand(
						"editor.action.showReferences",
						targetUri,
						pos,
						locs,
					);
				},
			),
		);

		// ====================================================================
		// Format Conversion Commands
		// ====================================================================

		async function getDocument(
			uri?: vscode.Uri,
		): Promise<vscode.TextDocument | undefined> {
			if (uri) {
				return workspace.openTextDocument(uri);
			}
			const editor = window.activeTextEditor;
			if (!editor) {
				window.showErrorMessage("No active editor");
				return undefined;
			}
			return editor.document;
		}

		async function fileExists(uri: vscode.Uri): Promise<boolean> {
			try {
				await workspace.fs.stat(uri);
				return true;
			} catch {
				return false;
			}
		}

		async function getNonCollidingPath(
			basePath: string,
			ext: string,
		): Promise<string> {
			let candidatePath = `${basePath} copy${ext}`;
			if (!(await fileExists(vscode.Uri.file(candidatePath)))) {
				return candidatePath;
			}

			let counter = 2;
			while (counter < 1000) {
				candidatePath = `${basePath} copy ${counter}${ext}`;
				if (!(await fileExists(vscode.Uri.file(candidatePath)))) {
					return candidatePath;
				}
				counter++;
			}

			return `${basePath} copy ${Date.now()}${ext}`;
		}

		async function convertJsonToYaml(
			uri: vscode.Uri | undefined,
			deleteOriginal: boolean,
		): Promise<void> {
			try {
				const document = await getDocument(uri);
				if (!document) return;

				const filePath = document.uri.fsPath;
				if (!filePath.endsWith(".json")) {
					window.showErrorMessage("This command only works with .json files");
					return;
				}

				const basePath = filePath.replace(/\.json$/, "");
				let yamlPath = `${basePath}.yaml`;
				let yamlUri = vscode.Uri.file(yamlPath);

				if (await fileExists(yamlUri)) {
					if (deleteOriginal) {
						window.showErrorMessage(
							`Cannot convert: ${path.basename(yamlPath)} already exists`,
						);
						return;
					}
					yamlPath = await getNonCollidingPath(basePath, ".yaml");
					yamlUri = vscode.Uri.file(yamlPath);
				}

				let content: unknown;
				try {
					content = JSON.parse(document.getText());
				} catch (parseError) {
					window.showErrorMessage(
						`Failed to parse JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
					);
					return;
				}

				const yamlContent = yamlStringify(content, {
					lineWidth: 0,
					indent: 2,
				});

				await workspace.fs.writeFile(
					yamlUri,
					Buffer.from(yamlContent, "utf-8"),
				);

				if (deleteOriginal) {
					await workspace.fs.delete(document.uri);
				}

				const yamlDoc = await workspace.openTextDocument(yamlUri);
				await window.showTextDocument(yamlDoc);

				const action = deleteOriginal ? "Converted" : "Copied";
				window.showInformationMessage(
					`${action} ${path.basename(filePath)} to ${path.basename(yamlPath)}`,
				);
			} catch (error) {
				window.showErrorMessage(
					`Conversion failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		async function convertYamlToJson(
			uri: vscode.Uri | undefined,
			deleteOriginal: boolean,
		): Promise<void> {
			try {
				const document = await getDocument(uri);
				if (!document) return;

				const filePath = document.uri.fsPath;
				if (!filePath.endsWith(".yaml") && !filePath.endsWith(".yml")) {
					window.showErrorMessage(
						"This command only works with .yaml or .yml files",
					);
					return;
				}

				const basePath = filePath.replace(/\.ya?ml$/, "");
				let jsonPath = `${basePath}.json`;
				let jsonUri = vscode.Uri.file(jsonPath);

				if (await fileExists(jsonUri)) {
					if (deleteOriginal) {
						window.showErrorMessage(
							`Cannot convert: ${path.basename(jsonPath)} already exists`,
						);
						return;
					}
					jsonPath = await getNonCollidingPath(basePath, ".json");
					jsonUri = vscode.Uri.file(jsonPath);
				}

				let content: unknown;
				try {
					content = yamlParse(document.getText());
				} catch (parseError) {
					window.showErrorMessage(
						`Failed to parse YAML: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
					);
					return;
				}

				const jsonContent = JSON.stringify(content, null, 2);

				await workspace.fs.writeFile(
					jsonUri,
					Buffer.from(jsonContent, "utf-8"),
				);

				if (deleteOriginal) {
					await workspace.fs.delete(document.uri);
				}

				const jsonDoc = await workspace.openTextDocument(jsonUri);
				await window.showTextDocument(jsonDoc);

				const action = deleteOriginal ? "Converted" : "Copied";
				window.showInformationMessage(
					`${action} ${path.basename(filePath)} to ${path.basename(jsonPath)}`,
				);
			} catch (error) {
				window.showErrorMessage(
					`Conversion failed: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		context.subscriptions.push(
			registerTracedCommand(
				"telescope.convertJsonToYaml",
				(uri?: vscode.Uri) => convertJsonToYaml(uri, true),
			),
			registerTracedCommand(
				"telescope.convertJsonToYamlCopy",
				(uri?: vscode.Uri) => convertJsonToYaml(uri, false),
			),
			registerTracedCommand(
				"telescope.convertYamlToJson",
				(uri?: vscode.Uri) => convertYamlToJson(uri, true),
			),
			registerTracedCommand(
				"telescope.convertYamlToJsonCopy",
				(uri?: vscode.Uri) => convertYamlToJson(uri, false),
			),
		);

		// Test API for E2E tests
		const testAPI = {
			async waitForSessionsRunning(timeoutMs = 30000): Promise<void> {
				const startTime = Date.now();
				while (Date.now() - startTime < timeoutMs) {
					if (sessionManager) {
						await sessionManager.waitForReady();
						const runningSessions = sessionManager.getRunningSessions();
						const allSessions = sessionManager.getAllSessions();
						if (
							allSessions.length > 0 &&
							runningSessions.length === allSessions.length
						) {
							return;
						}
					}
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				const states = sessionManager
					? sessionManager.getAllSessions().map((s) => ({
							folder: s.workspaceFolder.name,
							state: s.state,
							error: s.lastStartError,
						}))
					: [];
				const folderNames =
					vscode.workspace.workspaceFolders?.map((f) => f.name) ?? [];
				throw new Error(
					`Timeout waiting for sessions to be running after ${timeoutMs}ms. workspaceFolders=${JSON.stringify(
						folderNames,
					)} sessionStates=${JSON.stringify(states)}`,
				);
			},

			getSessionStates(): Array<{ folder: string; state: string }> {
				if (!sessionManager) {
					return [];
				}
				return sessionManager.getAllSessions().map((session) => ({
					folder: session.workspaceFolder.name,
					state: session.state,
					error: session.lastStartError,
				}));
			},

			getProjectInfo(uri?: vscode.Uri): {
				knownOpenAPIFiles: number;
				workspacePath: string | null;
			} | null {
				if (!sessionManager) {
					return null;
				}

				const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
				if (!targetUri) {
					return null;
				}

				const session = sessionManager.getSessionForUri(targetUri);
				if (!session) {
					return null;
				}

				return session.getProjectInfo();
			},

			getClientOpenApiFileCount(uri?: vscode.Uri): number {
				if (!sessionManager) return 0;
				const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
				if (!targetUri) return 0;
				const session = sessionManager.getSessionForUri(targetUri);
				if (!session) return 0;
				return session.getClientOpenApiFileCount();
			},

			/**
			 * E2E-only: query document symbols straight from the LSP client so tests
			 * can wait on a server-backed analysis signal instead of proxying through
			 * editor features like code lenses.
			 */
			async requestDocumentSymbols(
				uri: vscode.Uri,
			): Promise<vscode.DocumentSymbol[] | null> {
				if (!sessionManager) {
					return null;
				}
				const textDoc = await workspace.openTextDocument(uri);
				const session = sessionManager.getSessionForUri(textDoc.uri);
				if (!session) {
					return null;
				}
				const client = session.getClient();
				if (!client) {
					return null;
				}
				const lspURI = client.code2ProtocolConverter.asUri(textDoc.uri);
				return (await client.sendRequest(DocumentSymbolRequest.type, {
					textDocument: { uri: lspURI },
				})) as vscode.DocumentSymbol[] | null;
			},

			/**
			 * E2E-only: query textDocument/definition straight from the LSP client so
			 * readiness gates can depend on server resolution instead of editor
			 * provider registration timing.
			 */
			async requestDefinition(
				uri: vscode.Uri,
				pos: vscode.Position,
			): Promise<(vscode.Location | vscode.LocationLink)[] | null> {
				if (!sessionManager) {
					return null;
				}
				const textDoc = await workspace.openTextDocument(uri);
				const session = sessionManager.getSessionForUri(textDoc.uri);
				if (!session) {
					return null;
				}
				const client = session.getClient();
				if (!client) {
					return null;
				}
				const lspURI = client.code2ProtocolConverter.asUri(textDoc.uri);
				const result = await client.sendRequest(DefinitionRequest.type, {
					textDocument: { uri: lspURI },
					position: { line: pos.line, character: pos.character },
				});
				return protocolDefinitionToCode(
					result as
						| {
								uri: string;
								range: {
									start: { line: number; character: number };
									end: { line: number; character: number };
								};
						  }
						| {
								targetUri: string;
								targetRange: {
									start: { line: number; character: number };
									end: { line: number; character: number };
								};
								targetSelectionRange: {
									start: { line: number; character: number };
									end: { line: number; character: number };
								};
								originSelectionRange?: {
									start: { line: number; character: number };
									end: { line: number; character: number };
								};
						  }
						| Array<
								| {
										uri: string;
										range: {
											start: { line: number; character: number };
											end: { line: number; character: number };
										};
								  }
								| {
										targetUri: string;
										targetRange: {
											start: { line: number; character: number };
											end: { line: number; character: number };
										};
										targetSelectionRange: {
											start: { line: number; character: number };
											end: { line: number; character: number };
										};
										originSelectionRange?: {
											start: { line: number; character: number };
											end: { line: number; character: number };
										};
								  }
						  >
						| null,
				);
			},

			/**
			 * E2E-only: query whether the Bun sidecar is configured and currently
			 * available for the session that owns `uri`.
			 */
			async requestSidecarInfo(
				uri?: vscode.Uri,
			): Promise<{ configured: boolean; available: boolean } | null> {
				if (!sessionManager) {
					return null;
				}
				const targetUri = uri || workspace.workspaceFolders?.[0]?.uri;
				if (!targetUri) {
					return null;
				}
				const textDoc = await workspace.openTextDocument(targetUri);
				const session = sessionManager.getSessionForUri(textDoc.uri);
				if (!session) {
					return null;
				}
				const client = session.getClient();
				if (!client) {
					return null;
				}
				return (await client.sendRequest("$/telescope/sidecarInfo", {})) as {
					configured: boolean;
					available: boolean;
				} | null;
			},

			/**
			 * E2E-only: call textDocument/formatting on the LSP without VS Code's
			 * executeFormatDocumentProvider pipeline (needed for openapi-yaml).
			 */
			async requestDocumentFormatting(
				uri: vscode.Uri,
			): Promise<vscode.TextEdit[] | null> {
				if (!sessionManager) {
					return null;
				}
				// Ensure the workspace document is loaded so the URI matches what
				// didOpen/didChange used when syncing to the language server.
				const textDoc = await workspace.openTextDocument(uri);
				const session = sessionManager.getSessionForUri(textDoc.uri);
				if (!session) {
					return null;
				}
				const client = session.getClient();
				if (!client) {
					return null;
				}
				const lspURI = client.code2ProtocolConverter.asUri(textDoc.uri);
				return (await client.sendRequest(DocumentFormattingRequest.type, {
					textDocument: { uri: lspURI },
					options: { tabSize: 2, insertSpaces: true },
				})) as vscode.TextEdit[] | null;
			},
		};

		return {
			__telescopeTest: testAPI,
		};
	} catch (error: unknown) {
		console.error("Failed to activate Telescope extension:", error);
		window.showErrorMessage(
			`Telescope activation failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);

		try {
			if (sessionManager) {
				await sessionManager.disposeAsync();
			}
		} catch (disposeError) {
			console.error(
				"Failed to dispose sessionManager after activation failure:",
				disposeError,
			);
		} finally {
			sessionManager = null;
		}

		return {
			__telescopeTest: activationFailedTestApi(error),
		};
	}
}

export async function deactivate(): Promise<void> {
	if (sessionManager) {
		await sessionManager.disposeAsync();
		sessionManager = null;
	}
}
