/**
 * E2E Tests: Language IDs (grammar/tokenization)
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	deleteWorkspaceFile,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForLanguageId,
	writeWorkspaceFile,
} from "./utils/e2e-helpers";

suite("Language IDs", () => {
	let api: ReturnType<typeof getTestApi>;
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
	});

	test("OpenAPI YAML should be set to openapi-yaml on open", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");

		await openAndShow(uri);
		const doc = await waitForLanguageId(uri, "openapi-yaml");
		assert.strictEqual(
			doc.languageId,
			"openapi-yaml",
			`Expected openapi-yaml, got ${doc.languageId}`,
		);
	});

	test("OpenAPI JSON should be set to openapi-json on open", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "openapi.json");

		await openAndShow(uri);
		const doc = await waitForLanguageId(uri, "openapi-json");
		assert.strictEqual(
			doc.languageId,
			"openapi-json",
			`Expected openapi-json, got ${doc.languageId}`,
		);
	});

	test("Non-OpenAPI YAML should remain yaml", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "plain.yaml");

		await openAndShow(uri);
		const doc = await waitForLanguageId(uri, "yaml");
		assert.strictEqual(doc.languageId, "yaml", `Expected yaml, got ${doc.languageId}`);
	});

	test("Open YAML should reclassify after becoming OpenAPI", async () => {
		if (isMultiRootWorkspace()) return;
		const relativePath = `language-upgrade-${Date.now()}.yaml`;
		const uri = await writeWorkspaceFile(relativePath, "name: plain-yaml\n");

		try {
			let doc = await openAndShow(uri);
			doc = await waitForLanguageId(uri, "yaml");
			assert.strictEqual(doc.languageId, "yaml", `Expected yaml, got ${doc.languageId}`);

			const editor = vscode.window.activeTextEditor;
			assert.ok(editor, "Expected an active text editor");
			const replacement = `openapi: "3.1.0"
info:
  title: Dynamic Reclassification
  version: "1.0.0"
paths: {}
`;
			await editor.edit((editBuilder) => {
				editBuilder.replace(
					new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
					replacement,
				);
			});

			doc = await waitForLanguageId(uri, "openapi-yaml", { timeoutMs: 10000 });
			assert.strictEqual(
				doc.languageId,
				"openapi-yaml",
				`Expected openapi-yaml after edit, got ${doc.languageId}`,
			);
		} finally {
			await deleteWorkspaceFile(relativePath);
		}
	});
});


