/**
 * E2E Tests: Multi-Root Workspace Support
 *
 * Note: This test requires running with a multi-root workspace.
 * The test runner should be configured to use telescope-multi.code-workspace.
 */

import * as assert from "assert";
import * as vscode from "vscode";

suite("Multi-Root Workspace", () => {
	test("Should create sessions for all workspace folders", async () => {
		const extension = vscode.extensions.getExtension("sailpoint.telescope");
		assert.ok(extension, "Extension should be available");

		if (!extension.isActive) {
			await extension.activate();
		}

		const exports = extension.exports as {
			__telescopeTest?: {
				waitForSessionsRunning: (timeoutMs?: number) => Promise<void>;
				getSessionStates: () => Array<{ folder: string; state: string }>;
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

		// Check session states
		const states = testAPI.getSessionStates();
		const workspaceFolders = vscode.workspace.workspaceFolders || [];

		// If we have multiple workspace folders, verify we have sessions for all
		if (workspaceFolders.length > 1) {
			assert.ok(
				states.length >= workspaceFolders.length,
				`Should have at least ${workspaceFolders.length} sessions for ${workspaceFolders.length} folders. Found: ${states.length}`,
			);

			// Verify all sessions are running
			assert.ok(
				states.every((s) => s.state === "running"),
				`All sessions should be running. States: ${JSON.stringify(states)}`,
			);

			// Test project info for each folder
			for (const folder of workspaceFolders) {
				const projectInfo = await testAPI.getProjectInfo(folder.uri);
				assert.ok(
					projectInfo,
					`Should be able to get project info for folder ${folder.name}`,
				);
			}
		} else {
			// Single root workspace - just verify we have at least one session
			assert.ok(
				states.length >= 1,
				`Should have at least one session. Found: ${states.length}`,
			);
		}
	});

	test("Should produce diagnostics for files in each workspace folder", async () => {
		const extension = vscode.extensions.getExtension("sailpoint.telescope");
		assert.ok(extension, "Extension should be available");

		if (!extension.isActive) {
			await extension.activate();
		}

		const exports = extension.exports as {
			__telescopeTest?: {
				waitForSessionsRunning: (timeoutMs?: number) => Promise<void>;
			};
		};

		const testAPI = exports.__telescopeTest;
		assert.ok(testAPI, "Test API should be available");

		// Wait for sessions to be ready
		await testAPI.waitForSessionsRunning(60000);

		const workspaceFolders = vscode.workspace.workspaceFolders || [];

		// If we have multiple folders, check diagnostics in folderB (which has invalid-b.yaml)
		if (workspaceFolders.length > 1) {
			const folderB = workspaceFolders.find((f) => f.name === "folderB");
			if (folderB) {
				const invalidFile = vscode.Uri.joinPath(
					folderB.uri,
					"invalid-b.yaml",
				);

				// Open the file
				const document = await vscode.workspace.openTextDocument(invalidFile);
				await vscode.window.showTextDocument(document);

				// Wait for diagnostics
				await new Promise((resolve) => setTimeout(resolve, 2000));

				const diagnostics = vscode.languages.getDiagnostics(invalidFile);
				assert.ok(
					diagnostics.length > 0,
					`Should have diagnostics for invalid file in folderB. Found: ${diagnostics.length}`,
				);
			}
		}
	});
});

