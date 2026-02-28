/**
 * E2E Tests: Multi-Root Workspace Support
 *
 * Note: This test requires running with a multi-root workspace.
 * The test runner should be configured to use telescope-multi.code-workspace.
 */

import * as assert from "assert";
import { mkdir, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
	activateExtension,
	getTestApi,
	isMultiRootWorkspace,
	waitForProjectInfo,
	delay,
} from "./utils/e2e-helpers";

suite("Multi-Root Workspace", () => {
	test("Should create sessions for all workspace folders", async () => {
		await activateExtension();
		const testAPI = getTestApi();

		// Wait for sessions to be ready
		await testAPI.waitForSessionsRunning(180000);

		// Check session states
		const states = testAPI.getSessionStates();
		const workspaceFolders = vscode.workspace.workspaceFolders || [];

		// If we have multiple workspace folders, verify we have sessions for all
		if (isMultiRootWorkspace()) {
			assert.ok(
				states.length >= workspaceFolders.length,
				`Should have at least ${workspaceFolders.length} sessions for ${workspaceFolders.length} folders. Found: ${states.length}`,
			);

			// Verify all sessions are running
			assert.ok(
				states.every((s) => s.state === "running"),
				`All sessions should be running. States: ${JSON.stringify(states)}`,
			);

			for (const folder of workspaceFolders) {
				const projectInfo = await waitForProjectInfo(
					testAPI,
					(i) => i.knownOpenAPIFiles >= 0,
					{ timeoutMs: 60000, uri: folder.uri },
				);
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
		await activateExtension();
		const testAPI = getTestApi();

		// Wait for sessions to be ready
		await testAPI.waitForSessionsRunning(180000);

		const workspaceFolders = vscode.workspace.workspaceFolders || [];

		// If we have multiple folders, check diagnostics in folderB (which has invalid-b.yaml)
		if (isMultiRootWorkspace()) {
			const folderB = workspaceFolders.find((f) => f.name === "folderB");
			if (folderB) {
				const invalidFile = vscode.Uri.joinPath(folderB.uri, "invalid-b.yaml");

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

	test("Delta changes in folderA should not affect folderB project model", async () => {
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(180000);

		if (!isMultiRootWorkspace()) {
			return;
		}

		const folders = vscode.workspace.workspaceFolders || [];
		const folderA = folders.find((f) => f.name === "folderA");
		const folderB = folders.find((f) => f.name === "folderB");
		assert.ok(folderA && folderB, "Expected folderA and folderB");

		const infoA0 = await waitForProjectInfo(api, (i) => i.knownOpenAPIFiles >= 0, {
			timeoutMs: 60000,
			uri: folderA.uri,
		});
		const infoB0 = await waitForProjectInfo(api, (i) => i.knownOpenAPIFiles >= 0, {
			timeoutMs: 60000,
			uri: folderB.uri,
		});

		const baseA = infoA0.knownOpenAPIFiles;
		const baseB = infoB0.knownOpenAPIFiles;

		// Create a new OpenAPI file in folderA
		const absPath = path.join(
			folderA.uri.fsPath,
			"tmp-e2e",
			`mr-${Date.now()}.yaml`,
		);
		await mkdir(path.dirname(absPath), { recursive: true });
		await writeFile(
			absPath,
			[
				"openapi: 3.1.0",
				"info:",
				"  title: MultiRoot",
				"  version: 1.0.0",
				"paths: {}",
				"",
			].join("\n"),
			"utf-8",
		);

		// Wait for folderA to increment; folderB should remain stable
		await waitForProjectInfo(
			api,
			(i) => i.knownOpenAPIFiles === baseA + 1,
			{ timeoutMs: 60000, uri: folderA.uri },
		);
		await delay(500);
		const infoB1 = api.getProjectInfo(folderB.uri);
		assert.ok(infoB1, "Expected project info for folderB");
		assert.strictEqual(
			infoB1.knownOpenAPIFiles,
			baseB,
			"folderB OpenAPI file count should not change when folderA changes",
		);

		await rm(absPath, { force: true });
	});
});


