/**
 * E2E Tests: Additional custom OpenAPI rules via Bun sidecar
 *
 * Validates the require-operationid and yaml-key-order custom rules
 * registered in .telescope/config.yaml.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
	activateExtension,
	delay,
	diagCode,
	getTestApi,
	isSidecarWorkspace,
	openAndShow,
	waitForDiagnostics,
} from "./utils/e2e-helpers";

suite("Sidecar: Additional OpenAPI Rules", () => {
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

	test("Missing operationId triggers custom-require-operationid diagnostic", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/test-missing-operationid.yaml",
		);
		await openAndShow(fileUri);

		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) => d.some((diag) => diagCode(diag) === "custom-require-operationid"),
			{ timeoutMs: 120000 },
		);

		const opIdDiags = diagnostics.filter(
			(d) => diagCode(d) === "custom-require-operationid",
		);
		assert.ok(
			opIdDiags.length > 0,
			`Should have custom-require-operationid diagnostics. Got codes: ${diagnostics.map((d) => diagCode(d)).join(", ")}`,
		);
		assert.ok(
			opIdDiags.some((d) => d.message.toLowerCase().includes("operationid")),
			"Diagnostic message should mention 'operationId'",
		);
	});

	test("Out-of-order keys trigger custom-yaml-key-order diagnostic", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/test-key-order.yaml",
		);
		await openAndShow(fileUri);

		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) => d.some((diag) => diagCode(diag) === "custom-yaml-key-order"),
			{ timeoutMs: 120000 },
		);

		const keyOrderDiags = diagnostics.filter(
			(d) => diagCode(d) === "custom-yaml-key-order",
		);
		assert.ok(
			keyOrderDiags.length > 0,
			`Should have custom-yaml-key-order diagnostics. Got codes: ${diagnostics.map((d) => diagCode(d)).join(", ")}`,
		);
	});
});
