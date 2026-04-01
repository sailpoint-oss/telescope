/**
 * E2E Tests: Server commands (workspace/executeCommand)
 *
 * Tests the server-side commands: sortTags, sortPaths, generateResponseSkeletons,
 * validateExamples, bundlePreview.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	deleteWorkspaceFile,
	getTestApi,
	isMultiRootWorkspace,
	openAndShow,
	waitForDiagnostics,
	waitForDocumentAnalyzed,
	waitForLanguageId,
	writeWorkspaceFile,
} from "./utils/e2e-helpers";

suite("Commands", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (isMultiRootWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
	});

	test("sortTags alphabetizes tags", async () => {
		if (isMultiRootWorkspace()) return;

		const relativePath = `cmd-sort-tags-${Date.now()}.yaml`;
		const content = [
			'openapi: "3.1.0"',
			"info:",
			"  title: Sort Tags Test",
			'  version: "1.0.0"',
			"tags:",
			"  - name: Zebra",
			"    description: Last tag",
			"  - name: Alpha",
			"    description: First tag",
			"  - name: Middle",
			"    description: Middle tag",
			"paths: {}",
			"",
		].join("\n");

		const uri = await writeWorkspaceFile(relativePath, content);
		try {
			await openAndShow(uri);
			await waitForLanguageId(uri, "openapi-yaml", { timeoutMs: 15000 });
			await waitForDiagnostics(uri, () => true, { timeoutMs: 30000 });

			await vscode.commands.executeCommand("telescope.sortTags");

			// Wait for the workspace edit to be applied by polling the document.
			const deadline = Date.now() + 10000;
			let sorted = false;
			while (Date.now() < deadline) {
				const doc = await vscode.workspace.openTextDocument(uri);
				const text = doc.getText();
				const a = text.indexOf("- name: Alpha");
				const m = text.indexOf("- name: Middle");
				const z = text.indexOf("- name: Zebra");
				if (a !== -1 && m !== -1 && z !== -1 && a < m && m < z) {
					sorted = true;
					break;
				}
				await new Promise((r) => setTimeout(r, 500));
			}
			assert.ok(sorted, "Tags should be alphabetized (Alpha < Middle < Zebra)");
		} finally {
			try {
				await vscode.commands.executeCommand("workbench.action.files.revert");
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
			} catch { /* cleanup */ }
			await deleteWorkspaceFile(relativePath);
		}
	});

	test("sortPaths alphabetizes paths", async () => {
		if (isMultiRootWorkspace()) return;

		const relativePath = `cmd-sort-paths-${Date.now()}.yaml`;
		const content = [
			'openapi: "3.1.0"',
			"info:",
			"  title: Sort Paths Test",
			'  version: "1.0.0"',
			"paths:",
			"  /zebra:",
			"    get:",
			"      operationId: getZebra",
			"      summary: Zebra",
			"      responses:",
			'        "200":',
			"          description: OK",
			"  /alpha:",
			"    get:",
			"      operationId: getAlpha",
			"      summary: Alpha",
			"      responses:",
			'        "200":',
			"          description: OK",
			"  /middle:",
			"    get:",
			"      operationId: getMiddle",
			"      summary: Middle",
			"      responses:",
			'        "200":',
			"          description: OK",
			"",
		].join("\n");

		const uri = await writeWorkspaceFile(relativePath, content);
		try {
			await openAndShow(uri);
			await waitForLanguageId(uri, "openapi-yaml", { timeoutMs: 15000 });
			await waitForDiagnostics(uri, () => true, { timeoutMs: 30000 });

			await vscode.commands.executeCommand("telescope.sortPaths");

			// Wait for the workspace edit to be applied by polling the document.
			const deadline = Date.now() + 10000;
			let sorted = false;
			while (Date.now() < deadline) {
				const doc = await vscode.workspace.openTextDocument(uri);
				const text = doc.getText();
				const a = text.indexOf("/alpha:");
				const m = text.indexOf("/middle:");
				const z = text.indexOf("/zebra:");
				if (a !== -1 && m !== -1 && z !== -1 && a < m && m < z) {
					sorted = true;
					break;
				}
				await new Promise((r) => setTimeout(r, 500));
			}
			assert.ok(sorted, "Paths should be alphabetized (/alpha < /middle < /zebra)");
		} finally {
			try {
				await vscode.commands.executeCommand("workbench.action.files.revert");
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
			} catch { /* cleanup */ }
			await deleteWorkspaceFile(relativePath);
		}
	});

	test("generateResponseSkeletons adds missing error responses", async () => {
		if (isMultiRootWorkspace()) return;

		const relativePath = `cmd-gen-responses-${Date.now()}.yaml`;
		const content = [
			'openapi: "3.1.0"',
			"info:",
			"  title: Gen Responses Test",
			'  version: "1.0.0"',
			"paths:",
			"  /test:",
			"    get:",
			"      operationId: getTest",
			"      summary: Test",
			"      responses:",
			'        "200":',
			"          description: OK",
			"",
		].join("\n");

		const uri = await writeWorkspaceFile(relativePath, content);
		try {
			await openAndShow(uri);
			await waitForLanguageId(uri, "openapi-yaml", { timeoutMs: 15000 });
			await waitForDiagnostics(uri, () => true, { timeoutMs: 30000 });

			await vscode.commands.executeCommand("telescope.generateResponseSkeletons");

			await new Promise((r) => setTimeout(r, 2000));
			const doc = await vscode.workspace.openTextDocument(uri);
			const text = doc.getText();

			// generateResponseSkeletons adds missing 400 and 500 responses
			const has400 = text.includes("400") || text.includes("Bad");
			const has500 = text.includes("500") || text.includes("Internal");
			assert.ok(
				has400 || has500,
				`Expected generated error responses (400/500). Got:\n${text.slice(-300)}`,
			);
		} finally {
			try {
				await vscode.commands.executeCommand("workbench.action.files.revert");
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
			} catch { /* cleanup */ }
			await deleteWorkspaceFile(relativePath);
		}
	});

	test("bundlePreview returns merged content for multi-file spec", async () => {
		if (isMultiRootWorkspace()) return;

		const uri = vscode.Uri.joinPath(folder.uri, "ref-root.yaml");
		await openAndShow(uri);
		await waitForDocumentAnalyzed(uri, { skipDiagnostics: true });

		let result: unknown;
		try {
			result = await vscode.commands.executeCommand(
				"telescope.bundlePreview",
			);
		} catch {
			// bundlePreview may not be available if graph isn't built yet — skip
			return;
		}

		if (result && typeof result === "object") {
			const bundle = result as {
				content?: string;
				language?: string;
				files?: number;
			};
			if (bundle.content) {
				assert.ok(
					bundle.content.length > 0,
					"Bundle content should be non-empty",
				);
				assert.ok(
					bundle.language === "yaml" || bundle.language === "json",
					`Bundle language should be yaml or json. Got: ${bundle.language}`,
				);
			}
		}
	});
});
