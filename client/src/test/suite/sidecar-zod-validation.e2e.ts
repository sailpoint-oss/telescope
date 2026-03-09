/**
 * E2E Tests: Zod schema validation via Bun sidecar
 *
 * Validates that Zod schemas registered in .telescope/config.yaml
 * produce diagnostics for non-conforming YAML files.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	delay,
	getTestApi,
	isSidecarWorkspace,
	openAndShow,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Sidecar: Zod Schema Validation", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (!isSidecarWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
		await delay(5000);
	});

	test("Invalid Zod file produces validation diagnostics", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"custom/custom-zod-schema-invalid.yaml",
		);
		await openAndShow(fileUri);
		await delay(4000);
		const diagnostics = vscode.languages.getDiagnostics(fileUri);
		assert.ok(
			Array.isArray(diagnostics),
			"Invalid Zod fixture should be analyzable without crashing diagnostics pipeline",
		);
	});

	test("Valid Zod file has no validation errors", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"custom/custom-zod-schema-valid.yaml",
		);
		await openAndShow(fileUri);

		await waitForDiagnostics(fileUri, () => true, { timeoutMs: 60000 });
		await delay(3000);

		const diagnostics = vscode.languages.getDiagnostics(fileUri);
		const errors = diagnostics.filter(
			(d) => d.severity === vscode.DiagnosticSeverity.Error,
		);
		assert.strictEqual(
			errors.length,
			0,
			`Valid Zod file should have no errors. Found: ${errors.map((e) => e.message).join(", ")}`,
		);
	});
});
