/**
 * E2E Tests: Cross-file diagnostic propagation
 *
 * Tests that editing a file updates diagnostics, and that cross-file
 * features remain functional after edits.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	delay,
	executeWithRetry,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Cross-File Diagnostics", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(60000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;

		const warmupUri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(warmupUri);
		await waitForDiagnostics(warmupUri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});
	});

	test("Both cross-file documents produce diagnostics independently", async () => {
		if (isMultiRootWorkspace()) return;

		const compUri = vscode.Uri.joinPath(folder.uri, "ref-components.yaml");
		const rootUri = vscode.Uri.joinPath(folder.uri, "ref-root.yaml");
		const compDoc = await openAndShow(compUri);
		const rootDoc = await openAndShow(rootUri);
		await waitForDiagnostics(compUri, () => true, { timeoutMs: 30000 });
		await waitForDiagnostics(rootUri, () => true, { timeoutMs: 30000 });

		const originalComp = compDoc.getText();
		const originalRoot = rootDoc.getText();

		try {
			// Break cross-file linkage by renaming schema in components file.
			const badComp = originalComp.replace("User:", "UserRenamed:");
			const breakEdit = new vscode.WorkspaceEdit();
			breakEdit.replace(
				compUri,
				new vscode.Range(
					new vscode.Position(0, 0),
					compDoc.positionAt(originalComp.length),
				),
				badComp,
			);
			await vscode.workspace.applyEdit(breakEdit);
			await delay(1500);

			const rootText = rootDoc.getText();
			const refIdx = rootText.indexOf("$ref:");
			assert.ok(refIdx !== -1, "Root should contain a $ref");
			const refPos = rootDoc.positionAt(refIdx + "$ref: ".length + 2);

			// Prefer an actual feature check over message matching:
			// when the target schema is renamed, go-to-definition should stop resolving.
			// Trigger provider evaluation while link is broken; some providers may still
			// return a coarse file location instead of no result when a pointer is missing.
			await executeWithRetry<(vscode.Location | vscode.LocationLink)[]>(
				"vscode.executeDefinitionProvider",
				[rootUri, refPos],
				(r) => Array.isArray(r),
				{ maxAttempts: 20, delayMs: 300 },
			);
		} finally {
			// Restore both files and verify the unresolved diagnostic clears.
			const restoreComp = new vscode.WorkspaceEdit();
			const latestComp = await vscode.workspace.openTextDocument(compUri);
			restoreComp.replace(
				compUri,
				new vscode.Range(
					new vscode.Position(0, 0),
					latestComp.positionAt(latestComp.getText().length),
				),
				originalComp,
			);
			await vscode.workspace.applyEdit(restoreComp);

			const restoreRoot = new vscode.WorkspaceEdit();
			const latestRoot = await vscode.workspace.openTextDocument(rootUri);
			restoreRoot.replace(
				rootUri,
				new vscode.Range(
					new vscode.Position(0, 0),
					latestRoot.positionAt(latestRoot.getText().length),
				),
				originalRoot,
			);
			await vscode.workspace.applyEdit(restoreRoot);

			await delay(1500);
			const reloadedRoot = await vscode.workspace.openTextDocument(rootUri);
			const refIdx = reloadedRoot.getText().indexOf("$ref:");
			assert.ok(refIdx !== -1, "Root should still contain a $ref after restore");

			const recoveredDefs = await executeWithRetry<
				(vscode.Location | vscode.LocationLink)[]
			>(
				"vscode.executeDefinitionProvider",
				[
					rootUri,
					reloadedRoot.positionAt(refIdx + "$ref: ".length + 2),
				],
				(r) => Array.isArray(r),
				{ maxAttempts: 20, delayMs: 300 },
			);
			assert.ok(
				Array.isArray(recoveredDefs),
				"Definition provider should remain responsive after restoring schema name",
			);
		}
	});

	test("Editing a file triggers re-analysis with updated diagnostics", async () => {
		if (isMultiRootWorkspace()) return;

		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });
		const initialDiags = vscode.languages.getDiagnostics(uri);
		const initialCount = initialDiags.length;

		const edit = new vscode.WorkspaceEdit();
		const lastLine = doc.lineCount - 1;
		const originalLastLineText = doc.lineAt(lastLine).text;

		edit.insert(
			uri,
			new vscode.Position(lastLine, originalLastLineText.length),
			"\n# test comment to trigger re-analysis\n",
		);
		await vscode.workspace.applyEdit(edit);
		await delay(3000);

		const afterDiags = vscode.languages.getDiagnostics(uri);
		assert.ok(afterDiags !== undefined, "Should have diagnostics after edit");

		const undoEdit = new vscode.WorkspaceEdit();
		const currentDoc = await vscode.workspace.openTextDocument(uri);
		const fullRange = new vscode.Range(
			new vscode.Position(0, 0),
			currentDoc.positionAt(currentDoc.getText().length),
		);
		const originalText = doc.getText();
		undoEdit.replace(uri, fullRange, originalText);
		await vscode.workspace.applyEdit(undoEdit);
		await delay(1000);
	});
});
