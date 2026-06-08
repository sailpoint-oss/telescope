/**
 * E2E Tests: Custom OpenAPI rules via Bun sidecar
 *
 * Validates that custom TypeScript rules registered in .telescope/config.yaml
 * produce diagnostics through the Bun sidecar pipeline.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	ensureSidecarWorkspaceReady,
	isSidecarWorkspace,
	skipSidecarSuiteIfUnsupported,
	openAndShow,
	waitForDiagnostics,
	waitForSidecarAvailable,
} from "./utils/e2e-helpers";

suite("Sidecar: Custom OpenAPI Rules", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async function () {
		if (!isSidecarWorkspace()) return;
		if (skipSidecarSuiteIfUnsupported(this)) return;
		({ folder } = await ensureSidecarWorkspaceReady({
			skipSuiteIfUnavailable: this,
		}));
	});

	test("Invalid file produces summary-related custom diagnostics", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/test-missing-summary.yaml",
		);
		await openAndShow(fileUri);
		await waitForDiagnostics(fileUri, (d) => d.length > 0, { timeoutMs: 120000 });

		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) =>
				d.some(
					(diag) =>
						diag.source === "telescope-custom" &&
						diag.message.toLowerCase().includes("summary"),
				),
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
			`Expected at least one custom sidecar diagnostic. Got: ${diagnostics.map((d) => `${d.source ?? "unknown"}:${d.message}`).join(" | ")}`,
		);
		assert.ok(
			info.available,
			"Sidecar should stay available while custom diagnostics are published",
		);
	});

	test("Valid file has no summary-related custom diagnostics", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/custom-openapi-valid.yaml",
		);
		await openAndShow(fileUri);
		await waitForDiagnostics(fileUri, () => true, { timeoutMs: 60000 });

		const diagnostics = vscode.languages.getDiagnostics(fileUri);
		const customDiags = diagnostics.filter(
			(d) =>
				d.source === "telescope-custom" &&
				d.message.toLowerCase().includes("summary"),
		);
		assert.strictEqual(
			customDiags.length,
			0,
			`Valid file should have no summary-related custom diagnostics. Found: ${customDiags.map((d) => d.message).join(", ")}`,
		);
	});
});
