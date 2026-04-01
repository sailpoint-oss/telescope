/**
 * VS Code Extension Test Runner (Sidecar / test-files workspace)
 *
 * Launches VS Code with the root test-files/ workspace that contains
 * .telescope/ config with custom TS rules, Zod schemas, generic rules,
 * and JSON Schema validation. Runs sidecar-specific E2E tests.
 */

import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main() {
	try {
		if (process.argv.includes("--smoke")) {
			process.env.TELESCOPE_E2E_SMOKE = "1";
		}
		process.env.TELESCOPE_E2E_MODE = process.env.TELESCOPE_E2E_MODE ?? "sidecar";
		process.env.TELESCOPE_E2E_TIMEOUT_MS = process.env.TELESCOPE_E2E_TIMEOUT_MS ?? "300000";
		// E2E binary is built with -tags=embed_runner; omit TELESCOPE_DEV so CI uses the embedded Bun runner (production-like).

		const extensionDevelopmentPath = path.resolve(__dirname, "../..");
		const extensionTestsPath = path.resolve(__dirname, "./suite/index");

		const workspacePath = path.resolve(
			extensionDevelopmentPath,
			"../test-files",
		);

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
				"--disable-gpu",
			],
			extensionTestsEnv: {
				TELESCOPE_SERVER_PATH: process.env.TELESCOPE_SERVER_PATH,
				TELESCOPE_E2E_MODE: process.env.TELESCOPE_E2E_MODE,
				TELESCOPE_E2E_TIMEOUT_MS: process.env.TELESCOPE_E2E_TIMEOUT_MS,
				TELESCOPE_E2E_SMOKE: process.env.TELESCOPE_E2E_SMOKE,
				TELESCOPE_E2E_RETRIES: process.env.TELESCOPE_E2E_RETRIES,
			},
			version: "stable",
		});
	} catch (err) {
		console.error("Failed to run sidecar tests");
		console.error(err);
		process.exit(1);
	}
}

main();
