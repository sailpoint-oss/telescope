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

export async function activate(context: ExtensionContext) {
	try {
		// Resolve server path: use workspace package if available, otherwise fallback to node_modules
		const serverModule = context.asAbsolutePath(
			path.join("..", "aperture-lsp", "out", "server.js"),
		);
		console.log(`Launching Aperture language server from: ${serverModule}`);

		// If the extension is launched in debug mode then the debug server options are used
		// Otherwise the run options are used
		const serverOptions: ServerOptions = {
			run: {
				module: serverModule,
				transport: TransportKind.ipc,
				options: { execArgv: [] },
			},
			debug: {
				module: serverModule,
				transport: TransportKind.ipc,
				options: { execArgv: ["--nolazy", "--inspect=6009"] },
			},
		};

		// Create output channels for logging
		const outputChannel = window.createOutputChannel(
			"Aperture Language Server",
		);

		// Write initial messages to make channels visible
		outputChannel.appendLine(`Aperture Language Server starting...`);
		outputChannel.show(true); // Show the channel in the Output panel

		// Options to control the language client
		const clientOptions: LanguageClientOptions = {
			// Register the server for YAML and JSON documents
			documentSelector: [{ language: "yaml" }, { language: "json" }],
			synchronize: {
				// Notify the server about file changes to '.clientrc files contained in the workspace
				fileEvents: workspace.createFileSystemWatcher("**/.aperturerc"),
			},
			outputChannel: outputChannel,
			initializationOptions: {},
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
			outputChannel.appendLine(`❌ ERROR: ${errorMsg}`);
			if (error instanceof Error && error.stack) {
				outputChannel.appendLine(error.stack);
			}
			console.error(`❌ Aperture extension failed to start:`, error);
			window.showErrorMessage(`Aperture: ${errorMsg}`);
		}

		outputChannel.appendLine("✅ Aperture extension activated");
		// Needed code to add support for Volar Labs
		// https://volarjs.dev/core-concepts/volar-labs/
		const labsInfo = createLabsInfo();
		labsInfo.addLanguageClient(client);
		return labsInfo.extensionExports;
	} catch (error: unknown) {
		console.error("❌ Failed to activate Aperture extension:", error);
		window.showErrorMessage(
			`Aperture activation failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

// ... and this function is called when the extension is deactivated!
export function deactivate(): Thenable<unknown> | undefined {
	return client?.stop();
}
