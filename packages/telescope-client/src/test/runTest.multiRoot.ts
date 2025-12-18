/**
 * VS Code Extension Test Runner (Multi-root)
 *
 * Launches VS Code with a multi-root .code-workspace and runs the same extension-host test suite.
 */

import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main() {
	try {
		// Propagate E2E mode to the extension host tests.
		process.env.TELESCOPE_E2E_MODE = "multi";
		process.env.TELESCOPE_E2E_TIMEOUT_MS = process.env.TELESCOPE_E2E_TIMEOUT_MS ?? "600000";

		const extensionDevelopmentPath = path.resolve(__dirname, "../..");
		const extensionTestsPath = path.resolve(__dirname, "./suite/index");

		const workspacePath = path.resolve(
			extensionDevelopmentPath,
			"test-fixtures/workspace-multi/telescope-multi.code-workspace",
		);

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [
				workspacePath,
				"--disable-extensions",
				"--disable-workspace-trust",
			],
			version: "stable",
		});
	} catch (err) {
		console.error("Failed to run multi-root tests");
		console.error(err);
		process.exit(1);
	}
}

main();


