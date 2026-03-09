/**
 * VS Code Extension Test Suite Bootstrap
 *
 * This file runs inside the VS Code extension host and sets up Mocha
 * to run all test files in this directory.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import Mocha from "mocha";

/**
 * Recursively find all test files matching the pattern
 */
function findTestFiles(dir: string, fileList: string[] = []): string[] {
	const files = fs.readdirSync(dir);

	for (const file of files) {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);

		if (stat.isDirectory()) {
			findTestFiles(filePath, fileList);
		} else if (file.endsWith(".e2e.js")) {
			fileList.push(filePath);
		}
	}

	return fileList;
}

export function run(): Promise<void> {
	// Create the mocha test
	const timeoutMs = Number(process.env.TELESCOPE_E2E_TIMEOUT_MS ?? "120000");
	const mocha = new Mocha({
		ui: "tdd",
		color: true,
		timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120000,
	});

	const testsRoot = path.resolve(__dirname, "..");
	const allTestFiles = findTestFiles(testsRoot);

	const mode = process.env.TELESCOPE_E2E_MODE;
	const testFiles =
		mode === "multi"
			? allTestFiles.filter((f) => {
					const base = path.basename(f);
					return base === "activation.e2e.js" || base === "multi-root.e2e.js";
				})
			: mode === "sidecar"
				? allTestFiles.filter((f) => {
						const base = path.basename(f);
						return base === "activation.e2e.js" || base.startsWith("sidecar-");
					})
				: mode === "single"
					? allTestFiles.filter((f) => path.basename(f) !== "multi-root.e2e.js")
					: allTestFiles;

	// Add files to the test suite
	testFiles.forEach((f) => mocha.addFile(f));

	return new Promise((c, e) => {
		try {
			// Run the mocha test
			mocha.run((failures: number) => {
				if (failures > 0) {
					e(new Error(`${failures} test(s) failed.`));
				} else {
					c();
				}
			});
		} catch (err) {
			console.error(err);
			e(err);
		}
	});
}

