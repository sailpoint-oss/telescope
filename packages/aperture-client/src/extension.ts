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
  outputChannel.appendLine("❌ ERROR: Bun runtime not found");
  outputChannel.appendLine("   Install Bun: https://bun.sh/docs/installation");
}

export async function activate(context: ExtensionContext) {
  try {
    // Resolve server path: use workspace package if available, otherwise fallback to node_modules
    const serverModule = context.asAbsolutePath(
      path.join("node_modules", "aperture-lsp", "out", "server.js")
    );
    console.log(`Launching Aperture language server from: ${serverModule}`);

    // Create output channel
    const outputChannel = window.createOutputChannel(
      "Aperture Language Server"
    );

    // Write initial messages to make channel visible
    outputChannel.appendLine(`Aperture Language Server starting...`);
    outputChannel.show(true); // Show the channel in the Output panel

    // Check for Bun installation - Bun is required
    const bunPath = findBunPath();
    if (!bunPath) {
      showBunRequiredMessage(outputChannel);
      throw new Error(
        "Bun runtime is required but not found. Please install Bun: https://bun.sh/"
      );
    }

    outputChannel.appendLine(`✅ Using Bun runtime: ${bunPath}`);
    try {
      const bunVersion = execSync(`${bunPath} --version`, {
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();
      outputChannel.appendLine(`Bun version: ${bunVersion}`);
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
        // Use --inspect-wait with fixed port 6009 for VSCode debugger attachment
        // If port 6009 is in use, kill existing Bun processes: lsof -ti:6009 | xargs kill -9
        args: ["--inspect=6009", serverModule],
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
    };

    // Create the language client and start the client.
    client = new LanguageClient(
      "aperture",
      "Aperture OpenAPI Language Server",
      serverOptions,
      clientOptions
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
      `Aperture activation failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ... and this function is called when the extension is deactivated!
export function deactivate(): Thenable<unknown> | undefined {
  return client?.stop();
}
