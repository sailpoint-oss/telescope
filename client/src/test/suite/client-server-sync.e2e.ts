/**
 * E2E Tests: Client-side OpenAPI file discovery
 *
 * Validates that the workspace scanner discovers OpenAPI files and that
 * project info returns correct client-side data.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForProjectInfo,
} from "./utils/e2e-helpers";

suite("Client File Discovery", () => {
	test("Scanner should discover OpenAPI files after scan", async () => {
		if (isMultiRootWorkspace()) return;

		await activateExtension();
		const testAPI = getTestApi();
		await testAPI.waitForSessionsRunning(120000);

		const folder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(folder, "Should have a workspace folder");
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");
		await openAndShow(uri);

		const projectInfo = await waitForProjectInfo(
			testAPI,
			(i) => i.knownOpenAPIFiles > 0,
			{ timeoutMs: 60000, uri },
		);

		assert.ok(
			projectInfo.knownOpenAPIFiles > 0,
			`Should have found OpenAPI files. Found: ${projectInfo.knownOpenAPIFiles}`,
		);
	});

	test("Project info should include workspace path", async () => {
		if (isMultiRootWorkspace()) return;

		await activateExtension();
		const testAPI = getTestApi();
		await testAPI.waitForSessionsRunning(120000);

		const folder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(folder, "Should have a workspace folder");
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");
		await openAndShow(uri);

		const projectInfo = await waitForProjectInfo(
			testAPI,
			(i) => i.knownOpenAPIFiles >= 0,
			{ timeoutMs: 60000, uri },
		);

		assert.ok(
			projectInfo.workspacePath,
			`Workspace path should be set. Got: ${projectInfo.workspacePath}`,
		);
	});
});
