/**
 * VS Code Extension Test Runner (Multi-root)
 *
 * Launches VS Code with a multi-root .code-workspace and runs the same extension-host test suite.
 */

import * as path from "node:path";
import { runTests } from "@vscode/test-electron";
import { VSCODE_TEST_VERSION } from "./vscode-test-version";

async function main() {
	try {
		if (process.argv.includes("--smoke")) {
			process.env.TELESCOPE_E2E_SMOKE = "1";
		}
		process.env.TELESCOPE_E2E_MODE = process.env.TELESCOPE_E2E_MODE ?? "multi";
		process.env.TELESCOPE_E2E_TIMEOUT_MS = process.env.TELESCOPE_E2E_TIMEOUT_MS ?? "600000";

		const extensionDevelopmentPath = path.resolve(__dirname, "../..");
		const extensionTestsPath = path.resolve(__dirname, "./suite/index");

		const workspacePath = path.resolve(
			extensionDevelopmentPath,
			"test-fixtures/workspace-multi/telescope-multi.code-workspace",
		);

		if (!process.env.TELESCOPE_SERVER_PATH) {
			const binaryName = process.platform === "win32" ? "telescope.exe" : "telescope";
			process.env.TELESCOPE_SERVER_PATH = path.resolve(
				extensionDevelopmentPath,
				"bin",
				binaryName,
			);
		}

		// eslint-disable-next-line no-console
		console.log(`[e2e multi] Using VS Code test version: ${VSCODE_TEST_VERSION}`);

		const cachePath = path.resolve(extensionDevelopmentPath, ".vscode-test");

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			cachePath,
			launchArgs: [
				workspacePath,
				"--disable-extensions",
				"--disable-workspace-trust",
				"--disable-gpu",
			],
			extensionTestsEnv: {
				TELESCOPE_SERVER_PATH: process.env.TELESCOPE_SERVER_PATH,
				TELESCOPE_E2E_MODE: process.env.TELESCOPE_E2E_MODE,
				TELESCOPE_E2E_TIMEOUT_MS: process.env.TELESCOPE_E2E_TIMEOUT_MS,
				TELESCOPE_E2E_SMOKE: process.env.TELESCOPE_E2E_SMOKE,
				TELESCOPE_E2E_RETRIES: process.env.TELESCOPE_E2E_RETRIES,
				VSCODE_TEST_VERSION,
			},
			version: VSCODE_TEST_VERSION,
		});
	} catch (err) {
		console.error("Failed to run multi-root tests");
		console.error(err);
		process.exit(1);
	}
}

main();
