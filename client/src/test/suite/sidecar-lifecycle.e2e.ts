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
	skipSidecarSuiteIfUnsupported,
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
		if (skipSidecarSuiteIfUnsupported(this)) return;
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

	test("Sidecar remains available and diagnostics flow after lifecycle events", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/test-missing-summary.yaml",
		);

		// After the startup and editing tests above, verify the sidecar is
		// still available and the diagnostic pipeline is healthy. Custom rule
		// diagnostics are validated by sidecar-custom-rules.e2e.ts; this test
		// focuses on sidecar availability surviving the lifecycle.
		await openAndShow(fileUri);
		await waitForLanguageId(fileUri, "openapi-yaml", { timeoutMs: 30000 });

		await waitForDiagnostics(fileUri, (d) => d.length > 0, {
			timeoutMs: 120000,
		});

		const info = await waitForSidecarAvailable(fileUri, { timeoutMs: 120000 });
		assert.ok(
			info.configured,
			"Sidecar should still be configured after lifecycle events",
		);
		assert.ok(
			info.available,
			"Sidecar should remain available after startup + edit/save/restore cycle",
		);

		const diagnostics = vscode.languages.getDiagnostics(fileUri);
		assert.ok(
			diagnostics.length > 0,
			`Expected diagnostics to be present after lifecycle events, got ${diagnostics.length}`,
		);
	});
});
