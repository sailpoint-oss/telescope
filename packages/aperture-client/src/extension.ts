import { execSync } from "node:child_process";
import * as path from "node:path";
import { createLabsInfo, Trace } from "@volar/vscode";
import { type ExtensionContext, window, workspace } from "vscode";
import {
	type BaseLanguageClient,
	LanguageClient,
	type LanguageClientOptions,
	type ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

let client: BaseLanguageClient;

// biome-ignore lint/suspicious/noExplicitAny: These should ACTUALLY be any
function formatSetupLog(message: any, ...args: any[]) {
	return `[Setup] ${message} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`;
}

/**
 * Check if Bun is installed and return its path, or null if not found.
 */
function findBunPath(): string | null {
	try {
		// Try to find bun in PATH
		const bunPath = execSync("which bun", {
			encoding: "utf-8",
			stdio: "pipe",
		}).trim();
		if (bunPath) {
			// Verify it's actually bun by checking version
			try {
				execSync(`${bunPath} --version`, { encoding: "utf-8", stdio: "pipe" });
				return bunPath;
			} catch {
				return null;
			}
		}
		return null;
	} catch {
		// Bun not found in PATH
		return null;
	}
}

/**
 * Show an error message to the user when Bun is not installed.
 * The message text can be customized by the user.
 */
function showBunRequiredMessage(outputChannel: {
	appendLine: (message: string) => void;
}): void {
	// TODO: Customize this message as needed
	const message =
		"Bun is required for this extension. Please install Bun to continue.";

	window.showErrorMessage(message);
	outputChannel.appendLine(formatSetupLog("❌ ERROR: Bun runtime not found"));
	outputChannel.appendLine(
		formatSetupLog("   Install Bun: https://bun.sh/docs/installation"),
	);
}

export async function activate(context: ExtensionContext) {
	try {
		// Resolve server path: use workspace package if available, otherwise fallback to node_modules
		const serverModule = context.asAbsolutePath(
			path.join("node_modules", "aperture-lsp", "out", "server.js"),
		);
		console.log(
			formatSetupLog(
				`Launching Aperture language server from: ${serverModule}`,
			),
		);

		// Create output channel
		const outputChannel = window.createOutputChannel(
			"Aperture Language Server",
			{ log: true },
		);

		// Write initial messages to make channel visible
		outputChannel.appendLine(
			formatSetupLog(`Aperture Language Server starting...`),
		);
		outputChannel.show(true); // Show the channel in the Output panel

		// Check for Bun installation - Bun is required
		const bunPath = findBunPath();
		if (!bunPath) {
			showBunRequiredMessage(outputChannel);
			throw new Error(
				"Bun runtime is required but not found. Please install Bun: https://bun.sh/",
			);
		}

		outputChannel.appendLine(
			formatSetupLog(`✅ Using Bun runtime: ${bunPath}`),
		);
		try {
			const bunVersion = execSync(`${bunPath} --version`, {
				encoding: "utf-8",
				stdio: "pipe",
			}).trim();
			outputChannel.appendLine(formatSetupLog(`Bun version: ${bunVersion}`));
		} catch {
			// Ignore version check errors
		}

		// Configure server options - Bun is required
		// Note: When using 'command' (executable), we must use stdio transport, not IPC
		const serverOptions: ServerOptions = {
			run: {
				command: bunPath,
				args: [serverModule],
				transport: TransportKind.stdio,
			},
			debug: {
				command: bunPath,
				args: ["--inspect", serverModule],
				transport: TransportKind.stdio,
			},
		};

		// Options to control the language client
		const clientOptions: LanguageClientOptions = {
			// Register the server for YAML and JSON documents
			// Use both language IDs and file patterns to ensure proper matching
			documentSelector: [
				{ language: "yaml" },
				{ language: "json" },
				{ pattern: "**/*.yaml" },
				{ pattern: "**/*.yml" },
				{ pattern: "**/*.json" },
			],
			synchronize: {
				// Notify the server about file changes to '.clientrc files contained in the workspace
				fileEvents: workspace.createFileSystemWatcher(".telescope/config.yaml"),
			},
			outputChannel: outputChannel,
			initializationOptions: {},
			markdown: {
				isTrusted: true,
				supportHtml: true,
			},
		};

		// Create the language client and start the client.
		client = new LanguageClient(
			"aperture",
			"Aperture OpenAPI Language Server",
			serverOptions,
			clientOptions,
		);

		// Enable trace logging for debugging (set to Trace.Verbose for maximum detail)
		client.setTrace(Trace.Verbose);

		try {
			// Start the client. This will also launch the server
			await client.start();
		} catch (error: unknown) {
			const errorMsg = `Failed to start language client: ${
				error instanceof Error ? error.message : String(error)
			}`;
			outputChannel.appendLine(formatSetupLog(`❌ ERROR: ${errorMsg}`));
			if (error instanceof Error && error.stack) {
				outputChannel.appendLine(formatSetupLog(error.stack));
			}
			console.error(
				formatSetupLog(`❌ Aperture extension failed to start:`, error),
			);
			window.showErrorMessage(formatSetupLog(`Aperture: ${errorMsg}`));
		}

		outputChannel.appendLine(formatSetupLog("✅ Aperture extension activated"));
		// Needed code to add support for Volar Labs
		// https://volarjs.dev/core-concepts/volar-labs/
		const labsInfo = createLabsInfo();
		labsInfo.addLanguageClient(client);
		return labsInfo.extensionExports;
	} catch (error: unknown) {
		console.error("❌ Failed to activate Aperture extension:", error);
		window.showErrorMessage(
			`Aperture activation failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

// ... and this function is called when the extension is deactivated!
export function deactivate(): Thenable<unknown> | undefined {
	return client?.stop();
}
