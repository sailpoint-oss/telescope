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
		// Propagate E2E mode to the extension host tests.
		process.env.TELESCOPE_E2E_MODE = "single";
		process.env.TELESCOPE_E2E_TIMEOUT_MS = process.env.TELESCOPE_E2E_TIMEOUT_MS ?? "120000";

		// The folder containing the Extension Manifest package.json
		// When compiled, __dirname points to out/test, so we go up two levels to package root
		const extensionDevelopmentPath = path.resolve(__dirname, "../..");

		// The path to test runner (compiled to out/test/suite/index.js)
		const extensionTestsPath = path.resolve(__dirname, "./suite/index");

		// Path to workspace folder or .code-workspace file
		const workspacePath = path.resolve(
			extensionDevelopmentPath,
			"test-fixtures/workspace-basic",
		);

		// Download VS Code, unzip it and run the integration test
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [
				workspacePath,
				"--disable-extensions", // Disable all other extensions
				"--disable-workspace-trust", // Disable workspace trust prompts
			],
			version: "stable", // Use stable VS Code version
		});
	} catch (err) {
		console.error("Failed to run tests");
		console.error(err);
		process.exit(1);
	}
}

main();

