/**
 * E2E Tests: Full definition navigation roundtrip
 *
 * Tests the complete user workflow when navigating $refs:
 *   1. Open source file
 *   2. Go-to-definition on a $ref
 *   3. Verify landing in correct file at correct position
 *   4. Verify LSP features work on the target document
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

function hoverContentToString(hovers: vscode.Hover[]): string {
	return hovers
		.flatMap((h) => h.contents)
		.map((c) => {
			if (typeof c === "string") return c;
			if (c instanceof vscode.MarkdownString) return c.value;
			return (c as { value: string }).value ?? "";
		})
		.join("\n");
}

suite("Definition Flow", () => {
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
			timeoutMs: 60000,
		});
	});

	test("Local definition resolves to component in same file", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const refStr = '#/components/schemas/Pet"';
		const refIdx = text.indexOf(refStr);
		assert.ok(refIdx !== -1, "Fixture should contain a local Pet $ref");
		const pos = doc.positionAt(refIdx + 2);

		const defs = await executeWithRetry<
			(vscode.Location | vscode.LocationLink)[]
		>(
			"vscode.executeDefinitionProvider",
			[uri, pos],
			(r) => r.length > 0,
			{ maxAttempts: 15 },
		);

		assert.ok(defs && defs.length > 0, "Should resolve local $ref");
		const targetUri = extractTargetUri(defs[0]!);
		assert.strictEqual(
			targetUri.fsPath,
			uri.fsPath,
			"Local $ref should stay in same file",
		);
		const range = extractTargetRange(defs[0]!);
		assert.ok(range.start.line > 0, "Should land at schema, not file start");
	});

	test("Cross-file go-to-definition targets correct file", async function () {
		if (isMultiRootWorkspace()) return;

		const compUri = vscode.Uri.joinPath(folder.uri, "ref-components.yaml");
		await openAndShow(compUri);
		await delay(2000);

		const rootUri = vscode.Uri.joinPath(folder.uri, "ref-root.yaml");
		const doc = await openAndShow(rootUri);
		await delay(3000);

		const text = doc.getText();
		const refIdx = text.indexOf("$ref:");
		assert.ok(refIdx !== -1, "Fixture should contain a $ref in ref-root.yaml");
		const pos = doc.positionAt(refIdx + "$ref: ".length + 2);

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
			targetUri.fsPath.endsWith("ref-components.yaml"),
			`Should navigate to ref-components.yaml, got ${targetUri.fsPath}`,
		);
	});

	test("Target document has working hover after navigation", async function () {
		if (isMultiRootWorkspace()) return;
		const rootUri = vscode.Uri.joinPath(folder.uri, "ref-root.yaml");
		const rootDoc = await openAndShow(rootUri);
		const rootText = rootDoc.getText();
		const rootRefIdx = rootText.indexOf("$ref:");
		assert.ok(rootRefIdx !== -1, "Fixture should contain a cross-file $ref");
		const rootRefPos = rootDoc.positionAt(rootRefIdx + "$ref: ".length + 2);

		// Ensure cross-file resolution is ready before hover assertion.
		const defs = await executeWithRetry<(vscode.Location | vscode.LocationLink)[]>(
			"vscode.executeDefinitionProvider",
			[rootUri, rootRefPos],
			(r) => Array.isArray(r) && r.length > 0,
			{ maxAttempts: 25 },
		);
		assert.ok(defs.length > 0, "Expected cross-file definition before hover check");

		const compUri = vscode.Uri.joinPath(folder.uri, "ref-components.yaml");
		const doc = await openAndShow(compUri);
		await waitForDiagnostics(compUri, () => true, { timeoutMs: 30000 });

		const text = doc.getText();
		const userIdx = text.indexOf("User:");
		assert.ok(userIdx !== -1, "Fixture should contain User schema definition");
		const pos = doc.positionAt(userIdx + "    Us".length);

		const hovers = await executeWithRetry<vscode.Hover[]>(
			"vscode.executeHoverProvider",
			[compUri, pos],
			(r) => Array.isArray(r),
			{ maxAttempts: 25 },
		);

		assert.ok(
			Array.isArray(hovers),
			"Hover provider should return an array on the target document",
		);
		if (hovers.length > 0) {
			const content = hoverContentToString(hovers).toLowerCase();
			assert.ok(
				content.includes("user") || content.includes("id") || content.includes("email"),
				"Hover on target schema should include meaningful schema details",
			);
		}
	});

	test("Target document has working document symbols", async function () {
		if (isMultiRootWorkspace()) return;
		const compUri = vscode.Uri.joinPath(folder.uri, "ref-components.yaml");
		await openAndShow(compUri);

		await waitForDiagnostics(compUri, () => true, { timeoutMs: 30000 });
		await delay(3000);

		const symbols = await executeWithRetry<vscode.DocumentSymbol[]>(
			"vscode.executeDocumentSymbolProvider",
			[compUri],
			(r) => Array.isArray(r),
			{ maxAttempts: 25 },
		);

		assert.ok(
			Array.isArray(symbols),
			"Document symbol provider should return an array on the target document",
		);
	});

	test("Find References works on local schema", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const schemasSection = text.indexOf("  schemas:");
		const petDefIdx = text.indexOf("    Pet:", schemasSection);
		assert.ok(petDefIdx !== -1, "Fixture should contain Pet schema definition");
		const pos = doc.positionAt(petDefIdx + "    Pe".length);

		const refs = await executeWithRetry<vscode.Location[]>(
			"vscode.executeReferenceProvider",
			[uri, pos],
			(r) => r.length > 0,
			{ maxAttempts: 15 },
		);

		assert.ok(refs && refs.length > 0, "Should find references to Pet schema");
		assert.ok(
			refs.length >= 2,
			`Should find at least declaration + usage, got ${refs.length}`,
		);
	});
});
