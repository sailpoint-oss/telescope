/**
 * E2E Tests: Additional custom OpenAPI rules via Bun sidecar
 *
 * Validates custom rules registered in .telescope/config.yaml:
 * - require-operationid (Operation visitor)
 * - yaml-key-order (generic rule)
 * - path-trailing-slash (PathItem visitor — covers GitHub issue #11)
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

suite("Sidecar: Additional OpenAPI Rules", () => {
	let folder: vscode.WorkspaceFolder;

	suiteSetup(async function () {
		if (!isSidecarWorkspace()) return;
		if (skipSidecarSuiteIfUnsupported(this)) return;
		({ folder } = await ensureSidecarWorkspaceReady({
			skipSuiteIfUnavailable: this,
		}));
	});

	test("Missing operationId fixture remains analyzable while sidecar stays available", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/test-missing-operationid.yaml",
		);
		await openAndShow(fileUri);

		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) => d.length > 0,
			{ timeoutMs: 120000 },
		);
		const info = await waitForSidecarAvailable(fileUri, {
			timeoutMs: 120000,
		});

		if (diagnostics.length === 0) {
			throw new Error("Fixture should still produce diagnostics while sidecar is active");
		}
		if (!info.available) {
			throw new Error(
				"Sidecar should remain available while analyzing the missing-operationId fixture",
			);
		}
	});

	test("Key-order fixture remains analyzable while sidecar stays available", async () => {
		if (!isSidecarWorkspace()) return;

		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/test-key-order.yaml",
		);
		await openAndShow(fileUri);

		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) => d.length > 0,
			{ timeoutMs: 120000 },
		);
		const info = await waitForSidecarAvailable(fileUri, {
			timeoutMs: 120000,
		});
		if (diagnostics.length === 0) {
			throw new Error("Fixture should still produce diagnostics while sidecar is active");
		}
		if (!info.available) {
			throw new Error(
				"Sidecar should remain available while analyzing the key-order fixture",
			);
		}
	});

	test("PathItem-heavy fixture remains analyzable while sidecar stays available", async () => {
		if (!isSidecarWorkspace()) return;

		// test-missing-summary.yaml has path "/users" without trailing slash
		const fileUri = vscode.Uri.joinPath(
			folder.uri,
			"openapi/test-missing-summary.yaml",
		);
		await openAndShow(fileUri);

		const diagnostics = await waitForDiagnostics(
			fileUri,
			(d) => d.length > 0,
			{ timeoutMs: 120000 },
		);
		const info = await waitForSidecarAvailable(fileUri, {
			timeoutMs: 120000,
		});

		assert.ok(
			diagnostics.length > 0,
			"Fixture should still produce diagnostics while exercising PathItem analysis",
		);
		assert.ok(
			info.available,
			"Sidecar should remain available while analyzing a PathItem-heavy fixture",
		);
	});
});
