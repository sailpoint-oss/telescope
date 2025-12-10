/**
 * Telescope VS Code Extension
 *
 * This extension provides language support for OpenAPI specifications.
 * It uses a per-workspace-folder LSP architecture where each workspace
 * folder gets its own language server instance for true isolation.
 */

import * as path from "node:path";
import { createLabsInfo } from "@volar/vscode";
import * as vscode from "vscode";
import { commands, type ExtensionContext, window, workspace } from "vscode";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { SessionManager } from "./session-manager";
import {
	classifyDocument,
	findNodePath,
	formatSetupLog,
	getNodeVersion,
} from "./utils";

/** Global session manager instance */
let sessionManager: SessionManager | null = null;

export async function activate(context: ExtensionContext) {
	try {
		// Create output channel
		const outputChannel = window.createOutputChannel(
			"Telescope Language Server",
			{ log: true },
		);

		// Write initial messages to make channel visible
		outputChannel.appendLine(
			formatSetupLog(`Telescope Language Server starting...`),
		);
		outputChannel.show(true);

		// Get Node.js runtime path
		const nodePath = findNodePath();
		outputChannel.appendLine(
			formatSetupLog(`✅ Using Node.js runtime: ${nodePath}`),
		);
		outputChannel.appendLine(
			formatSetupLog(`Node.js version: ${getNodeVersion()}`),
		);

		// Resolve server path (bundled with the extension)
		const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));
		outputChannel.appendLine(formatSetupLog(`Server module: ${serverModule}`));

		// Create status bar item for scanner progress
		const statusBarItem = window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100,
		);
		statusBarItem.command = "telescope.showOpenAPIFiles";
		context.subscriptions.push(statusBarItem);

		// Create the session manager
		sessionManager = new SessionManager({
			serverModule,
			nodePath,
			outputChannel,
			statusBarItem,
		});

		context.subscriptions.push(sessionManager);

		// Initialize sessions asynchronously in the background to avoid blocking activation.
		// This allows the extension to activate immediately while sessions start up.
		// Commands and features gracefully handle cases where sessions aren't ready yet.
		sessionManager.initialize().then(
			() => {
				outputChannel.appendLine(formatSetupLog("✅ All sessions initialized"));
			},
			(error) => {
				outputChannel.appendLine(
					formatSetupLog(`⚠️ Session initialization had errors: ${error}`),
				);
			},
		);

		outputChannel.appendLine(
			formatSetupLog("✅ Telescope extension activated"),
		);

		// ====================================================================
		// Commands
		// ====================================================================

		// Register command to manually trigger classification
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

		// Register command to clear user override and re-classify
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

		// Register command to show list of OpenAPI files
		context.subscriptions.push(
			commands.registerCommand("telescope.showOpenAPIFiles", async () => {
				const files = sessionManager?.getAllOpenAPIFiles() || [];
				if (files.length === 0) {
					window.showInformationMessage("No OpenAPI files found in workspace");
					return;
				}

				// Show quick pick with OpenAPI files
				const items = files.map((uri) => {
					const parsedUri = vscode.Uri.parse(uri);
					return {
						label: path.basename(parsedUri.fsPath),
						description: workspace.asRelativePath(parsedUri),
						uri: parsedUri,
					};
				});

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

		// Register command to rescan workspace
		context.subscriptions.push(
			commands.registerCommand("telescope.rescanWorkspace", async () => {
				const totalFiles = await sessionManager?.rescanAll();
				window.showInformationMessage(
					`Scan complete: ${totalFiles || 0} OpenAPI files found`,
				);
			}),
		);

		// Register command to restart all sessions
		context.subscriptions.push(
			commands.registerCommand("telescope.restartServer", async () => {
				await sessionManager?.restartAllSessions();
				window.showInformationMessage("Telescope language servers restarted");
			}),
		);

		// ====================================================================
		// Format Conversion Commands
		// ====================================================================

		/**
		 * Helper to get a document from URI or active editor
		 */
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

		/**
		 * Check if a file exists at the given URI
		 */
		async function fileExists(uri: vscode.Uri): Promise<boolean> {
			try {
				await workspace.fs.stat(uri);
				return true;
			} catch {
				return false;
			}
		}

		/**
		 * Generate a non-colliding filename following VS Code's copy naming convention.
		 */
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

		/**
		 * Convert JSON to YAML
		 */
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

		/**
		 * Convert YAML to JSON
		 */
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

		// Register all conversion commands
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

		// ====================================================================
		// Volar Labs Support
		// ====================================================================

		// Add all running clients to Volar Labs
		const labsInfo = createLabsInfo();
		for (const session of sessionManager.getAllSessions()) {
			const client = session.getClient();
			if (client) {
				labsInfo.addLanguageClient(client);
			}
		}

		return labsInfo.extensionExports;
	} catch (error: unknown) {
		console.error("❌ Failed to activate Telescope extension:", error);
		window.showErrorMessage(
			`Telescope activation failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

export async function deactivate(): Promise<void> {
	if (sessionManager) {
		sessionManager.dispose();
		sessionManager = null;
	}
}
