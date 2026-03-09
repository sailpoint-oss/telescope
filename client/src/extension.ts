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
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { SessionManager } from "./session-manager";
import { classifyDocument, formatSetupLog } from "./utils";

const execFileAsync = promisify(execFile);

/** Global session manager instance */
let sessionManager: SessionManager | null = null;

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
			`install it on your PATH, or ensure the bundled binary exists at bin/${binaryName}.`,
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
			async getDiagnostics(): Promise<unknown> {
				await fail();
				return null;
			},
			getClientOpenApiFileCount(): number {
				throw new Error(`Telescope activation failed: ${msg}`);
			},
		};
	};

	try {
		const outputChannel = window.createOutputChannel(
			"Telescope Language Server",
			{ log: true },
		);

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

		// ====================================================================
		// Commands
		// ====================================================================

		context.subscriptions.push(
			commands.registerCommand("openapi-grammar.classifyDocument", async () => {
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
			commands.registerCommand("telescope.reclassifyDocument", async () => {
				const editor = window.activeTextEditor;
				if (editor) {
					const isOpenAPI = await sessionManager?.reclassifyDocument(
						editor.document,
					);
					if (isOpenAPI) {
						window.showInformationMessage("Document reclassified as: OpenAPI");
					} else {
						window.showInformationMessage(
							"Document is not recognized as an OpenAPI document",
						);
					}
				}
			}),
		);

		context.subscriptions.push(
			commands.registerCommand("telescope.showOpenAPIFiles", async () => {
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
			commands.registerCommand("telescope.rescanWorkspace", async () => {
				const totalFiles = await sessionManager?.rescanAll();
				window.showInformationMessage(
					`Scan complete: ${totalFiles || 0} OpenAPI files found`,
				);
			}),
		);

		context.subscriptions.push(
			commands.registerCommand("telescope.restartServer", async () => {
				await sessionManager?.restartAllSessions();
				window.showInformationMessage("Telescope language servers restarted");
			}),
		);

		context.subscriptions.push(
			commands.registerCommand("telescope.graphInfo", async () => {
				if (!sessionManager) return;
				const sessions = sessionManager.getRunningSessions();
				const results: string[] = [];
				for (const session of sessions) {
					const client = session.getClient();
					if (!client) continue;
					try {
						const info = await client.sendRequest("$/telescope/graphInfo");
						results.push(
							`**${session.folder.name}**\n\`\`\`json\n${JSON.stringify(info, null, 2)}\n\`\`\``,
						);
					} catch {
						results.push(`**${session.folder.name}**: Error fetching graph info`);
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
			commands.registerCommand("telescope.rulePerf", async () => {
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
							`**${session.folder.name}**\n\n| Rule | Duration | Diagnostics |\n|------|----------|-------------|\n${lines.join("\n")}`,
						);
					} catch {
						results.push(
							`**${session.folder.name}**: Error fetching rule performance`,
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
				commands.registerCommand(cmd, async (uri?: vscode.Uri) => {
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
			commands.registerCommand(
				"telescope.bundlePreview",
				async (uriOrString?: vscode.Uri | string) => {
					const uri =
						typeof uriOrString === "string"
							? vscode.Uri.parse(uriOrString)
							: uriOrString;
					const document = await getDocument(uri);
					if (!document) return;

					try {
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
						const previewDoc = await workspace.openTextDocument({
							content,
							language,
						});
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
			commands.registerCommand(
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
			commands.registerCommand(
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
			commands.registerCommand(
				"telescope.convertJsonToYaml",
				(uri?: vscode.Uri) => convertJsonToYaml(uri, true),
			),
			commands.registerCommand(
				"telescope.convertJsonToYamlCopy",
				(uri?: vscode.Uri) => convertJsonToYaml(uri, false),
			),
			commands.registerCommand(
				"telescope.convertYamlToJson",
				(uri?: vscode.Uri) => convertYamlToJson(uri, true),
			),
			commands.registerCommand(
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
