/**
 * E2E Tests: Custom OpenAPI rules via Bun sidecar
 *
 * Validates that custom TypeScript rules registered in .telescope/config.yaml
 * produce diagnostics through the Bun sidecar pipeline.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	delay,
	diagCode,
	getTestApi,
	isSidecarWorkspace,
	openAndShow,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Sidecar: Custom OpenAPI Rules", () => {
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

	test("Invalid file triggers custom-operation-summary diagnostic", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/custom-openapi-invalid.yaml",
		);
		await openAndShow(fileUri);

		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) => d.some((diag) => diagCode(diag) === "custom-operation-summary"),
			{ timeoutMs: 120000 },
		);

		const customDiags = diagnostics.filter(
			(d) => diagCode(d) === "custom-operation-summary",
		);
		assert.ok(
			customDiags.length > 0,
			`Should have custom-operation-summary diagnostics. Got codes: ${diagnostics.map((d) => diagCode(d)).join(", ")}`,
		);
		assert.ok(
			customDiags.some((d) => d.message.includes("summary")),
			"Diagnostic message should mention 'summary'",
		);
	});

	test("Valid file has no custom-operation-summary diagnostics", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/custom-openapi-valid.yaml",
		);
		await openAndShow(fileUri);

		await waitForDiagnostics(fileUri, () => true, { timeoutMs: 60000 });
		await delay(3000);

		const diagnostics = vscode.languages.getDiagnostics(fileUri);
		const customDiags = diagnostics.filter(
			(d) => diagCode(d) === "custom-operation-summary",
		);
		assert.strictEqual(
			customDiags.length,
			0,
			`Valid file should have no custom-operation-summary diagnostics. Found: ${customDiags.map((d) => d.message).join(", ")}`,
		);
	});
});
