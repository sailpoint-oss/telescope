/**
 * E2E Tests: Custom OpenAPI rules via Bun sidecar
 *
 * Validates that custom TypeScript rules registered in .telescope/config.yaml
 * produce diagnostics through the Bun sidecar pipeline.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	diagCode,
	ensureSidecarWorkspaceReady,
	isSidecarWorkspace,
	openAndShow,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Sidecar: Custom OpenAPI Rules", () => {
	let folder: vscode.WorkspaceFolder;
	let sidecarAvailable = false;

	suiteSetup(async function () {
		if (!isSidecarWorkspace()) return;
		({ folder, sidecarAvailable } = await ensureSidecarWorkspaceReady({
			skipSuiteIfUnavailable: this,
		}));
	});

	test("Invalid file triggers custom-operation-summary diagnostic", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/test-missing-summary.yaml",
		);
		await openAndShow(fileUri);
		await waitForDiagnostics(fileUri, (d) => d.length > 0, { timeoutMs: 120000 });

		let diagnostics: vscode.Diagnostic[];
		try {
			diagnostics = await waitForDiagnostics(
				fileUri,
				(d) =>
					d.some(
						(diag) =>
							diagCode(diag) === "custom-operation-summary" ||
							diag.message.toLowerCase().includes("summary"),
					),
				{ timeoutMs: 180000 },
			);
		} catch (err) {
			const current = vscode.languages.getDiagnostics(fileUri);
			assert.fail(
				`Timed out waiting for summary diagnostics: ${String(err)}\n` +
					`Current diagnostics: ${current.map((d) => `${diagCode(d)}:${d.source ?? "unknown"}:${d.message}`).join(" | ")}`,
			);
			return;
		}

		const customDiags = diagnostics.filter(
			(d) => diagCode(d) === "custom-operation-summary",
		);
		assert.ok(
			customDiags.length > 0 ||
				diagnostics.some((d) => d.message.toLowerCase().includes("summary")),
			`Should have summary-related diagnostics. Got: ${diagnostics.map((d) => `${diagCode(d)}:${d.message}`).join(" | ")}`,
		);
		assert.ok(
			customDiags.some((d) => d.message.includes("summary")),
			"Diagnostic message should mention 'summary'",
		);
	});

	test("Valid file has no custom-operation-summary diagnostics", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/custom-openapi-valid.yaml",
		);
		await openAndShow(fileUri);
		await waitForDiagnostics(fileUri, () => true, { timeoutMs: 60000 });

		const diagnostics = vscode.languages.getDiagnostics(fileUri);
		const customDiags = diagnostics.filter(
			(d) => diagCode(d) === "custom-operation-summary",
		);
		assert.strictEqual(
			customDiags.length,
			0,
			`Valid file should have no custom-operation-summary diagnostics. Found: ${customDiags.map((d) => d.message).join(", ")}`,
		);
	});
});
