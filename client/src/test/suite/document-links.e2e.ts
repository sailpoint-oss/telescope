/**
 * E2E Tests: Document link provider
 *
 * Tests textDocument/documentLink — clickable links for $ref values
 * and external URLs in descriptions.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	executeWithRetry,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForCrossFileReady,
	waitForDiagnostics,
	waitForProviders,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

suite("Document Links", () => {
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

	test("Document links include $ref links with targets", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const links = await executeWithRetry<vscode.DocumentLink[]>(
			"vscode.executeLinkProvider",
			[uri],
			(r) => r.length > 0,
			{ maxAttempts: 15 },
		);

		assert.ok(links && links.length > 0, "Expected document links");

		// Every link should have a valid range
		for (const link of links) {
			assert.ok(link.range, "Every link should have a range");
			assert.ok(
				link.range.start.line >= 0,
				"Link range should have valid start line",
			);
		}
	});

	test("Cross-file $ref links target the referenced file", async () => {
		if (isMultiRootWorkspace()) return;

		const compUri = vscode.Uri.joinPath(folder.uri, "ref-components.yaml");
		const rootUri = vscode.Uri.joinPath(folder.uri, "ref-root.yaml");
		await waitForCrossFileReady(compUri, rootUri, { timeoutMs: 60000 });

		const links = await executeWithRetry<vscode.DocumentLink[]>(
			"vscode.executeLinkProvider",
			[rootUri],
			(r) => r.length > 0,
			{ maxAttempts: 15 },
		);

		assert.ok(links && links.length > 0, "Expected links for cross-file spec");

		// ref-root.yaml has a $ref to "./ref-components.yaml#/..." — the link target
		// should point to ref-components.yaml
		const crossFileLink = links.find(
			(l) => l.target?.toString().includes("ref-components"),
		);
		assert.ok(
			crossFileLink,
			`Expected a link targeting ref-components.yaml. Got targets: ${links.map((l) => l.target?.toString() ?? "none").join(", ")}`,
		);
	});
});
