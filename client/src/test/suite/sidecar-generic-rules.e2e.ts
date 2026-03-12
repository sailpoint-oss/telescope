/**
 * E2E Tests: Generic (non-OpenAPI) rules via Bun sidecar
 *
 * Validates that generic TypeScript rules registered in additionalValidation
 * produce diagnostics for matched YAML files through the Bun sidecar.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	diagCode,
	getTestApi,
	isSidecarWorkspace,
	openAndShow,
	waitForSidecarReady,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Sidecar: Generic Rules", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (!isSidecarWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
		await waitForSidecarReady(folder);
	});

	test("Invalid generic file triggers custom-version-required diagnostic", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"custom/custom-generic-invalid.yaml",
		);
		await openAndShow(fileUri);
		await waitForDiagnostics(fileUri, (d) => d.length > 0, { timeoutMs: 120000 });

		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) => d.some((diag) => diagCode(diag) === "custom-version-required"),
			{ timeoutMs: 180000 },
		);

		const customDiags = diagnostics.filter(
			(d) => diagCode(d) === "custom-version-required",
		);
		assert.ok(
			customDiags.length > 0,
			`Should have custom-version-required diagnostics. Got codes: ${diagnostics.map((d) => diagCode(d)).join(", ")}`,
		);
		assert.ok(
			customDiags.some((d) => d.message.includes("version")),
			"Diagnostic message should mention 'version'",
		);
	});

	test("Valid generic file has no custom-version-required diagnostics", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"custom/custom-generic-valid.yaml",
		);
		await openAndShow(fileUri);
		await waitForDiagnostics(fileUri, () => true, { timeoutMs: 60000 });

		const diagnostics = vscode.languages.getDiagnostics(fileUri);
		const customDiags = diagnostics.filter(
			(d) => diagCode(d) === "custom-version-required",
		);
		assert.strictEqual(
			customDiags.length,
			0,
			`Valid file should have no custom-version-required diagnostics. Found: ${customDiags.map((d) => d.message).join(", ")}`,
		);
	});
});
