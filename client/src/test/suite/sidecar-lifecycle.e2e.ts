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

		await waitForSidecarAvailable(fileUri, { timeoutMs: 120000 });
		await openAndShow(fileUri);
		await waitForLanguageId(fileUri, "openapi-yaml", { timeoutMs: 30000 });

		// Force a didChange cycle so the sidecar re-analyzes the file fresh.
		// Earlier lifecycle tests in this suite already opened and partially
		// analyzed this file; without a content change the diagnostic mux may
		// not re-invoke the sidecar custom-rule analyzer.
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

		// Mirror the strategy from the Custom Rules test suite: wait for
		// ANY diagnostics first (confirming the pipeline is warm), then
		// wait specifically for the sidecar-produced custom diagnostics.
		await waitForDiagnostics(fileUri, (d) => d.length > 0, {
			timeoutMs: 120000,
		});

		const diagnostics = await waitForDiagnostics(
			fileUri,
			customPredicate,
			{ timeoutMs: 180000 },
		);

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
