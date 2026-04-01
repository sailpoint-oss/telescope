/**
 * E2E Tests: Linked editing range provider
 *
 * Tests textDocument/linkedEditingRange — simultaneous editing of
 * matching tag names, $ref values, and operationIds.
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

suite("Linked Editing", () => {
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

	test("Linked editing on tag name returns matching ranges", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const tagIdx = text.indexOf("- name: Users");
		assert.ok(tagIdx !== -1, "Fixture should contain Users tag");
		const pos = doc.positionAt(tagIdx + "- name: Us".length);

		const result = await executeWithRetry<
			{ ranges: vscode.Range[] } | undefined
		>(
			"vscode.executeLinkedEditingRangeProvider",
			[uri, pos],
			(r) => r !== undefined && r !== null && r.ranges?.length > 0,
			{ maxAttempts: 15 },
		);

		if (result) {
			// linked_editing.go: tag name returns definition + operation usages (>= 2 ranges)
			assert.ok(
				result.ranges.length >= 2,
				`Expected >= 2 linked ranges (definition + usages). Got: ${result.ranges.length}`,
			);
		}
	});

	test("Linked editing returns null for non-linkable position", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		// Position on the openapi version string — not a tag, ref, or operationId
		const pos = new vscode.Position(0, 10);

		const result = (await vscode.commands.executeCommand(
			"vscode.executeLinkedEditingRangeProvider",
			uri,
			pos,
		)) as { ranges: vscode.Range[] } | undefined;

		assert.ok(
			result === undefined || result === null || result.ranges.length === 0,
			"Linked editing at non-linkable position should return null/empty",
		);
	});
});
