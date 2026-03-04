/**
 * E2E Tests: Language IDs (grammar/tokenization)
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
} from "./utils/e2e-helpers";

suite("Language IDs", () => {
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

	test("OpenAPI YAML should be set to openapi-yaml on open", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");

		const doc = await openAndShow(uri);
		assert.strictEqual(
			doc.languageId,
			"openapi-yaml",
			`Expected openapi-yaml, got ${doc.languageId}`,
		);
	});

	test("OpenAPI JSON should be set to openapi-json on open", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "openapi.json");

		const doc = await openAndShow(uri);
		assert.strictEqual(
			doc.languageId,
			"openapi-json",
			`Expected openapi-json, got ${doc.languageId}`,
		);
	});

	test("Non-OpenAPI YAML should remain yaml", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "plain.yaml");

		const doc = await openAndShow(uri);
		assert.strictEqual(doc.languageId, "yaml", `Expected yaml, got ${doc.languageId}`);
	});
});


