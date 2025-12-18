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
		// Single-root fixture only
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		testAPI = getTestApi();
		await testAPI.waitForSessionsRunning(60000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		workspaceFolder = f;
	});

	test("Should produce diagnostics for invalid OpenAPI file", async () => {
		// Single-root fixture only
		if (isMultiRootWorkspace()) return;

		// Open the invalid file
		const invalidFile = vscode.Uri.joinPath(workspaceFolder.uri, "invalid.yaml");

		await openAndShow(invalidFile);

		const diagnostics = await waitForDiagnostics(
			invalidFile,
			(d) => d.length > 0,
			{ timeoutMs: 60000 },
		);
		assert.ok(
			diagnostics.length > 0,
			`Should have diagnostics. Found: ${diagnostics.length}`,
		);

		// Assert we got a meaningful OpenAPI-related diagnostic (rule set may vary).
		const messages = diagnostics.map((d) => d.message.toLowerCase());
		const hasExpected = messages.some(
			(m) => m.includes("operationid") || m.includes("server") || m.includes("security"),
		);
		assert.ok(hasExpected, `Unexpected diagnostics: ${messages.join(" | ")}`);
	});

	test("Should not produce errors for valid OpenAPI file", async () => {
		// Single-root fixture only
		if (isMultiRootWorkspace()) return;

		// Open the valid file
		const validFile = vscode.Uri.joinPath(workspaceFolder.uri, "valid.yaml");

		await openAndShow(validFile);
		await waitForDiagnostics(validFile, () => true, { timeoutMs: 60000 });

		// Check diagnostics - valid files may have warnings but should have no errors
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


