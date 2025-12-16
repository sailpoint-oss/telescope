/**
 * E2E Tests: Diagnostics and Validation
 */

import * as assert from "assert";
import * as path from "node:path";
import * as vscode from "vscode";

suite("Diagnostics", () => {
	test("Should produce diagnostics for invalid OpenAPI file", async () => {
		const extension = vscode.extensions.getExtension("sailpoint.telescope");
		assert.ok(extension, "Extension should be available");

		if (!extension.isActive) {
			await extension.activate();
		}

		const exports = extension.exports as {
			__telescopeTest?: {
				waitForSessionsRunning: (timeoutMs?: number) => Promise<void>;
			};
		};

		const testAPI = exports.__telescopeTest;
		assert.ok(testAPI, "Test API should be available");

		// Wait for sessions to be ready
		await testAPI.waitForSessionsRunning(60000);

		// Open the invalid file
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(workspaceFolder, "Should have a workspace folder");

		const invalidFile = vscode.Uri.joinPath(
			workspaceFolder.uri,
			"invalid.yaml",
		);

		const document = await vscode.workspace.openTextDocument(invalidFile);
		await vscode.window.showTextDocument(document);

		// Wait a bit for diagnostics to be computed
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Check for diagnostics
		const diagnostics = vscode.languages.getDiagnostics(invalidFile);
		assert.ok(
			diagnostics.length > 0,
			`Should have diagnostics. Found: ${diagnostics.length}`,
		);

		// Verify at least one diagnostic mentions operationId (since we're missing it)
		const hasOperationIdError = diagnostics.some((d) =>
			d.message.toLowerCase().includes("operationid"),
		);
		assert.ok(
			hasOperationIdError,
			`Should have an operationId-related diagnostic. Messages: ${diagnostics.map((d) => d.message).join(", ")}`,
		);
	});

	test("Should not produce errors for valid OpenAPI file", async () => {
		const extension = vscode.extensions.getExtension("sailpoint.telescope");
		assert.ok(extension, "Extension should be available");

		if (!extension.isActive) {
			await extension.activate();
		}

		const exports = extension.exports as {
			__telescopeTest?: {
				waitForSessionsRunning: (timeoutMs?: number) => Promise<void>;
			};
		};

		const testAPI = exports.__telescopeTest;
		assert.ok(testAPI, "Test API should be available");

		// Wait for sessions to be ready
		await testAPI.waitForSessionsRunning(60000);

		// Open the valid file
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(workspaceFolder, "Should have a workspace folder");

		const validFile = vscode.Uri.joinPath(workspaceFolder.uri, "valid.yaml");

		const document = await vscode.workspace.openTextDocument(validFile);
		await vscode.window.showTextDocument(document);

		// Wait a bit for diagnostics to be computed
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Check diagnostics - valid files may have warnings but should have no errors
		const diagnostics = vscode.languages.getDiagnostics(validFile);
		const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
		assert.strictEqual(
			errors.length,
			0,
			`Valid file should have no errors. Found: ${errors.map((e) => e.message).join(", ")}`,
		);
	});
});

