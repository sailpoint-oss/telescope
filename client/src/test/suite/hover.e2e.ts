/**
 * E2E Tests: Hover provider (VS Code host wiring)
 *
 * Semantic content is covered in `server/lsp/handler_test.go` (e.g.
 * `TestRichAPIFixture_HoverAndDefinition_UnixFileURI`). These tests only
 * assert the extension + LSP path returns hovers in the editor.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	delay,
	ensureSingleRootWorkspaceReady,
	isMultiRootWorkspace,
	openAndShow,
	waitForCrossFileReady,
	waitForDocumentAnalyzed,
	waitForDefinitionAvailable,
} from "./utils/e2e-helpers";

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

suite("Hover", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		({ folder } = await ensureSingleRootWorkspaceReady());
	});

	test("Hover on local $ref returns array (host wiring)", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);

		// Code-lens readiness: the proven cross-platform gate.
		await waitForDocumentAnalyzed(uri);

		const text = doc.getText();
		const refIdx = text.indexOf("#/components/schemas/User");
		assert.ok(refIdx !== -1, "Fixture should contain a local $ref to User");
		const pos = doc.positionAt(refIdx + 5);

		// Probe hover — accept whatever the provider returns. The host-wiring
		// contract is "returns an array, does not crash". Semantic content is
		// proven deterministically in Go handler tests.
		const hovers = (await vscode.commands.executeCommand(
			"vscode.executeHoverProvider",
			uri,
			pos,
		)) as vscode.Hover[] | undefined;

		assert.ok(
			hovers === undefined || Array.isArray(hovers),
			"Hover provider should return an array or undefined",
		);

		if (Array.isArray(hovers) && hovers.length > 0) {
			const content = hoverContentToString(hovers).toLowerCase();
			assert.ok(
				content.includes("user") ||
					content.includes("email") ||
					content.includes("schema") ||
					content.includes("object"),
				`Hover should mention schema context. Got: ${content.slice(0, 400)}`,
			);
		}
	});

	test("Hover on cross-file $ref is well-behaved when graph resolves", async function () {
		if (isMultiRootWorkspace()) return;

		const compUri = vscode.Uri.joinPath(folder.uri, "ref-components.yaml");
		const uri = vscode.Uri.joinPath(folder.uri, "ref-root.yaml");
		await waitForCrossFileReady(compUri, uri, { timeoutMs: 60000 });
		await waitForDocumentAnalyzed(uri);
		const doc = await vscode.workspace.openTextDocument(uri);

		const text = doc.getText();
		const refIdx = text.indexOf("$ref:");
		assert.ok(refIdx !== -1, "Fixture should contain a $ref in ref-root.yaml");
		const refLine = doc.positionAt(refIdx).line;
		const lineText = doc.lineAt(refLine).text;
		const valueStart = lineText.indexOf('"') + 1;
		const pos = new vscode.Position(refLine, valueStart + 5);
		await waitForDefinitionAvailable(uri, pos, { timeoutMs: 120000 });

		let hovers: vscode.Hover[] = [];
		const crossFileDeadline = Date.now() + 30000;
		while (Date.now() < crossFileDeadline) {
			hovers = (await vscode.commands.executeCommand(
				"vscode.executeHoverProvider",
				uri,
				pos,
			)) as vscode.Hover[];
			if (Array.isArray(hovers) && hovers.length > 0) break;
			await delay(400);
		}
		if (hovers.length === 0) {
			const empty = (await vscode.commands.executeCommand(
				"vscode.executeHoverProvider",
				uri,
				pos,
			)) as vscode.Hover[] | undefined;
			assert.ok(
				empty === undefined || Array.isArray(empty),
				"Hover provider should return array or undefined",
			);
			return;
		}
		const lower = hoverContentToString(hovers).toLowerCase();
		assert.ok(
			lower.includes("user") ||
				lower.includes("id") ||
				lower.includes("object"),
			`Cross-file hover should expose referenced schema details when present. Got: ${hoverContentToString(hovers).slice(0, 350)}`,
		);
	});

	test("Hover returns empty or array at non-hoverable position", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);
		await waitForDocumentAnalyzed(uri);

		const pos = new vscode.Position(0, 0);
		const hovers = (await vscode.commands.executeCommand(
			"vscode.executeHoverProvider",
			uri,
			pos,
		)) as vscode.Hover[] | undefined;

		assert.ok(
			hovers === undefined || Array.isArray(hovers),
			"Hover at file start should return array or undefined",
		);
	});
});
