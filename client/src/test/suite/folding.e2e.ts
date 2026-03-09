/**
 * E2E Tests: Folding range provider
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
} from "./utils/e2e-helpers";

suite("Folding Ranges", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(60000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
	});

	test("Folding ranges cover paths and operations", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const ranges = await executeWithRetry<vscode.FoldingRange[]>(
			"vscode.executeFoldingRangeProvider",
			[uri],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(ranges && ranges.length > 0, "Expected folding ranges");

		// rich-api.yaml has: info, tags, servers, 4 path items (each with operations),
		// components (with schemas, responses, parameters, securitySchemes).
		// We should get at least 10 folding ranges.
		assert.ok(
			ranges.length >= 10,
			`Expected at least 10 folding ranges for rich spec. Got: ${ranges.length}`,
		);
	});

	test("Folding ranges exist for simple spec too", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");
		await openAndShow(uri);

		await waitForDiagnostics(uri, () => true, { timeoutMs: 60000 });

		const ranges = await executeWithRetry<vscode.FoldingRange[]>(
			"vscode.executeFoldingRangeProvider",
			[uri],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(ranges && ranges.length > 0, "Expected folding ranges even for a small spec");
	});
});
