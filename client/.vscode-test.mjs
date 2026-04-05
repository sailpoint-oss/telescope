import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "@vscode/test-cli";

const extensionDevelopmentPath = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(extensionDevelopmentPath, "e2e-suites.json");
const suiteManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const vscodeVersion = process.env.VSCODE_TEST_VERSION?.trim() || "1.105.0";
const baseEnv = {
	TELESCOPE_SERVER_PATH: process.env.TELESCOPE_SERVER_PATH,
	VSCODE_TEST_VERSION: vscodeVersion,
};

function scanSourceTestBasenames(dir, fileList = []) {
	const files = fs.readdirSync(dir);
	for (const file of files) {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);
		if (stat.isDirectory()) {
			scanSourceTestBasenames(filePath, fileList);
		} else if (file.endsWith(".e2e.ts")) {
			fileList.push(file.replace(/\.ts$/, ".js"));
		}
	}
	return fileList;
}

function compiledPathForBasename(basename) {
	return path.posix.join("out", "test", "suite", basename);
}

function selectFilesForMode(mode, smoke) {
	const sourceTestRoot = path.join(extensionDevelopmentPath, "src", "test", "suite");
	const allBasenames = scanSourceTestBasenames(sourceTestRoot);
	const config = suiteManifest.modes[mode];

	if (mode === "single") {
		let basenames = allBasenames.filter(
			(basename) =>
				!(config.excludeBasenames ?? []).includes(basename) &&
				!(config.excludePrefixes ?? []).some((prefix) => basename.startsWith(prefix)),
		);
		if (smoke) {
			const smokeSet = new Set(config.smokeBasenames ?? []);
			basenames = basenames.filter((basename) => smokeSet.has(basename));
		}
		return basenames.map(compiledPathForBasename);
	}

	if (mode === "multi") {
		const fullSet = new Set(config.fullBasenames ?? []);
		return allBasenames
			.filter((basename) => fullSet.has(basename))
			.map(compiledPathForBasename);
	}

	if (mode === "sidecar") {
		let basenames = allBasenames.filter(
			(basename) =>
				(config.fullBasenames ?? []).includes(basename) ||
				(config.fullPrefixes ?? []).some((prefix) => basename.startsWith(prefix)),
		);
		if (smoke) {
			const smokeSet = new Set(config.smokeBasenames ?? []);
			basenames = basenames.filter((basename) => smokeSet.has(basename));
		}
		return basenames.map(compiledPathForBasename);
	}

	return allBasenames.map(compiledPathForBasename);
}

function desktopConfig({
	label,
	mode,
	workspaceFolder,
	smoke,
	timeoutMs,
}) {
	return {
		label,
		files: selectFilesForMode(mode, Boolean(smoke)),
		version: vscodeVersion,
		extensionDevelopmentPath,
		workspaceFolder,
		launchArgs: [
			"--disable-extensions",
			"--disable-workspace-trust",
			"--disable-gpu",
		],
		mocha: {
			ui: "tdd",
			timeout: Number(timeoutMs),
		},
		env: {
			...baseEnv,
			TELESCOPE_E2E_MODE: mode,
			TELESCOPE_E2E_TIMEOUT_MS: String(timeoutMs),
			...(smoke ? { TELESCOPE_E2E_SMOKE: "1" } : {}),
		},
	};
}

export default defineConfig([
	desktopConfig({
		label: "single-smoke",
		workspaceFolder: suiteManifest.modes.single.workspaceFolder,
		mode: "single",
		timeoutMs: suiteManifest.modes.single.timeoutMs,
		smoke: true,
	}),
	desktopConfig({
		label: "single-full",
		workspaceFolder: suiteManifest.modes.single.workspaceFolder,
		mode: "single",
		timeoutMs: suiteManifest.modes.single.timeoutMs,
	}),
	desktopConfig({
		label: "multi-full",
		workspaceFolder: suiteManifest.modes.multi.workspaceFolder,
		mode: "multi",
		timeoutMs: suiteManifest.modes.multi.timeoutMs,
	}),
	desktopConfig({
		label: "sidecar-smoke",
		workspaceFolder: suiteManifest.modes.sidecar.workspaceFolder,
		mode: "sidecar",
		timeoutMs: suiteManifest.modes.sidecar.timeoutMs,
		smoke: true,
	}),
	desktopConfig({
		label: "sidecar-full",
		workspaceFolder: suiteManifest.modes.sidecar.workspaceFolder,
		mode: "sidecar",
		timeoutMs: suiteManifest.modes.sidecar.timeoutMs,
	}),
]);
