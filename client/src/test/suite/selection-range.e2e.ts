/**
 * E2E Tests: Selection range provider
 *
 * Tests textDocument/selectionRange — smart selection expansion from
 * property → schema → components → document.
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

suite("Selection Range", () => {
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

	test("Selection range expands from property through parent nodes", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		// Position inside the User.email property
		const text = doc.getText();
		const emailIdx = text.indexOf("email:");
		assert.ok(emailIdx !== -1, "Fixture should contain email property");
		const pos = doc.positionAt(emailIdx + 2);

		const ranges = await executeWithRetry<vscode.SelectionRange[]>(
			"vscode.executeSelectionRangeProvider",
			[uri, [pos]],
			(r) => Array.isArray(r) && r.length > 0,
			{ maxAttempts: 15 },
		);

		assert.ok(ranges && ranges.length > 0, "Expected selection range result");

		// Walk the parent chain and verify each parent contains the child
		let current: vscode.SelectionRange | undefined = ranges[0];
		let depth = 0;
		while (current?.parent) {
			const child = current.range;
			const parent = current.parent.range;
			assert.ok(
				parent.contains(child),
				`Parent range at depth ${depth} should contain child range`,
			);
			current = current.parent;
			depth++;
		}

		// Should have at least 2 levels of nesting (property → parent block → ...)
		assert.ok(
			depth >= 2,
			`Expected at least 2 levels of selection expansion. Got: ${depth}`,
		);
	});

	test("Selection range on path operation expands through path item", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		// Position inside the listUsers operation
		const text = doc.getText();
		const opIdx = text.indexOf("operationId: listUsers");
		assert.ok(opIdx !== -1, "Fixture should contain listUsers operationId");
		const pos = doc.positionAt(opIdx + 15);

		const ranges = await executeWithRetry<vscode.SelectionRange[]>(
			"vscode.executeSelectionRangeProvider",
			[uri, [pos]],
			(r) => Array.isArray(r) && r.length > 0,
			{ maxAttempts: 15 },
		);

		assert.ok(ranges && ranges.length > 0, "Expected selection range for operation");

		// Walk chain to verify containment
		let current: vscode.SelectionRange | undefined = ranges[0];
		let depth = 0;
		while (current?.parent) {
			assert.ok(
				current.parent.range.contains(current.range),
				`Parent should contain child at depth ${depth}`,
			);
			current = current.parent;
			depth++;
		}
		assert.ok(depth >= 2, `Expected >= 2 nesting levels. Got: ${depth}`);
	});
});
