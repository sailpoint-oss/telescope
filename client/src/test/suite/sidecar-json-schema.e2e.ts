/**
 * E2E Tests: JSON Schema validation for non-OpenAPI files
 *
 * Validates that JSON Schema files registered in additionalValidation
 * produce diagnostics for non-conforming YAML files.
 * Note: JSON Schema validation runs through the Go server's additional
 * validation pipeline, not the Bun sidecar, but it shares the same
 * .telescope/config.yaml and test-files workspace.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	delay,
	getTestApi,
	isSidecarWorkspace,
	openAndShow,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Sidecar: JSON Schema Validation", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (!isSidecarWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
		await delay(5000);
	});

	test("Invalid JSON Schema file produces validation errors", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"custom/custom-json-schema-invalid.yaml",
		);
		await openAndShow(fileUri);

		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) =>
				d.some((diag) => diag.severity === vscode.DiagnosticSeverity.Error),
			{ timeoutMs: 120000 },
		);

		const errors = diagnostics.filter(
			(d) => d.severity === vscode.DiagnosticSeverity.Error,
		);
		assert.ok(
			errors.length > 0,
			`Invalid JSON Schema file should have errors. Got: ${diagnostics.map((d) => d.message).join(", ")}`,
		);
	});

	test("Valid JSON Schema file has no errors", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"custom/custom-json-schema-valid.yaml",
		);
		await openAndShow(fileUri);

		await waitForDiagnostics(fileUri, () => true, { timeoutMs: 60000 });
		await delay(3000);

		const diagnostics = vscode.languages.getDiagnostics(fileUri);
		const errors = diagnostics.filter(
			(d) => d.severity === vscode.DiagnosticSeverity.Error,
		);
		assert.strictEqual(
			errors.length,
			0,
			`Valid JSON Schema file should have no errors. Found: ${errors.map((e) => e.message).join(", ")}`,
		);
	});
});
