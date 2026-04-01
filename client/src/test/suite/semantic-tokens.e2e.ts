/**
 * E2E Tests: Semantic tokens provider
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	decodeSemanticTokens,
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

	test("Semantic tokens include expected token types for rich spec", async () => {
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
		const decoded = decodeSemanticTokens(Array.from(tokens.data));
		assert.ok(decoded.length >= 10, `Expected >= 10 tokens. Got: ${decoded.length}`);

		const tokenTypes = new Set(decoded.map((t) => t.type));

		// Verify the token set includes expected types from semantic_tokens.go.
		// Actual types observed: 3(enum/status), 6(typeParam/pathParam),
		// 8(variable/$ref), 10(function/operationId), 11(method/HTTP), 13(keyword/schemaType)
		assert.ok(
			tokenTypes.has(10),
			`Expected function token (type 10) for operationId. Got types: ${[...tokenTypes].join(",")}`,
		);
		assert.ok(
			tokenTypes.has(11),
			`Expected method token (type 11) for HTTP methods. Got types: ${[...tokenTypes].join(",")}`,
		);
		assert.ok(
			tokenTypes.has(8),
			`Expected variable token (type 8) for $ref values. Got types: ${[...tokenTypes].join(",")}`,
		);
	});
});
