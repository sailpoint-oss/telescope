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

	test("Code lens shows reference counts on components", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});
		await waitForProviders(uri, { timeoutMs: 60000 });

		const lenses = await executeWithRetry<vscode.CodeLens[]>(
			"vscode.executeCodeLensProvider",
			[uri],
			(r) => Array.isArray(r) && r.length > 0,
		);

		assert.ok(lenses && lenses.length > 0, "Expected code lenses on component definitions");

		const titles = lenses.map((l) => l.command?.title ?? "").filter(Boolean);

		// code_lens.go: reference count lens has format "<N> references"
		const refLens = titles.filter((t) => /\d+ references?/.test(t));
		assert.ok(
			refLens.length > 0,
			`Expected at least one lens matching '<N> references'. Got titles: ${titles.join(", ")}`,
		);

		// code_lens.go: file header lens shows "OpenAPI <version>"
		const headerLens = titles.find((t) => t.includes("OpenAPI"));
		assert.ok(
			headerLens,
			`Expected header lens with 'OpenAPI'. Got titles: ${titles.join(", ")}`,
		);
	});

	test("Health score lens shows API quality breakdown", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);

		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });
		await waitForProviders(uri, { timeoutMs: 60000 });

		const lenses = await executeWithRetry<vscode.CodeLens[]>(
			"vscode.executeCodeLensProvider",
			[uri],
			(r) => Array.isArray(r) && r.length > 0,
		);

		const titles = lenses.map((l) => l.command?.title ?? "").filter(Boolean);

		// code_lens.go: health lens format "API Health: <N>/100 | <paths> paths | <schemas> schemas | ..."
		const healthLens = titles.find((t) => /API Health: \d+\/100/.test(t));
		assert.ok(
			healthLens,
			`Expected health score lens matching 'API Health: N/100'. Got titles: ${titles.join(", ")}`,
		);
		assert.ok(
			healthLens!.includes("paths") && healthLens!.includes("schemas"),
			`Health lens should include paths and schemas counts. Got: ${healthLens}`,
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
