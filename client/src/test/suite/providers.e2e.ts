/**
 * E2E Tests: VS Code provider integration (definition/references/links/format)
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
	waitForProviders,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

function extractTargetUri(
	def: vscode.Location | vscode.LocationLink,
): vscode.Uri {
	return "uri" in def
		? (def as vscode.Location).uri
		: (def as vscode.LocationLink).targetUri;
}

function extractTargetRange(
	def: vscode.Location | vscode.LocationLink,
): vscode.Range {
	return "uri" in def
		? (def as vscode.Location).range
		: (def as vscode.LocationLink).targetRange;
}

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

	test("Definition on local $ref resolves to component", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const refStr = '#/components/schemas/User"';
		const refIdx = text.indexOf(refStr);
		assert.ok(refIdx !== -1, "Fixture should contain $ref to User");
		const pos = doc.positionAt(refIdx + 2);

		const defs = await executeWithRetry<
			(vscode.Location | vscode.LocationLink)[]
		>(
			"vscode.executeDefinitionProvider",
			[uri, pos],
			(r) => r.length > 0,
			{ maxAttempts: 15 },
		);

		assert.ok(defs && defs.length > 0, "Expected definition for local $ref");
		const targetUri = extractTargetUri(defs[0]!);
		assert.strictEqual(
			targetUri.fsPath,
			uri.fsPath,
			"Local $ref should resolve within the same file",
		);

		const range = extractTargetRange(defs[0]!);
		assert.ok(
			range.start.line > 0,
			`Definition should land at User schema, not file start (got line ${range.start.line})`,
		);
	});

	test("Cross-file definition resolves to correct file", async function () {
		if (isMultiRootWorkspace()) return;

		const compUri = vscode.Uri.joinPath(folder.uri, "ref-components.yaml");
		await openAndShow(compUri);
		await delay(2000);

		const rootUri = vscode.Uri.joinPath(folder.uri, "ref-root.yaml");
		const doc = await openAndShow(rootUri);
		await delay(3000);

		const text = doc.getText();
		const idx = text.indexOf("$ref:");
		assert.ok(idx !== -1, "Fixture should contain a $ref in ref-root.yaml");
		const pos = doc.positionAt(idx + "$ref: ".length + 2);

		const defs = await executeWithRetry<
			(vscode.Location | vscode.LocationLink)[]
		>(
			"vscode.executeDefinitionProvider",
			[rootUri, pos],
			(r) => r.length > 0,
			{ maxAttempts: 25 },
		);

		assert.ok(defs && defs.length > 0, "Expected cross-file definition result");

		const targetUri = extractTargetUri(defs[0]!);
		assert.ok(
			targetUri.scheme === "file",
			`Target should be file:// scheme, got ${targetUri.scheme}`,
		);
		assert.ok(
			targetUri.fsPath.endsWith("ref-components.yaml"),
			`Expected target in ref-components.yaml, got ${targetUri.fsPath}`,
		);
	});

	test("References provider finds inbound refs", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const refStr = '#/components/schemas/User"';
		const refIdx = text.indexOf(refStr);
		assert.ok(refIdx !== -1, "Fixture should contain User schema ref");
		const pos = doc.positionAt(refIdx + 2);

		const refs = await executeWithRetry<vscode.Location[]>(
			"vscode.executeReferenceProvider",
			[uri, pos],
			(r) => r.length > 0,
			{ maxAttempts: 15 },
		);

		assert.ok(refs && refs.length > 0, "Expected at least one reference");
	});

	test("Document links include $ref links", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const links = await executeWithRetry<vscode.DocumentLink[]>(
			"vscode.executeLinkProvider",
			[uri],
			(r) => r.length > 0,
			{ maxAttempts: 15 },
		);

		assert.ok(links && links.length > 0, "Expected at least one document link");
	});

	test("Format provider returns valid edits", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, () => true, { timeoutMs: 60000 });

		const edits = await executeWithRetry<vscode.TextEdit[] | undefined>(
			"vscode.executeFormatDocumentProvider",
			[uri, { tabSize: 2, insertSpaces: true }],
			(result) => Array.isArray(result),
			{ maxAttempts: 40 },
		);

		assert.ok(Array.isArray(edits), "Format should return an array");
		assert.ok(doc.getText().length > 0);
	});
});
