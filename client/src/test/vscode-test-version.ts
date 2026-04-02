/**
 * VS Code build used by @vscode/test-electron in CI and locally.
 * Keep aligned with `engines.vscode` in `client/package.json`.
 * Override with env `VSCODE_TEST_VERSION` when debugging a specific release.
 */
export const VSCODE_TEST_VERSION =
	process.env.VSCODE_TEST_VERSION?.trim() || "1.105.0";
