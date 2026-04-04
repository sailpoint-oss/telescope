/**
 * E2E Tests: Sidecar lifecycle — startup, diagnostic refresh, hot-reload
 *
 * Validates that the Bun sidecar starts, produces diagnostics,
 * and re-analyzes after editing a fixture file.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	ensureWorkspaceTextDocumentMatches,
	ensureSidecarWorkspaceReady,
	getTestApi,
	isSidecarWorkspace,
	openAndShow,
	waitForDiagnostics,
	waitForLanguageId,
	waitForSidecarAvailable,
} from "./utils/e2e-helpers";

suite("Sidecar: Lifecycle", () => {
	let folder: vscode.WorkspaceFolder;
	let sidecarAvailable = false;

	suiteSetup(async function () {
		if (!isSidecarWorkspace()) return;
		({ folder, sidecarAvailable } = await ensureSidecarWorkspaceReady({
			skipSuiteIfUnavailable: this,
		}));
	});

	test("Sidecar reports configured and available after startup", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/test-missing-summary.yaml",
		);
		await openAndShow(fileUri);

		const info = await waitForSidecarAvailable(fileUri, {
			timeoutMs: 120000,
		});

		assert.ok(info.configured, "Sidecar should be configured for the sidecar workspace");
		assert.ok(
			info.available,
			"Sidecar should report available after the startup witness succeeds",
		);
	});

	test("Editing a file keeps sidecar available after save and restore", async () => {
		if (!isSidecarWorkspace()) return;

		const editedUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/custom-openapi-valid.yaml",
		);
		const originalDoc = await openAndShow(editedUri);
		const originalText = originalDoc.getText();
		const editedText = `${originalText}\n# lifecycle sidecar ping\n`;

		try {
			const editedDoc = await ensureWorkspaceTextDocumentMatches(
				editedUri,
				editedText,
			);
			await editedDoc.save();
			const editedSidecar = await waitForSidecarAvailable(editedUri, {
				timeoutMs: 120000,
			});
			assert.ok(
				editedSidecar.available,
				"Sidecar should remain available after saving an edited fixture",
			);

			const restoredDoc = await ensureWorkspaceTextDocumentMatches(
				editedUri,
				originalText,
			);
			await restoredDoc.save();
			const restoredSidecar = await waitForSidecarAvailable(editedUri, {
				timeoutMs: 120000,
			});
			assert.ok(
				restoredSidecar.available,
				"Sidecar should still be available after restoring the edited fixture",
			);
		} finally {
			try {
				await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
			} catch {
				// best effort
			}
			try {
				await vscode.workspace.fs.writeFile(
					editedUri,
					Buffer.from(originalText, "utf-8"),
				);
			} catch {
				// best effort
			}
		}
	});

	test("Sidecar surfaces representative custom diagnostics through the extension", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/test-missing-summary.yaml",
		);

		// Close any stale editor for this file so that re-opening triggers a
		// fresh didOpen -> full reparse cycle. This guarantees the sidecar
		// analyzer runs with the sidecar already available, even if earlier
		// tests opened the file before the sidecar had finished starting.
		try {
			await vscode.commands.executeCommand("workbench.action.closeAllEditors");
		} catch {
			// best effort
		}

		await openAndShow(fileUri);

		// Wait for language-ID reclassification (yaml -> openapi-yaml) to
		// settle before triggering a reparse. Without this, the trivial
		// edit can race with the reclassification close/reopen cycle and
		// the sidecar analyzer may not run for the final document state.
		await waitForLanguageId(fileUri, "openapi-yaml", { timeoutMs: 30000 });

		// Make a trivial edit and undo to force tree-sitter to reparse the
		// document, ensuring all analyzers (including the sidecar) re-run.
		const trivialEdit = new vscode.WorkspaceEdit();
		trivialEdit.insert(fileUri, new vscode.Position(0, 0), " ");
		await vscode.workspace.applyEdit(trivialEdit);
		await vscode.commands.executeCommand("undo");

		const customPredicate = (d: vscode.Diagnostic[]) =>
			d.some(
				(diag) =>
					diag.source === "telescope-custom" &&
					diag.message.toLowerCase().includes("summary"),
			);

		let diagnostics: vscode.Diagnostic[];
		try {
			diagnostics = await waitForDiagnostics(fileUri, customPredicate, {
				timeoutMs: 60000,
			});
		} catch {
			// Fallback: force re-analysis via the diagnosticRefresh command,
			// then give the sidecar another window to produce results.
			const api = getTestApi();
			await api.requestDiagnosticRefresh?.(fileUri);
			diagnostics = await waitForDiagnostics(fileUri, customPredicate, {
				timeoutMs: 120000,
			});
		}

		const info = await waitForSidecarAvailable(fileUri, { timeoutMs: 120000 });
		const customDiags = diagnostics.filter(
			(d) =>
				d.source === "telescope-custom" &&
				d.message.toLowerCase().includes("summary"),
		);
		assert.ok(
			customDiags.length > 0,
			`Expected representative custom diagnostics through the sidecar. Got: ${diagnostics.map((d) => `${d.source ?? "unknown"}:${d.message}`).join(" | ")}`,
		);
		assert.ok(
			info.available,
			"Sidecar should remain available while representative custom diagnostics are published",
		);
	});
});
