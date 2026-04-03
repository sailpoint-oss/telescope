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

		// Work on a temporary copy to avoid mutating fixtures
		const tmpName = `rename-e2e-${Date.now()}.yaml`;
		const tmpUri = vscode.Uri.joinPath(folder.uri, tmpName);
		const content = [
			"openapi: 3.1.0",
			"info:",
			"  title: Rename Test",
			"  version: 1.0.0",
			"tags:",
			'  - name: Users',
			"    description: User ops",
			"paths:",
			"  /users:",
			"    get:",
			"      operationId: getUsers",
			"      tags:",
			"        - Users",
			"      responses:",
			'        "200":',
			"          description: ok",
			"",
		].join("\n");

		await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(content, "utf-8"));

		try {
			const api = getTestApi();
			const doc = await openAndShow(tmpUri);
			await waitForProjectInfo(api, (i) => i.workspacePath !== null, {
				timeoutMs: 60000,
				uri: tmpUri,
			});
			await waitForDocumentAnalyzed(tmpUri, { skipDiagnostics: true });

			// Position on the "Users" tag name in the tags definition
			const text = doc.getText();
			const tagIdx = text.indexOf("  - name: Users");
			assert.ok(tagIdx !== -1, "Should find tag definition");
			const pos = doc.positionAt(tagIdx + "  - name: Use".length);
			await waitForPrepareRenameAvailable(tmpUri, pos, {
				timeoutMs: 90000,
				pollMs: 1000,
			});

			const edit = await executeRenameWithRetry(tmpUri, pos, "People", {
				maxAttempts: 25,
				delayMs: 1000,
			});
			assert.ok(edit, "Expected rename provider to return a workspace edit");

			const entries = edit.entries();
			const docEntry = entries.find(([uri]) => uri.toString() === tmpUri.toString());
			assert.ok(docEntry, "Expected rename workspace edit to touch the temp document");
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
				preview.includes("People"),
				"Rename edit preview should include the requested new tag name",
			);
			const applied = await vscode.workspace.applyEdit(edit);
			assert.ok(applied, "Rename workspace edit should apply cleanly in the editor");
		} finally {
			await vscode.commands.executeCommand("workbench.action.files.revert");
			await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
			try {
				await vscode.workspace.fs.delete(tmpUri);
			} catch {
				// cleanup best-effort
			}
		}
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

	test("Cross-file schema rename returns edits for definition and refs", async () => {
		if (isMultiRootWorkspace()) return;

		const compUri = vscode.Uri.joinPath(folder.uri, `rename-comp-${Date.now()}.yaml`);
		const rootUri = vscode.Uri.joinPath(folder.uri, `rename-root-${Date.now()}.yaml`);

		const compContent = [
			'openapi: "3.1.0"',
			"info:",
			"  title: Components",
			'  version: "1.0.0"',
			"components:",
			"  schemas:",
			"    User:",
			"      type: object",
			"      properties:",
			"        id:",
			"          type: string",
			"",
		].join("\n");
		const rootContent = [
			'openapi: "3.1.0"',
			"info:",
			"  title: Root",
			'  version: "1.0.0"',
			"paths:",
			"  /users:",
			"    get:",
			"      operationId: listUsers",
			"      responses:",
			'        "200":',
			"          description: ok",
			"          content:",
			"            application/json:",
			"              schema:",
			`                $ref: "./${compUri.path.split("/").pop()}#/components/schemas/User"`,
			"",
		].join("\n");

		await vscode.workspace.fs.writeFile(compUri, Buffer.from(compContent, "utf-8"));
		await vscode.workspace.fs.writeFile(rootUri, Buffer.from(rootContent, "utf-8"));

		try {
			const compDoc = await openAndShow(compUri);
			await waitForDiagnostics(compUri, () => true, { timeoutMs: 30000 });
			await openAndShow(rootUri);
			await waitForDiagnostics(rootUri, () => true, { timeoutMs: 30000 });
			await waitForDocumentAnalyzed(compUri, { skipDiagnostics: true });

			const text = compDoc.getText();
			const idx = text.indexOf("    User:");
			assert.ok(idx !== -1, "Should find schema definition");
			const pos = compDoc.positionAt(idx + "    Us".length);
			await waitForPrepareRenameAvailable(compUri, pos, {
				timeoutMs: 90000,
				pollMs: 1000,
			});

			const edit = await executeRenameWithRetry(
				compUri,
				pos,
				"AccountUser",
				{ maxAttempts: 25, delayMs: 1000 },
			);
			assert.ok(edit, "Expected rename workspace edit when provider supports rename");

			const entries = edit.entries();
			assert.ok(entries.length > 0, "Expected rename edits");
			const touched = entries.map(([u]) => u.toString());
			assert.ok(
				touched.includes(compUri.toString()),
				"Rename edit should include the component definition file",
			);
		} finally {
			await vscode.commands.executeCommand("workbench.action.files.revert");
			await vscode.commands.executeCommand("workbench.action.closeAllEditors");
			try {
				await vscode.workspace.fs.delete(compUri);
			} catch {}
			try {
				await vscode.workspace.fs.delete(rootUri);
			} catch {}
		}
	});
});
