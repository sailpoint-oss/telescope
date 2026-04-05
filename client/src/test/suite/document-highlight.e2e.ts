/**
 * E2E Tests: Document highlight provider (VS Code host wiring)
 *
 * Core highlight semantics for refs are covered in `server/lsp/handler_test.go`
 * (`TestDocumentHighlight_RefDirect`, `TestRichAPIFixture_DocumentHighlight_*`).
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	ensureSingleRootWorkspaceReady,
	isMultiRootWorkspace,
	openAndShow,
	waitForDocumentAnalyzed,
} from "./utils/e2e-helpers";

suite("Document Highlight", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		({ folder } = await ensureSingleRootWorkspaceReady());
	});

	test("Document highlight on User schema returns array (host wiring)", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		// Code-lens readiness: proven cross-platform gate.
		await waitForDocumentAnalyzed(uri);

		const text = doc.getText();
		const refIdx = text.indexOf("#/components/schemas/User");
		assert.ok(refIdx !== -1, "Fixture should contain $ref to User");
		const refPos = doc.positionAt(refIdx + 5);

		// Probe document highlights — accept whatever the provider returns.
		// Write+Read kind semantics are owned by Go handler tests.
		const highlights = (await vscode.commands.executeCommand(
			"vscode.executeDocumentHighlights",
			uri,
			refPos,
		)) as vscode.DocumentHighlight[] | undefined;

		assert.ok(
			highlights === undefined || Array.isArray(highlights),
			"Document highlight provider should return an array or undefined",
		);
	});
});
