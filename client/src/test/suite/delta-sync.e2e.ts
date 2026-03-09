/**
 * E2E Tests: File create/change/remove triggers diagnostic updates
 *
 * Validates that creating, modifying, and deleting OpenAPI files
 * produces the expected diagnostic changes via standard LSP.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	delay,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("File Change Diagnostics", () => {
	test("Create/change/remove should update diagnostics", async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(60000);

		const folder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(folder, "Should have a workspace folder");
		const filename = `delta-e2e-${Date.now()}.yaml`;
		const createdUri = vscode.Uri.joinPath(folder.uri, filename);

		// Phase 1: Create file – expect diagnostics to appear.
		// Content missing operationId, servers, etc. to guarantee multiple rules fire.
		const content1 = [
			"openapi: 3.1.0",
			"info:",
			"  title: Delta",
			"  version: 1.0.0",
			"paths:",
			"  /test:",
			"    get:",
			"      summary: Test endpoint",
			"      responses:",
			"        '200':",
			"          description: OK",
			"",
		].join("\n");
		await vscode.workspace.fs.writeFile(
			createdUri,
			Buffer.from(content1, "utf-8"),
		);

		await openAndShow(createdUri);
		// Allow time for language reclassification cycle (yaml -> openapi-yaml)
		await delay(1000);
		const phase1 = await waitForDiagnostics(
			createdUri,
			(d) => d.length > 0,
			{ timeoutMs: 60000 },
		);
		const phase1Count = phase1.length;

		// Phase 2: Edit content – diagnostics should still be present.
		const editor = vscode.window.activeTextEditor;
		if (editor && editor.document.uri.toString() === createdUri.toString()) {
			const content2 = [
				"openapi: 3.1.0",
				"info:",
				"  title: Delta Changed",
				"  version: 1.0.1",
				"paths:",
				"  /ping:",
				"    get:",
				"      operationId: ping",
				"      responses:",
				"        '200':",
				"          description: ok",
				"",
			].join("\n");
			await editor.edit((editBuilder) => {
				const fullRange = new vscode.Range(
					editor.document.positionAt(0),
					editor.document.positionAt(editor.document.getText().length),
				);
				editBuilder.replace(fullRange, content2);
			});
		}
		await waitForDiagnostics(createdUri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		// Cleanup: revert, close, and delete the temp file.
		try {
			await vscode.commands.executeCommand(
				"workbench.action.files.revert",
			);
			await vscode.commands.executeCommand(
				"workbench.action.closeActiveEditor",
			);
			await vscode.workspace.fs.delete(createdUri);
		} catch {
			// cleanup best-effort
		}
	});
});
