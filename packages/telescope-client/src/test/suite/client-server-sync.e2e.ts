/**
 * E2E Tests: Client-Server Synchronization
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

suite("Client-Server Sync", () => {
	test("Server should receive client file list after scan", async () => {
		// Single-root fixture only
		if (isMultiRootWorkspace()) return;

		await activateExtension();
		const testAPI = getTestApi();

		// Wait for sessions to be ready
		await testAPI.waitForSessionsRunning(60000);

		const folder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(folder, "Should have a workspace folder");
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");
		await openAndShow(uri);

		const projectInfo = await waitForProjectInfo(
			testAPI,
			(i) => i.hasClientFileList && i.knownOpenAPIFiles > 0,
			{ timeoutMs: 60000, uri },
		);

		// Verify client file list was sent to server
		assert.ok(
			projectInfo.hasClientFileList,
			"Server should have received client file list",
		);

		// Verify we found some OpenAPI files
		assert.ok(
			projectInfo.knownOpenAPIFiles > 0,
			`Should have found OpenAPI files. Found: ${projectInfo.knownOpenAPIFiles}`,
		);
	});

	test("Project info should include workspace path", async () => {
		// Single-root fixture only
		if (isMultiRootWorkspace()) return;

		await activateExtension();
		const testAPI = getTestApi();

		// Wait for sessions to be ready
		await testAPI.waitForSessionsRunning(60000);

		const folder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(folder, "Should have a workspace folder");
		const uri = vscode.Uri.joinPath(folder.uri, "valid.yaml");
		await openAndShow(uri);

		const projectInfo = await waitForProjectInfo(
			testAPI,
			(i) => i.hasClientFileList,
			{ timeoutMs: 60000, uri },
		);

		// Verify workspace path is set
		assert.ok(
			projectInfo.workspacePath,
			`Workspace path should be set. Got: ${projectInfo.workspacePath}`,
		);
	});
});


