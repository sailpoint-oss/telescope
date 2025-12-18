/**
 * E2E Tests: VS Code provider integration (definition/references/links/format)
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
} from "./utils/e2e-helpers";

suite("Providers", () => {
	let api: ReturnType<typeof getTestApi>;
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		api = getTestApi();
		await api.waitForSessionsRunning(60000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
	});

	test("Definition provider should resolve $ref target", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "ref-root.yaml");
		const doc = await openAndShow(uri);

		const text = doc.getText();
		const idx = text.indexOf("$ref:");
		assert.ok(idx !== -1, "Fixture should contain $ref");

		const pos = doc.positionAt(idx + "$ref: ".length + 2); // put cursor into the quoted value
		const defs = (await vscode.commands.executeCommand(
			"vscode.executeDefinitionProvider",
			uri,
			pos,
		)) as vscode.Location[] | vscode.LocationLink[] | undefined;

		assert.ok(defs && defs.length > 0, "Expected at least one definition location");
		const first = defs[0];
		assert.ok(first, "Expected a first definition result");
		const targetUri =
			"uri" in first
				? (first as vscode.Location).uri
				: (first as vscode.LocationLink).targetUri;
		assert.ok(
			targetUri.fsPath.endsWith("ref-components.yaml"),
			`Expected definition to land in ref-components.yaml, got ${targetUri.fsPath}`,
		);
	});

	test("References provider should find inbound refs for target", async () => {
		if (isMultiRootWorkspace()) return;
		// Query references from the $ref site (stable across implementations)
		const rootUri = vscode.Uri.joinPath(folder.uri, "ref-root.yaml");
		const doc = await openAndShow(rootUri);
		const text = doc.getText();
		const idx = text.indexOf("$ref:");
		assert.ok(idx !== -1, "Fixture should contain $ref");
		const pos = doc.positionAt(idx + "$ref: ".length + 2);
		const refs = (await vscode.commands.executeCommand(
			"vscode.executeReferenceProvider",
			rootUri,
			pos,
		)) as vscode.Location[] | undefined;

		assert.ok(refs && refs.length > 0, "Expected at least one reference");
	});

	test("Document links should include $ref links", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "ref-root.yaml");
		await openAndShow(uri);

		const links = (await vscode.commands.executeCommand(
			"vscode.executeLinkProvider",
			uri,
		)) as Array<{ target?: vscode.Uri }> | undefined;

		assert.ok(links && links.length > 0, "Expected at least one document link");
	});

	test("Format provider should not throw", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");
		const doc = await openAndShow(uri);

		const edits = (await vscode.commands.executeCommand(
			"vscode.executeFormatDocumentProvider",
			uri,
			{ tabSize: 2, insertSpaces: true },
		)) as vscode.TextEdit[] | undefined;

		// It's OK if there are no edits; this is primarily a smoke test.
		assert.ok(Array.isArray(edits), "Expected format provider result to be an array");
		// Ensure the document is still open and accessible
		assert.ok(doc.getText().length > 0);
	});
});


