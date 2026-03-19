/**
 * E2E Tests: Code lens provider
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

suite("Code Lens", () => {
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

	test("Code lens shows reference counts on components", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const lenses = await executeWithRetry<vscode.CodeLens[]>(
			"vscode.executeCodeLensProvider",
			[uri],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(lenses && lenses.length > 0, "Expected code lenses on component definitions");

		const hasRefLens = lenses.some(
			(lens) => lens.command?.title?.toLowerCase().includes("reference"),
		);
		assert.ok(
			hasRefLens,
			`Expected at least one lens showing reference count. Got titles: ${lenses.map((l) => l.command?.title).join(", ")}`,
		);
	});

	test("Code lens returns array for valid spec", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");
		await openAndShow(uri);

		await waitForDiagnostics(uri, () => true, { timeoutMs: 30000 });

		const lenses = (await vscode.commands.executeCommand(
			"vscode.executeCodeLensProvider",
			uri,
		)) as vscode.CodeLens[] | undefined;

		assert.ok(
			lenses === undefined || Array.isArray(lenses),
			"Code lens provider should return array or undefined",
		);
	});
});
