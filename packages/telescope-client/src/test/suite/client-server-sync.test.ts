/**
 * E2E Tests: Client-Server Synchronization
 */

import * as assert from "assert";
import * as vscode from "vscode";

suite("Client-Server Sync", () => {
	test("Server should receive client file list after scan", async () => {
		const extension = vscode.extensions.getExtension("sailpoint.telescope");
		assert.ok(extension, "Extension should be available");

		if (!extension.isActive) {
			await extension.activate();
		}

		const exports = extension.exports as {
			__telescopeTest?: {
				waitForSessionsRunning: (timeoutMs?: number) => Promise<void>;
				getProjectInfo: (uri?: vscode.Uri) => Promise<{
					knownOpenAPIFiles: number;
					rootDocuments: number;
					hasClientFileList: boolean;
					workspacePath: string | null;
					cachedDocuments: number;
				} | null>;
			};
		};

		const testAPI = exports.__telescopeTest;
		assert.ok(testAPI, "Test API should be available");

		// Wait for sessions to be ready
		await testAPI.waitForSessionsRunning(60000);

		// Wait a bit longer for background scan to complete
		await new Promise((resolve) => setTimeout(resolve, 3000));

		// Get project info from server
		const projectInfo = await testAPI.getProjectInfo();
		assert.ok(projectInfo, "Should be able to get project info");

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
		const extension = vscode.extensions.getExtension("sailpoint.telescope");
		assert.ok(extension, "Extension should be available");

		if (!extension.isActive) {
			await extension.activate();
		}

		const exports = extension.exports as {
			__telescopeTest?: {
				waitForSessionsRunning: (timeoutMs?: number) => Promise<void>;
				getProjectInfo: (uri?: vscode.Uri) => Promise<{
					knownOpenAPIFiles: number;
					rootDocuments: number;
					hasClientFileList: boolean;
					workspacePath: string | null;
					cachedDocuments: number;
				} | null>;
			};
		};

		const testAPI = exports.__telescopeTest;
		assert.ok(testAPI, "Test API should be available");

		// Wait for sessions to be ready
		await testAPI.waitForSessionsRunning(60000);

		// Wait for background scan
		await new Promise((resolve) => setTimeout(resolve, 3000));

		const projectInfo = await testAPI.getProjectInfo();
		assert.ok(projectInfo, "Should be able to get project info");

		// Verify workspace path is set
		assert.ok(
			projectInfo.workspacePath,
			`Workspace path should be set. Got: ${projectInfo.workspacePath}`,
		);
	});
});

