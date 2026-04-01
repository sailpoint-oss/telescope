/**
 * E2E Tests: sidecar workspace schema fixture compatibility (legacy zod names)
 *
 * These fixtures keep historical "zod" naming, while validation runs through
 * the Go additional JSON Schema pipeline.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	diagCode,
	getTestApi,
	isSidecarWorkspace,
	openAndShow,
	waitForSidecarReady,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Sidecar: Schema Fixture Compatibility (Legacy Zod-Named)", () => {
	let folder: vscode.WorkspaceFolder;
	let sidecarAvailable = false;

	suiteSetup(async () => {
		if (!isSidecarWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
		sidecarAvailable = await waitForSidecarReady(folder);
	});

	test("Invalid legacy zod-named fixture is analyzable", async () => {
		if (!isSidecarWorkspace() || !sidecarAvailable) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"custom/custom-zod-schema-invalid.yaml",
		);
		await openAndShow(fileUri);
		const diagnostics = await waitForDiagnostics(fileUri, () => true, {
			timeoutMs: 120000,
		});
		assert.ok(
			Array.isArray(diagnostics),
			"Invalid legacy zod fixture should be analyzable without crashing diagnostics pipeline",
		);
	});

	test("Valid legacy zod-named fixture has no json-schema errors", async () => {
		if (!isSidecarWorkspace() || !sidecarAvailable) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"custom/custom-zod-schema-valid.yaml",
		);
		await openAndShow(fileUri);

		await waitForDiagnostics(fileUri, () => true, { timeoutMs: 60000 });

		const diagnostics = vscode.languages.getDiagnostics(fileUri);
		const schemaErrors = diagnostics.filter(
			(d) =>
				(d.source?.toLowerCase() === "json-schema" ||
					diagCode(d) === "json-schema") &&
				d.severity === vscode.DiagnosticSeverity.Error,
		);
		assert.strictEqual(
			schemaErrors.length,
			0,
			`Valid legacy zod fixture should have no json-schema errors. Found: ${schemaErrors.map((e) => e.message).join(", ")}`,
		);
	});
});
