/**
 * E2E Tests: Document highlight provider (VS Code host wiring)
 *
 * Core highlight semantics for refs are covered in `server/lsp/handler_test.go`
 * (`TestDocumentHighlight_RefDirect`, `TestRichAPIFixture_DocumentHighlight_*`).
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
	waitForDocumentAnalyzed,
	waitForDocumentHighlights,
	waitForProjectInfo,
	waitForProviders,
} from "./utils/e2e-helpers";

suite("Document Highlight", () => {
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
		await waitForProviders(warmupUri);
	});

	test("Document highlight on User schema includes definition (Write) and usages (Read)", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDocumentAnalyzed(uri);

		const text = doc.getText();
		const userIdx = text.indexOf("    User:");
		assert.ok(userIdx !== -1, "Fixture should contain User schema");
		const pos = doc.positionAt(userIdx + "    Us".length);

		const highlights = await waitForDocumentHighlights(
			uri,
			pos,
			(h) =>
				h.length > 0 &&
				h.some((x) => x.kind === vscode.DocumentHighlightKind.Write) &&
				h.some((x) => x.kind === vscode.DocumentHighlightKind.Read),
			{ timeoutMs: 90000 },
		);

		assert.ok(
			highlights.length >= 2,
			`Expected definition + at least one usage highlight. Got: ${highlights.length}`,
		);
	});
});
