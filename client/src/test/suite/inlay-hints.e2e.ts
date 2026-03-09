/**
 * E2E Tests: Inlay hints provider
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	executeWithRetry,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Inlay Hints", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(60000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
	});

	test("Inlay hints appear for $ref values", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const fullRange = new vscode.Range(
			new vscode.Position(0, 0),
			doc.positionAt(doc.getText().length),
		);

		const hints = await executeWithRetry<vscode.InlayHint[]>(
			"vscode.executeInlayHintProvider",
			[uri, fullRange],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(hints && hints.length > 0, "Expected inlay hints for file with $ref values");
	});

	test("Inlay hints do not crash on file without refs", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, () => true, { timeoutMs: 60000 });

		const fullRange = new vscode.Range(
			new vscode.Position(0, 0),
			doc.positionAt(doc.getText().length),
		);

		const hints = (await vscode.commands.executeCommand(
			"vscode.executeInlayHintProvider",
			uri,
			fullRange,
		)) as vscode.InlayHint[] | undefined;

		// May return empty array or undefined — just ensure no crash
		assert.ok(
			hints === undefined || Array.isArray(hints),
			"Inlay hint provider should return array or undefined",
		);
	});
});
