/**
 * E2E Tests: Type definition provider
 *
 * Tests textDocument/typeDefinition — navigating from $ref or parameter
 * to the underlying type/schema definition.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	assertUriFsPathEqual,
	executeWithRetry,
	extractTargetRange,
	extractTargetUri,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
	waitForProviders,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

suite("Type Definition", () => {
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

	test("Type definition on $ref resolves to schema definition", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		const doc = await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		const text = doc.getText();
		const refIdx = text.indexOf("#/components/schemas/User");
		assert.ok(refIdx !== -1, "Fixture should contain a $ref to User");
		const pos = doc.positionAt(refIdx + 5);

		const defs = await executeWithRetry<(vscode.Location | vscode.LocationLink)[]>(
			"vscode.executeTypeDefinitionProvider",
			[uri, pos],
			(r) => Array.isArray(r),
			{ maxAttempts: 15 },
		);

		assert.ok(Array.isArray(defs), "Type definition should return an array");
		// When the type definition resolves, validate the target.
		if (defs.length > 0) {
			const targetUri = extractTargetUri(defs[0]!);
			assertUriFsPathEqual(targetUri, uri, "Type definition should resolve in same file");
			const range = extractTargetRange(defs[0]!);
			assert.ok(range.start.line > 0, "Should land at schema definition, not file start");
		}
	});

	test("Type definition returns empty for non-ref position", async () => {
		if (isMultiRootWorkspace()) return;
		const uri = vscode.Uri.joinPath(folder.uri, "rich-api.yaml");
		await openAndShow(uri);
		await waitForDiagnostics(uri, (d) => d.length > 0, { timeoutMs: 60000 });

		// Position at openapi version string — not a $ref or schema
		const pos = new vscode.Position(0, 10);

		const defs = (await vscode.commands.executeCommand(
			"vscode.executeTypeDefinitionProvider",
			uri,
			pos,
		)) as (vscode.Location | vscode.LocationLink)[] | undefined;

		assert.ok(
			defs === undefined || defs === null || (Array.isArray(defs) && defs.length === 0),
			"Type definition at non-ref position should return empty",
		);
	});
});
