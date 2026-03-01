/**
 * VS Code Extension Test Runner
 *
 * This file is executed by Node.js and launches VS Code with the extension
 * under test, then runs the test suite inside the extension host.
 */

import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main() {
	try {
		process.env.TELESCOPE_E2E_MODE = "single";
		process.env.TELESCOPE_E2E_TIMEOUT_MS = process.env.TELESCOPE_E2E_TIMEOUT_MS ?? "120000";

		const extensionDevelopmentPath = path.resolve(__dirname, "../..");
		const extensionTestsPath = path.resolve(__dirname, "./suite/index");

		const workspacePath = path.resolve(
			extensionDevelopmentPath,
			"test-fixtures/workspace-basic",
		);

		// Point to the Go binary built by `build:server` task.
		// The binary lives at packages/telescope-client/bin/telescope[.exe] after `go build`.
		if (!process.env.TELESCOPE_SERVER_PATH) {
			const binaryName = process.platform === "win32" ? "telescope.exe" : "telescope";
			process.env.TELESCOPE_SERVER_PATH = path.resolve(
				extensionDevelopmentPath,
				"bin",
				binaryName,
			);
		}

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [
				workspacePath,
				"--disable-extensions",
				"--disable-workspace-trust",
			],
			extensionTestsEnv: {
				TELESCOPE_SERVER_PATH: process.env.TELESCOPE_SERVER_PATH,
				TELESCOPE_E2E_MODE: process.env.TELESCOPE_E2E_MODE,
				TELESCOPE_E2E_TIMEOUT_MS: process.env.TELESCOPE_E2E_TIMEOUT_MS,
			},
			version: "stable",
		});
	} catch (err) {
		console.error("Failed to run tests");
		console.error(err);
		process.exit(1);
	}
}

main();
