/**
 * E2E Tests: Multi-Root Workspace Support
 *
 * Note: This test requires running with a multi-root workspace.
 * The test runner should be configured to use telescope-multi.code-workspace.
 */

import * as assert from "assert";
import { rm } from "node:fs/promises";
import * as vscode from "vscode";
import {
	activateExtension,
	executeWithRetry,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
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

				const diagnostics = await waitForDiagnostics(
					invalidFile,
					(d) => d.length > 0,
					{ timeoutMs: 30000 },
				);
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

		// Wait for each folder's scan to discover at least one file before
		// capturing baselines — the >= 0 predicate was always true and could
		// snapshot a zero count before the scan finished.
		const infoA0 = await waitForProjectInfo(api, (i) => i.knownOpenAPIFiles > 0, {
			timeoutMs: 60000,
			uri: folderA.uri,
		});
		const infoB0 = await waitForProjectInfo(api, (i) => i.knownOpenAPIFiles > 0, {
			timeoutMs: 60000,
			uri: folderB.uri,
		});

		const baseA = infoA0.knownOpenAPIFiles;
		const baseB = infoB0.knownOpenAPIFiles;

		// Create a new OpenAPI file in folderA using VS Code's workspace API.
		const fileName = `mr-${Date.now()}.yaml`;
		const dirUri = vscode.Uri.joinPath(folderA.uri, "tmp-e2e");
		const fileUri = vscode.Uri.joinPath(dirUri, fileName);
		const absPath = fileUri.fsPath;
		await vscode.workspace.fs.createDirectory(dirUri);
		await vscode.workspace.fs.writeFile(
			fileUri,
			Buffer.from(
				[
					"openapi: 3.1.0",
					"info:",
					"  title: MultiRoot",
					"  version: 1.0.0",
					"paths: {}",
					"",
				].join("\n"),
				"utf-8",
			),
		);

		// Opening the file ensures VS Code processes it and triggers
		// didOpen, which reliably updates the scanner count even when
		// the filesystem watcher is slow.
		const newDoc = await vscode.workspace.openTextDocument(fileUri);
		await vscode.window.showTextDocument(newDoc, { preview: true, preserveFocus: true });

		// Wait for folderA to increment; folderB should remain stable
		await waitForProjectInfo(
			api,
			(i) => i.knownOpenAPIFiles > baseA,
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

	test("Definition, hover, references, and rename work per-folder", async () => {
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(180000);

		if (!isMultiRootWorkspace()) {
			return;
		}

		const folders = vscode.workspace.workspaceFolders || [];
		const targets = folders.filter((f) => f.name === "folderA" || f.name === "folderB");
		assert.ok(targets.length >= 2, "Expected folderA and folderB in multi-root workspace");

		for (const folder of targets) {
			const fileName = `mr-features-${Date.now()}-${folder.name}.yaml`;
			const uri = vscode.Uri.joinPath(folder.uri, fileName);
			const original = [
				"openapi: 3.1.0",
				"info:",
				`  title: ${folder.name} Feature Test`,
				"  version: 1.0.0",
				"paths:",
				"  /items:",
				"    get:",
				"      operationId: getItems",
				"      responses:",
				'        "200":',
				"          description: OK",
				"          content:",
				"            application/json:",
				"              schema:",
				"                $ref: '#/components/schemas/Item'",
				"components:",
				"  schemas:",
				"    Item:",
				"      type: object",
				"      properties:",
				"        id:",
				"          type: string",
				"",
			].join("\n");

			await vscode.workspace.fs.writeFile(uri, Buffer.from(original, "utf-8"));
			try {
				const doc = await openAndShow(uri);
				await waitForDiagnostics(uri, () => true, { timeoutMs: 30000 });

				const text = doc.getText();
				const refIdx = text.indexOf("$ref:");
				assert.ok(refIdx !== -1, "Should contain a $ref");
				const refPos = doc.positionAt(refIdx + "$ref: ".length + 2);

				const defs = await executeWithRetry<(vscode.Location | vscode.LocationLink)[]>(
					"vscode.executeDefinitionProvider",
					[uri, refPos],
					(r) => Array.isArray(r),
					{ maxAttempts: 20 },
				);

				const hovers = await executeWithRetry<vscode.Hover[]>(
					"vscode.executeHoverProvider",
					[uri, refPos],
					(r) => Array.isArray(r),
					{ maxAttempts: 20 },
				);

				const schemaIdx = text.indexOf("    Item:");
				assert.ok(schemaIdx !== -1, "Should contain schema definition");
				const schemaPos = doc.positionAt(schemaIdx + "    It".length);

				const refs = await executeWithRetry<vscode.Location[]>(
					"vscode.executeReferenceProvider",
					[uri, schemaPos],
					(r) => Array.isArray(r) && r.length >= 2,
					{ maxAttempts: 20 },
				);
				assert.ok(refs.length >= 2, "References should include definition and usage");

				const renameEdit = await executeWithRetry<vscode.WorkspaceEdit | undefined>(
					"vscode.executeDocumentRenameProvider",
					[uri, schemaPos, "RenamedItem"],
					(r) => r !== undefined,
					{ maxAttempts: 20 },
				);
				assert.ok(renameEdit, "Rename should return workspace edits");
				const entries = renameEdit!.entries();
				assert.ok(entries.length > 0, "Rename should include edits");
				assert.ok(
					entries.every(([editUri]) => editUri.toString() === uri.toString()),
					"Rename should only touch files in the same folder/spec for this local case",
				);
			} finally {
				await vscode.commands.executeCommand("workbench.action.files.revert");
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
				try {
					await vscode.workspace.fs.delete(uri);
				} catch {
					// cleanup best-effort
				}
			}
		}
	});
});


