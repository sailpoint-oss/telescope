/**
 * E2E Tests: Multi-file $ref behavior in sidecar workspace
 *
 * Validates cross-file resolution behavior for version-isolated refs and
 * path parameter fragments loaded via external path-item references.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	deleteWorkspaceFile,
	diagCode,
	getTestApi,
	isSidecarWorkspace,
	openAndShow,
	waitForSidecarReady,
	waitForDiagnostics,
	writeWorkspaceFile,
} from "./utils/e2e-helpers";

suite("Sidecar: Multi-file Refs", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async () => {
		if (!isSidecarWorkspace()) return;
		await activateExtension();
		const api = getTestApi();
		await api.waitForSessionsRunning(120000);
		const f = vscode.workspace.workspaceFolders?.[0];
		assert.ok(f, "Should have a workspace folder");
		folder = f;
		await waitForSidecarReady(folder);
	});

	test("Version-isolated external $ref resolves without unresolved-ref diagnostics", async () => {
		if (!isSidecarWorkspace()) return;

		const otherFileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/test-multi-file-refs/version-ref-isolation-other.yaml",
		);
		await openAndShow(otherFileUri);
		await waitForDiagnostics(otherFileUri, () => true, { timeoutMs: 120000 });

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/test-multi-file-refs/version-ref-isolation-main.yaml",
		);
		await openAndShow(fileUri);
		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) => !d.some((diag) => diagCode(diag) === "unresolved-ref"),
			{ timeoutMs: 120000 },
		);

		const unresolvedRefs = diagnostics.filter(
			(d) => diagCode(d) === "unresolved-ref",
		);
		assert.strictEqual(
			unresolvedRefs.length,
			0,
			`version-ref-isolation should not have unresolved-ref diagnostics. Got: ${diagnostics.map((d) => `${diagCode(d)}:${d.message}`).join("; ")}`,
		);
	});

	test("Path parameters declared via external path fragment stay aligned", async () => {
		if (!isSidecarWorkspace()) return;

		const relativePath = "openapi/e2e-path-params-with-ref.yaml";
		const uri = await writeWorkspaceFile(
			relativePath,
			[
				'openapi: "3.2.0"',
				"x-sailpoint-api:",
				"  version: v2025",
				"  audience: external-public",
				"info:",
				"  title: Path Param Ref E2E",
				'  version: "1.0.0"',
				"paths:",
				"  /items/{id}:",
				'    $ref: "./test-multi-file-refs/path-params-with-ref.yaml"',
				"",
			].join("\n"),
		);

		try {
			await openAndShow(uri);
			await waitForDiagnostics(uri, () => true, { timeoutMs: 120000 });

			const diagnostics = vscode.languages.getDiagnostics(uri);
			const pathParamMismatches = diagnostics.filter(
				(d) => diagCode(d) === "path-params",
			);
			assert.strictEqual(
				pathParamMismatches.length,
				0,
				`Expected no path-params mismatch for external path fragment. Got: ${diagnostics.map((d) => `${diagCode(d)}:${d.message}`).join("; ")}`,
			);
		} finally {
			await deleteWorkspaceFile(relativePath);
		}
	});
});
