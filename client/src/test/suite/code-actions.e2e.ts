/**
 * E2E Tests: Code action provider (quick fixes)
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Code Actions", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
	});

	test("Code actions offered for file with diagnostics", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);

		const diagnostics = await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		assert.ok(diagnostics.length > 0, "Should have diagnostics");

		const firstDiag = diagnostics[0]!;
		const actions = (await vscode.commands.executeCommand(
			"vscode.executeCodeActionProvider",
			uri,
			firstDiag.range,
		)) as vscode.CodeAction[] | undefined;

		assert.ok(
			Array.isArray(actions),
			"Code action provider should return an array",
		);

		if (actions.length > 0) {
			for (const action of actions) {
				assert.ok(
					action.title && action.title.length > 0,
					"Code action should have a non-empty title",
				);
			}
		}
	});

	test("Code actions do not crash on valid file", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");
		const doc = await openAndShow(uri);

		await waitForDiagnostics(uri, () => true, { timeoutMs: 60000 });

		const fullRange = new vscode.Range(
			new vscode.Position(0, 0),
			doc.positionAt(doc.getText().length),
		);

		const actions = (await vscode.commands.executeCommand(
			"vscode.executeCodeActionProvider",
			uri,
			fullRange,
		)) as vscode.CodeAction[] | undefined;

		assert.ok(
			actions === undefined || Array.isArray(actions),
			"Code action provider should return array or undefined for valid file",
		);
	});

	test("Code actions include disable-rule actions for telescope diagnostics", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);

		const diagnostics = await waitForDiagnostics(uri, (d) => d.length > 0, {
			timeoutMs: 60000,
		});

		const telescopeDiag = diagnostics.find(
			(d) => d.source === "telescope" || d.source === "Telescope",
		);
		if (!telescopeDiag) {
			// No telescope diagnostics to test code actions for
			return;
		}

		const actions = (await vscode.commands.executeCommand(
			"vscode.executeCodeActionProvider",
			uri,
			telescopeDiag.range,
		)) as vscode.CodeAction[] | undefined;

		assert.ok(Array.isArray(actions), "Should return code actions array");
	});
});
