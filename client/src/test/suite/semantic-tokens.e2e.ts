/**
 * E2E Tests: Semantic tokens provider
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

suite("Semantic Tokens", () => {
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

	test("Semantic tokens returned for OpenAPI file", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const tokens = await executeWithRetry<vscode.SemanticTokens>(
			"vscode.provideDocumentSemanticTokens",
			[uri],
			(r) => r !== undefined && r !== null && r.data?.length > 0,
		);

		assert.ok(tokens, "Expected semantic tokens result");
		assert.ok(tokens.data.length > 0, "Expected non-empty semantic tokens data");
	});

	test("Semantic tokens data has reasonable size for rich spec", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const tokens = await executeWithRetry<vscode.SemanticTokens>(
			"vscode.provideDocumentSemanticTokens",
			[uri],
			(r) => r !== undefined && r !== null && r.data?.length > 0,
		);

		assert.ok(tokens, "Expected semantic tokens");
		// Each token is encoded as 5 integers (line, startChar, length, tokenType, modifiers)
		// A rich API spec should produce many tokens
		const tokenCount = tokens.data.length / 5;
		assert.ok(
			tokenCount >= 5,
			`Expected at least 5 semantic tokens for rich spec. Got: ${tokenCount}`,
		);
	});
});
