/**
 * E2E Tests: Diagnostics and Validation
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Diagnostics", () => {
	let testAPI: ReturnType<typeof getTestApi>;
	let workspaceFolder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		testAPI = getTestApi();
		await testAPI.waitForSessionsRunning(60000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		workspaceFolder = f;
	});

	test("Should produce diagnostics for OpenAPI file with issues", async () => {
		if (isMultiRootWorkspace()) return;

		// Use rich-api.yaml which reliably triggers warnings (server-url-https, etc.)
		const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, "rich-api.yaml");
		await openAndShow(fileUri);

		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) => d.length > 0,
			{ timeoutMs: 60000 },
		);
		assert.ok(
			diagnostics.length > 0,
			`Should have diagnostics. Found: ${diagnostics.length}`,
		);
	});

	test("Should not produce errors for valid OpenAPI file", async () => {
		if (isMultiRootWorkspace()) return;

		const validFile = vscode.Uri.joinPath(workspaceFolder.uri, "valid.yaml");
		await openAndShow(validFile);
		await waitForDiagnostics(validFile, () => true, { timeoutMs: 60000 });

		const diagnostics = vscode.languages.getDiagnostics(validFile);
		const errors = diagnostics.filter(
			(d) => d.severity === vscode.DiagnosticSeverity.Error,
		);
		assert.strictEqual(
			errors.length,
			0,
			`Valid file should have no errors. Found: ${errors.map((e) => e.message).join(", ")}`,
		);
	});
});
