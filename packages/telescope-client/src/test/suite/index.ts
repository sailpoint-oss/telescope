/**
 * VS Code Extension Test Suite Bootstrap
 *
 * This file runs inside the VS Code extension host and sets up Mocha
 * to run all test files in this directory.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as Mocha from "mocha";

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
		} else if (file.endsWith(".test.js")) {
			fileList.push(filePath);
		}
	}

	return fileList;
}

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: "tdd",
		color: true,
		timeout: 30000, // 30 second timeout per test
	});

	const testsRoot = path.resolve(__dirname, "..");
	const testFiles = findTestFiles(testsRoot);

	// Add files to the test suite
	testFiles.forEach((f) => mocha.addFile(f));

	return new Promise((c, e) => {
		try {
			// Run the mocha test
			mocha.run((failures) => {
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

