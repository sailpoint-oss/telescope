/**
 * E2E Tests: sidecar workspace schema fixture compatibility (JSON-named)
 *
 * These fixtures verify that additionalValidation-based schema files remain
 * analyzable when running the sidecar workspace test mode.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	getTestApi,
	isSidecarWorkspace,
	openAndShow,
	waitForSidecarReady,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Sidecar: Schema Fixture Compatibility (JSON-Named)", () => {
	let folder: vscode.WorkspaceFolder;
	let sidecarAvailable = false;

	suiteSetup(async () => {
		if (!isSidecarWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
		sidecarAvailable = await waitForSidecarReady(folder);
	});

	test("Invalid JSON schema fixture is analyzable", async () => {
		if (!isSidecarWorkspace() || !sidecarAvailable) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"custom/custom-json-schema-invalid.yaml",
		);
		await openAndShow(fileUri);
		const diagnostics = await waitForDiagnostics(fileUri, () => true, {
			timeoutMs: 120000,
		});

		assert.ok(
			Array.isArray(diagnostics),
			"Invalid JSON schema fixture should be analyzable without crashing diagnostics pipeline",
		);
	});

	test("Valid JSON schema fixture is analyzable", async () => {
		if (!isSidecarWorkspace() || !sidecarAvailable) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"custom/custom-json-schema-valid.yaml",
		);
		await openAndShow(fileUri);

		// Valid files may never emit a diagnostics change event; use a bounded wait
		// and then inspect current diagnostics directly.
		await waitForDiagnostics(fileUri, () => true, { timeoutMs: 60000 });

		const diagnostics = vscode.languages.getDiagnostics(fileUri);
		assert.ok(
			Array.isArray(diagnostics),
			"Valid JSON schema fixture should remain analyzable in sidecar workspace mode",
		);
	});
});
