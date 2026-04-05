/**
 * E2E Tests: Generic (non-OpenAPI) rules via Bun sidecar
 *
 * Validates that generic TypeScript rules registered in additionalValidation
 * produce diagnostics for matched YAML files through the Bun sidecar.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	ensureSidecarWorkspaceReady,
	isSidecarWorkspace,
	openAndShow,
	waitForDiagnostics,
	waitForSidecarAvailable,
} from "./utils/e2e-helpers";

suite("Sidecar: Generic Rules", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async function () {
		if (!isSidecarWorkspace()) return;
		({ folder } = await ensureSidecarWorkspaceReady({
			skipSuiteIfUnavailable: this,
		}));
	});

	test("Invalid generic file produces version-related custom diagnostics", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"custom/custom-generic-invalid.yaml",
		);
		await openAndShow(fileUri);
		await waitForDiagnostics(fileUri, (d) => d.length > 0, { timeoutMs: 120000 });

		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) =>
				d.some(
					(diag) =>
						diag.source === "telescope-custom" &&
						diag.message.toLowerCase().includes("version"),
				),
			{ timeoutMs: 180000 },
		);
		const info = await waitForSidecarAvailable(fileUri, { timeoutMs: 120000 });

		const customDiags = diagnostics.filter(
			(d) =>
				d.source === "telescope-custom" &&
				d.message.toLowerCase().includes("version"),
		);
		assert.ok(
			customDiags.length > 0,
			`Expected at least one custom sidecar diagnostic. Got: ${diagnostics.map((d) => `${d.source ?? "unknown"}:${d.message}`).join(" | ")}`,
		);
		assert.ok(
			info.available,
			"Sidecar should stay available while generic custom diagnostics are published",
		);
	});

	test("Valid generic file has no version-related custom diagnostics", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"custom/custom-generic-valid.yaml",
		);
		await openAndShow(fileUri);
		await waitForDiagnostics(fileUri, () => true, { timeoutMs: 60000 });

		const diagnostics = vscode.languages.getDiagnostics(fileUri);
		const customDiags = diagnostics.filter(
			(d) =>
				d.source === "telescope-custom" &&
				d.message.toLowerCase().includes("version"),
		);
		assert.strictEqual(
			customDiags.length,
			0,
			`Valid file should have no version-related custom diagnostics. Found: ${customDiags.map((d) => d.message).join(", ")}`,
		);
	});
});
