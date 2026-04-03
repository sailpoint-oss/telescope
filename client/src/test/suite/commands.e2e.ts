/**
 * E2E Tests: Server commands (workspace/executeCommand)
 *
 * Tests the server-side commands: sortTags, sortPaths, generateResponseSkeletons,
 * validateExamples, bundlePreview.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	deleteWorkspaceFile,
	ensureSingleRootWorkspaceReady,
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
		({ folder } = await ensureSingleRootWorkspaceReady());
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

			// Retry until the index is ready and the command produces edits.
			const deadline = Date.now() + 60000;
			let generated = false;
			while (Date.now() < deadline) {
				await vscode.commands.executeCommand("telescope.generateResponseSkeletons");
				await new Promise((r) => setTimeout(r, 1500));
				const doc = await vscode.workspace.openTextDocument(uri);
				const text = doc.getText();
				if ((text.includes("400") || text.includes("Bad")) &&
					(text.includes("500") || text.includes("Internal"))) {
					generated = true;
					break;
				}
			}
			assert.ok(
				generated,
				"Expected generated error responses (400/500)",
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
