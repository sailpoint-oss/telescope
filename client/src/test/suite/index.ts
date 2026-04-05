/**
 * VS Code Extension Test Suite Bootstrap
 *
 * This file runs inside the VS Code extension host and sets up Mocha
 * to run all test files in this directory.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import Mocha from "mocha";

type SuiteMode = "single" | "multi" | "sidecar";

interface ModeConfig {
	workspaceFolder?: string;
	timeoutMs: number;
	smokeBasenames?: string[];
	fullBasenames?: string[];
	fullPrefixes?: string[];
	excludeBasenames?: string[];
	excludePrefixes?: string[];
}

interface SuiteManifest {
	modes: Record<SuiteMode, ModeConfig>;
}

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

function loadSuiteManifest(): SuiteManifest {
	const manifestPath = path.resolve(__dirname, "../../../e2e-suites.json");
	return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SuiteManifest;
}

function selectTestFiles(
	allTestFiles: string[],
	mode: string | undefined,
	smoke: boolean,
	manifest: SuiteManifest,
): string[] {
	const base = (filePath: string) => path.basename(filePath);

	if (mode === "single") {
		const config = manifest.modes.single;
		let selected = allTestFiles.filter((filePath) => {
			const basename = base(filePath);
			return (
				!(config.excludeBasenames ?? []).includes(basename) &&
				!(config.excludePrefixes ?? []).some((prefix) =>
					basename.startsWith(prefix),
				)
			);
		});
		if (smoke) {
			const smokeSet = new Set(config.smokeBasenames ?? []);
			selected = selected.filter((filePath) => smokeSet.has(base(filePath)));
		}
		return selected;
	}

	if (mode === "multi") {
		const fullSet = new Set(manifest.modes.multi.fullBasenames ?? []);
		return allTestFiles.filter((filePath) => fullSet.has(base(filePath)));
	}

	if (mode === "sidecar") {
		const config = manifest.modes.sidecar;
		let selected = allTestFiles.filter((filePath) => {
			const basename = base(filePath);
			return (
				(config.fullBasenames ?? []).includes(basename) ||
				(config.fullPrefixes ?? []).some((prefix) => basename.startsWith(prefix))
			);
		});
		if (smoke) {
			const smokeSet = new Set(config.smokeBasenames ?? []);
			selected = selected.filter((filePath) => smokeSet.has(base(filePath)));
		}
		return selected;
	}

	return allTestFiles;
}

export function run(): Promise<void> {
	// Create the mocha test
	const timeoutMs = Number(process.env.TELESCOPE_E2E_TIMEOUT_MS ?? "300000");
	const retries = Number(process.env.TELESCOPE_E2E_RETRIES ?? "0");
	const mocha = new Mocha({
		ui: "tdd",
		color: true,
		timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120000,
		retries: Number.isFinite(retries) && retries > 0 ? retries : 0,
	});

	const testsRoot = path.resolve(__dirname, "..");
	const allTestFiles = findTestFiles(testsRoot);
	const manifest = loadSuiteManifest();

	const mode = process.env.TELESCOPE_E2E_MODE;
	const smoke =
		process.env.TELESCOPE_E2E_SMOKE === "1" ||
		process.env.TELESCOPE_E2E_SMOKE === "true";
	const testFiles = selectTestFiles(allTestFiles, mode, smoke, manifest);

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

