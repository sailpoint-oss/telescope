/**
 * E2E Tests: Multi-Root Workspace Support
 *
 * Note: This test requires running with a multi-root workspace.
 * The test runner should be configured to use telescope-multi.code-workspace.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	assertUriResolvesToSameFile,
	extractTargetUri,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDefinitionAvailable,
	waitForDiagnostics,
	waitForDocumentAnalyzed,
	waitForProjectInfo,
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
					(i) => i.knownOpenAPIFiles > 0,
					{ timeoutMs: 120000, uri: folder.uri },
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
			timeoutMs: 120000,
			uri: folderA.uri,
		});
		const infoB0 = await waitForProjectInfo(api, (i) => i.knownOpenAPIFiles > 0, {
			timeoutMs: 120000,
			uri: folderB.uri,
		});

		const baseA = infoA0.knownOpenAPIFiles;
		const baseB = infoB0.knownOpenAPIFiles;

		// Create a new OpenAPI file in folderA using VS Code's workspace API.
		const fileName = `mr-${Date.now()}.yaml`;
		const dirUri = vscode.Uri.joinPath(folderA.uri, "tmp-e2e");
		const fileUri = vscode.Uri.joinPath(dirUri, fileName);
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

		try {
			// Opening the file ensures VS Code processes it and triggers
			// didOpen, which reliably updates the scanner count even when
			// the filesystem watcher is slow.
			const newDoc = await vscode.workspace.openTextDocument(fileUri);
			await vscode.window.showTextDocument(newDoc, { preview: true, preserveFocus: true });

			// Wait for folderA to increment; folderB should remain stable
			await waitForProjectInfo(
				api,
				(i) => i.knownOpenAPIFiles > baseA,
				{ timeoutMs: 120000, uri: folderA.uri },
			);
			const infoB1 = api.getProjectInfo(folderB.uri);
			assert.ok(infoB1, "Expected project info for folderB");
			assert.strictEqual(
				infoB1.knownOpenAPIFiles,
				baseB,
				"folderB OpenAPI file count should not change when folderA changes",
			);
		} finally {
			try {
				await vscode.workspace.fs.delete(dirUri, { recursive: true });
			} catch (err) {
				console.warn(`cleanup tmp-e2e failed: ${err}`);
			}
		}
	});

	test("Cross-file definitions stay bound to the owning workspace folder", async () => {
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(180000);

		if (!isMultiRootWorkspace()) {
			return;
		}

		const folders = vscode.workspace.workspaceFolders || [];
		const targets = folders.filter((f) => f.name === "folderA" || f.name === "folderB");
		assert.ok(targets.length >= 2, "Expected folderA and folderB in multi-root workspace");
		const rootName = "mr-routing-root.yaml";
		const modelName = "mr-routing-models.yaml";
		const refValue = `./${modelName}#/components/schemas/SharedThing`;

		const modelSpec = (folderName: string) =>
			[
				"openapi: 3.1.0",
				"info:",
				`  title: ${folderName} Models`,
				"  version: 1.0.0",
				"paths: {}",
				"components:",
				"  schemas:",
				"    SharedThing:",
				"      type: object",
				"      description: Bound to " + folderName,
				"      properties:",
				"        id:",
				"          type: string",
				"",
			].join("\n");

		const rootSpec = (folderName: string) =>
			[
				"openapi: 3.1.0",
				"info:",
				`  title: ${folderName} Root`,
				"  version: 1.0.0",
				"paths:",
				"  /items:",
				"    get:",
				`      operationId: get${folderName}Items`,
				"      responses:",
				'        "200":',
				"          description: OK",
				"          content:",
				"            application/json:",
				"              schema:",
				`                $ref: '${refValue}'`,
				"",
			].join("\n");

		const createdUris: vscode.Uri[] = [];

		for (const folder of targets) {
			const modelUri = vscode.Uri.joinPath(folder.uri, modelName);
			const rootUri = vscode.Uri.joinPath(folder.uri, rootName);
			await vscode.workspace.fs.writeFile(
				modelUri,
				Buffer.from(modelSpec(folder.name), "utf-8"),
			);
			await vscode.workspace.fs.writeFile(
				rootUri,
				Buffer.from(rootSpec(folder.name), "utf-8"),
			);
			createdUris.push(rootUri, modelUri);
		}

		try {
			for (const folder of targets) {
				const modelUri = vscode.Uri.joinPath(folder.uri, modelName);
				const rootUri = vscode.Uri.joinPath(folder.uri, rootName);

				await openAndShow(modelUri);
				await waitForDocumentAnalyzed(modelUri, {
					timeoutMs: 120000,
					skipDiagnostics: true,
				});

				const doc = await openAndShow(rootUri);
				await waitForDocumentAnalyzed(rootUri, {
					timeoutMs: 120000,
					skipDiagnostics: true,
				});

				const projectInfo = await waitForProjectInfo(
					api,
					(info) => info.workspacePath !== null,
					{ timeoutMs: 120000, uri: rootUri },
				);
				assert.strictEqual(
					projectInfo.workspacePath,
					folder.uri.fsPath,
					`Project info for ${folder.name} should stay bound to its own workspace folder`,
				);

				const refIdx = doc.getText().indexOf(refValue);
				assert.ok(refIdx !== -1, `Expected ${rootName} to reference ${modelName}`);
				const refPos = doc.positionAt(
					refIdx + refValue.indexOf("SharedThing") + 2,
				);

				const defs = await waitForDefinitionAvailable(rootUri, refPos, {
					timeoutMs: 120000,
				});
				assert.ok(
					defs.length > 0,
					`Expected a definition result for ${folder.name} cross-file ref`,
				);
				await assertUriResolvesToSameFile(
					extractTargetUri(defs[0]!),
					modelUri,
					`${folder.name} should resolve against its own ${modelName}`,
				);
			}
		} finally {
			try {
				await vscode.commands.executeCommand("workbench.action.files.revert");
			} catch {
				// best effort
			}
			try {
				await vscode.commands.executeCommand("workbench.action.closeAllEditors");
			} catch {
				// best effort
			}
			for (const uri of createdUris) {
				try {
					await vscode.workspace.fs.delete(uri);
				} catch {
					// cleanup best-effort
				}
			}
		}
	});
});


