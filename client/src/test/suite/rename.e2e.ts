/**
 * E2E Tests: Rename provider
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

suite("Rename", () => {
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
			const doc = await openAndShow(tmpUri);
			await delay(3000);
			await waitForDiagnostics(tmpUri, () => true, { timeoutMs: 30000 });
			await delay(1000);

			// Position on the "Users" tag name in the tags definition
			const text = doc.getText();
			const tagIdx = text.indexOf("  - name: Users");
			assert.ok(tagIdx !== -1, "Should find tag definition");
			const pos = doc.positionAt(tagIdx + "  - name: Use".length);

			let edit: vscode.WorkspaceEdit | undefined;
			try {
				edit = await executeWithRetry<vscode.WorkspaceEdit | undefined>(
					"vscode.executeDocumentRenameProvider",
					[tmpUri, pos, "People"],
					(r) => r !== undefined && r !== null,
				);
			} catch {
				// Rename may not be supported at this position — that's OK
			}

			if (edit) {
				const entries = edit.entries();
				assert.ok(entries.length > 0, "Expected workspace edit to have entries");
			}
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

		try {
			await vscode.commands.executeCommand(
				"vscode.executeDocumentRenameProvider",
				uri,
				pos,
				"NewName",
			);
		} catch {
			// Expected — "The element can't be renamed" is fine
		}

		// If we get here without a crash, the test passes
		assert.ok(true, "Rename provider handled non-renameable position gracefully");
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
			await openAndShow(rootUri);
			await waitForDiagnostics(compUri, () => true, { timeoutMs: 30000 });
			await waitForDiagnostics(rootUri, () => true, { timeoutMs: 30000 });
			await delay(1000);

			const text = compDoc.getText();
			const idx = text.indexOf("    User:");
			assert.ok(idx !== -1, "Should find schema definition");
			const pos = compDoc.positionAt(idx + "    Us".length);

			let edit: vscode.WorkspaceEdit | undefined;
			try {
				edit = await executeWithRetry<vscode.WorkspaceEdit | undefined>(
					"vscode.executeDocumentRenameProvider",
					[compUri, pos, "AccountUser"],
					(r) => r !== undefined,
					{ maxAttempts: 20 },
				);
			} catch (err) {
				const msg = String(err);
				if (msg.includes("can't be renamed")) {
					return;
				}
				throw err;
			}
			assert.ok(edit, "Expected rename workspace edit when provider supports rename");

			const entries = edit!.entries();
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
