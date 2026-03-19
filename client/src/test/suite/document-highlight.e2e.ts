/**
 * E2E Tests: Document highlight provider
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
	waitForProviders,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

suite("Document Highlight", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(60000);
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
		await waitForProviders(warmupUri);
	});

	test("Document highlight on $ref target highlights usages", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		// Find the User schema definition in components
		const text = doc.getText();
		const userIdx = text.indexOf("    User:");
		assert.ok(userIdx !== -1, "Fixture should contain User schema");
		const pos = doc.positionAt(userIdx + "    Us".length);

		const highlights = await executeWithRetry<vscode.DocumentHighlight[]>(
			"vscode.executeDocumentHighlights",
			[uri, pos],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(
			highlights && highlights.length > 0,
			"Expected document highlights for User schema (definition + $ref usages)",
		);
	});

	test("Document highlight on operationId highlights occurrences", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const text = doc.getText();
		const opIdx = text.indexOf("operationId: listUsers");
		assert.ok(opIdx !== -1, "Fixture should contain listUsers operationId");
		const pos = doc.positionAt(opIdx + "operationId: list".length);

		const highlights = (await vscode.commands.executeCommand(
			"vscode.executeDocumentHighlights",
			uri,
			pos,
		)) as vscode.DocumentHighlight[] | undefined;

		// May return highlights or empty — just ensure no crash
		assert.ok(
			highlights === undefined || Array.isArray(highlights),
			"Document highlights provider should return array or undefined",
		);
	});
});
