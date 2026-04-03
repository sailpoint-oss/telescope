/**
 * E2E Tests: Rename provider
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	executeRenameWithRetry,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	previewTextEditsOnDocument,
	waitForDiagnostics,
	waitForDocumentAnalyzed,
	waitForPrepareRenameAvailable,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

suite("Rename", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
		await waitForProjectInfo(api, (i) => i.knownOpenAPIFiles > 0, {
			timeoutMs: 60000,
			uri: folder.uri,
		});
		const warmupUri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(warmupUri);
		await waitForDiagnostics(warmupUri, (d) => d.length > 0, {
			timeoutMs: 90000,
		});
	});

	test("Rename tag updates all references", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDocumentAnalyzed(uri, { skipDiagnostics: true });

		const text = doc.getText();
		const tagIdx = text.indexOf("  - name: Users");
		assert.ok(tagIdx !== -1, "Should find tag definition");
		const pos = doc.positionAt(tagIdx + "  - name: Use".length);
		console.log(`[rename-diag] uri=${uri.toString()}`);
		console.log(`[rename-diag] languageId=${doc.languageId}`);
		console.log(`[rename-diag] pos=${pos.line}:${pos.character}`);
		console.log(`[rename-diag] wordAtPos='${doc.getText(doc.getWordRangeAtPosition(pos))}'`);

		// Quick probe: try VS Code's built-in prepareRename command to see if
		// the rename provider is even registered for this language ID.
		try {
			const probeResult = await vscode.commands.executeCommand(
				"vscode.prepareRename",
				uri,
				pos,
			);
			console.log(`[rename-diag] vscode.prepareRename probe=${JSON.stringify(probeResult)}`);
		} catch (e: unknown) {
			console.log(`[rename-diag] vscode.prepareRename probe error: ${e}`);
		}

		await waitForPrepareRenameAvailable(uri, pos, {
			timeoutMs: 90000,
			pollMs: 1000,
		});

		const edit = await executeRenameWithRetry(uri, pos, "People", {
			maxAttempts: 25,
			delayMs: 1000,
		});
		assert.ok(edit, "Expected rename provider to return a workspace edit");

		const entries = edit.entries();
		const docEntry = entries.find(([entryUri]) => entryUri.toString() === uri.toString());
		assert.ok(docEntry, "Expected rename workspace edit to touch rich-api.yaml");
		const docEdits = docEntry?.[1] ?? [];
		assert.ok(
			docEdits.length >= 2,
			`Expected at least definition + usage rename edits, got ${docEdits.length}`,
		);
		assert.ok(
			docEdits.every((textEdit) => textEdit.newText === "People"),
			"All rename edits should use the requested new tag name",
		);
		const preview = previewTextEditsOnDocument(doc, docEdits);
		assert.ok(
			preview.includes("- name: People"),
			"Rename preview should update the root tag definition text",
		);
		assert.ok(
			preview.includes("        - People"),
			"Rename preview should update tag usages in operations",
		);
	});

	test("Rename provider does not crash on non-renameable position", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, () => true, { timeoutMs: 30000 });

		// Position on a non-renameable field (openapi version string)
		const pos = new vscode.Position(0, 10);

		let result: unknown;
		let threw = false;
		try {
			result = await vscode.commands.executeCommand(
				"vscode.executeDocumentRenameProvider",
				uri,
				pos,
				"NewName",
			);
		} catch {
			// Expected — "The element can't be renamed" is fine
			threw = true;
		}

		if (!threw) {
			assert.ok(
				result === undefined || result === null || result instanceof vscode.WorkspaceEdit,
				"Rename command should return null/undefined or a WorkspaceEdit",
			);
		}
	});

});
